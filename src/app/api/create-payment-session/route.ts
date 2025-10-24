import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const PAYMONGO_SECRET_KEY = process.env.PAYMONGO_SECRET_KEY;
const PAYPAL_CLIENT_ID = process.env.PAYPAL_CLIENT_ID;
const PAYPAL_CLIENT_SECRET = process.env.PAYPAL_CLIENT_SECRET;
const PAYPAL_ENVIRONMENT = process.env.PAYPAL_ENVIRONMENT || 'sandbox';
const PAYPAL_BASE_URL = PAYPAL_ENVIRONMENT === 'sandbox' 
  ? 'https://api-m.sandbox.paypal.com' 
  : 'https://api-m.paypal.com';

async function getPayPalAccessToken() {
  const auth = Buffer.from(`${PAYPAL_CLIENT_ID}:${PAYPAL_CLIENT_SECRET}`).toString('base64');
  const response = await fetch(`${PAYPAL_BASE_URL}/v1/oauth2/token`, {
    method: 'POST',
    headers: {
      'Authorization': `Basic ${auth}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: 'grant_type=client_credentials'
  });
  const data = await response.json();
  return data.access_token;
}

async function createPayMongoSession(sessionData: any) {
  const {
    amount,
    currency,
    user_item_ids,
    success_url,
    cancel_url,
    metadata = {},
    payment_type = 'order',
    lineItems = [],
  } = sessionData;

  const idsCsv = Array.isArray(user_item_ids) ? user_item_ids.join(',') : '';

  const checkoutData = {
    data: {
      attributes: {
        send_email_receipt: true,
        show_description: true,
        show_line_items: true,
        line_items: lineItems,
        payment_method_types: ['gcash', 'paymaya', 'card'],
        success_url,
        cancel_url,
        description: `Payment for ${lineItems.length} item(s)`,
        metadata: {
          ...metadata,
          user_item_ids: idsCsv,
          payment_type,
        },
      },
    },
  };

  const response = await fetch('https://api.paymongo.com/v1/checkout_sessions', {
    method: 'POST',
    headers: {
      'Authorization': `Basic ${Buffer.from(PAYMONGO_SECRET_KEY + ':').toString('base64')}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(checkoutData)
  });

  if (!response.ok) {
    const errorData = await response.json();
    throw new Error(`PayMongo API error: ${JSON.stringify(errorData)}`);
  }

  const result = await response.json();
  return {
    sessionId: result.data.id,
    checkoutUrl: result.data.attributes.checkout_url
  };
}

async function createPayPalOrder(orderData: any) {
  const {
    amount,
    user_item_ids,
    success_url,
    cancel_url,
    items = [],
  } = orderData;

  const accessToken = await getPayPalAccessToken();
  const idsCsv = Array.isArray(user_item_ids) ? user_item_ids.join(',') : '';
  const usdAmount = Number((Number(amount || 0) / 50).toFixed(2));

  const paypalOrderData = {
    intent: 'CAPTURE',
    purchase_units: [
      {
        reference_id: idsCsv || 'order',
        custom_id: idsCsv || 'order',
        description: `Payment for ${items.length} item(s)`,
        amount: {
          currency_code: 'USD',
          value: usdAmount.toFixed(2),
          breakdown: {
            item_total: { currency_code: 'USD', value: usdAmount.toFixed(2) }
          }
        },
        items: items.map((item: any) => ({
          name: item.name,
          quantity: String(item.quantity),
          unit_amount: { currency_code: 'USD', value: item.unit_amount }
        })),
      },
    ],
    application_context: {
      brand_name: 'GrandLink',
      landing_page: 'NO_PREFERENCE',
      user_action: 'PAY_NOW',
      return_url: success_url,
      cancel_url: cancel_url,
    },
  };

  const response = await fetch(`${PAYPAL_BASE_URL}/v2/checkout/orders`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(paypalOrderData)
  });

  if (!response.ok) {
    const errorData = await response.text();
    throw new Error(`PayPal API error: ${errorData}`);
  }

  const result = await response.json();
  const approvalUrl = result.links?.find((link: any) => link.rel === 'approve')?.href;

  return {
    sessionId: result.id,
    checkoutUrl: approvalUrl
  };
}

export async function POST(request: NextRequest) {
  try {
    const {
      user_item_ids,
      payment_method = 'paymongo',
      payment_type = 'reservation',
      success_url,
      cancel_url,
      voucher,
    } = await request.json();

    const ids: string[] = Array.isArray(user_item_ids) ? user_item_ids : [];

    if (ids.length === 0 || !success_url || !cancel_url) {
      return NextResponse.json({ error: 'Missing required data' }, { status: 400 });
    }

    const { data: rows, error: itemsErr } = await supabase
      .from('user_items')
      .select('id, quantity, meta, product_id')
      .in('id', ids);

    if (itemsErr || !rows || rows.length === 0) {
      return NextResponse.json({ error: 'Items not found' }, { status: 404 });
    }

    const productIds = Array.from(new Set(rows.map((r) => r.product_id)));
    const { data: products, error: prodErr } = await supabase
      .from('products')
      .select('id, name, price')
      .in('id', productIds);

    if (prodErr) {
      return NextResponse.json({ error: 'Products fetch failed' }, { status: 500 });
    }

    const productMap = new Map((products || []).map((p) => [p.id, p]));
    let subtotal = 0;
    let addonsTotal = 0;

    const itemDetails = rows.map((r) => {
      const p = productMap.get(r.product_id);
      const unit = Number(p?.price || 0);
      const qty = Number(r.quantity || 1);
      const addons: any[] = Array.isArray(r.meta?.addons) ? r.meta.addons : [];
      const lineAddons = addons.reduce((s, a) => s + Number(a?.fee || 0), 0) * qty;
      const lineSubtotal = unit * qty;
      subtotal += lineSubtotal;
      addonsTotal += lineAddons;
      return { 
        id: r.id, 
        name: p?.name || 'Product',
        qty, 
        unit, 
        lineSubtotal, 
        lineAddons,
        addons 
      };
    });

    let preDiscount = subtotal + addonsTotal;
    let appliedDiscount = 0;
    
    if (voucher?.type === 'percent') {
      appliedDiscount = preDiscount * (Number(voucher.value || 0) / 100);
    } else if (voucher?.type === 'amount') {
      appliedDiscount = Number(voucher.value || 0);
    }
    appliedDiscount = Math.min(appliedDiscount, preDiscount);
    
    const afterDiscount = Math.max(0, preDiscount - appliedDiscount);
    const reservationFee = 500;
    const totalAmount = afterDiscount + reservationFee;

    // Build PayMongo line items
    const payMongoLineItems: any[] = [];
    
    // Add each product
    itemDetails.forEach(item => {
      const productPrice = item.lineSubtotal + item.lineAddons;
      payMongoLineItems.push({
        name: item.name,
        quantity: item.qty,
        amount: Math.round((productPrice / item.qty) * 100),
        currency: 'PHP',
        description: item.addons.length > 0 
          ? `Includes: ${item.addons.map((a: any) => a.label).join(', ')}`
          : 'Product'
      });
    });

    // Add discount as negative line item if applicable
    if (appliedDiscount > 0) {
      payMongoLineItems.push({
        name: `Discount (${voucher?.code || 'Applied'})`,
        quantity: 1,
        amount: -Math.round(appliedDiscount * 100),
        currency: 'PHP',
        description: voucher?.type === 'percent' 
          ? `${voucher.value}% off` 
          : `₱${appliedDiscount.toLocaleString()} off`
      });
    }

    // Add reservation fee
    payMongoLineItems.push({
      name: 'Reservation Fee',
      quantity: 1,
      amount: Math.round(reservationFee * 100),
      currency: 'PHP',
      description: 'One-time reservation fee'
    });

    // Build PayPal items
    const payPalItems: any[] = [];
    itemDetails.forEach(item => {
      const productPrice = item.lineSubtotal + item.lineAddons;
      const usdPrice = Number((productPrice / item.qty / 50).toFixed(2));
      payPalItems.push({
        name: item.name,
        quantity: item.qty,
        unit_amount: usdPrice.toFixed(2)
      });
    });

    // Add reservation fee to PayPal
    payPalItems.push({
      name: 'Reservation Fee',
      quantity: 1,
      unit_amount: Number((reservationFee / 50).toFixed(2)).toFixed(2)
    });

    // Update meta for all items
    for (const r of rows) {
      const item = itemDetails.find(i => i.id === r.id)!;
      await supabase
        .from('user_items')
        .update({
          meta: {
            ...(r.meta || {}),
            voucher_code: voucher?.code || null,
            discount_value: appliedDiscount,
            subtotal,
            addons_total: addonsTotal,
            total_amount: totalAmount,
            reservation_fee: reservationFee,
          },
          updated_at: new Date().toISOString()
        })
        .eq('id', r.id);
    }

    const baseMetadata = {
      user_item_ids: ids.join(','),
      subtotal,
      addons_total: addonsTotal,
      discount_code: voucher?.code || null,
      discount_value: appliedDiscount,
      payment_type,
      reservation_fee: reservationFee,
      total_amount: totalAmount,
    };

    let sessionId: string;
    let checkoutUrl: string;

    if (payment_method === 'paypal') {
      const res = await createPayPalOrder({
        amount: totalAmount,
        user_item_ids: ids,
        success_url,
        cancel_url,
        items: payPalItems,
      });
      sessionId = res.sessionId;
      checkoutUrl = res.checkoutUrl;
    } else {
      const res = await createPayMongoSession({
        amount: totalAmount,
        currency: 'PHP',
        user_item_ids: ids,
        success_url,
        cancel_url,
        payment_type,
        metadata: baseMetadata,
        lineItems: payMongoLineItems,
      });
      sessionId = res.sessionId;
      checkoutUrl = res.checkoutUrl;
    }

    return NextResponse.json({ sessionId, checkoutUrl, success: true });
  } catch (error: any) {
    console.error('Payment session creation error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to create payment session' },
      { status: 500 }
    );
  }
}
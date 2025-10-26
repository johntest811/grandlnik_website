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
      const perUnitAddon = addons.reduce((s, a) => s + Number(a?.fee || 0), 0);
      const lineAddons = perUnitAddon * qty;
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
        addons,
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
    
    const totalLineCents = itemDetails.reduce(
      (sum, item) => sum + Math.round((item.lineSubtotal + item.lineAddons) * 100),
      0
    );
  const discountCents = Math.round(appliedDiscount * 100);
    let allocatedDiscountCents = 0;

    const discountedItems = itemDetails.map((item, index) => {
      const lineCents = Math.round((item.lineSubtotal + item.lineAddons) * 100);
      let itemDiscountCents = 0;

      if (discountCents > 0 && totalLineCents > 0) {
        if (index === itemDetails.length - 1) {
          itemDiscountCents = Math.min(lineCents, discountCents - allocatedDiscountCents);
        } else {
          itemDiscountCents = Math.floor((lineCents * discountCents) / totalLineCents);
          const remainingBudget = discountCents - allocatedDiscountCents;
          if (itemDiscountCents > remainingBudget) {
            itemDiscountCents = remainingBudget;
          }
          if (itemDiscountCents > lineCents) {
            itemDiscountCents = lineCents;
          }
        }
      }

      itemDiscountCents = Math.max(0, itemDiscountCents);
      allocatedDiscountCents += itemDiscountCents;

      const netLineCents = Math.max(0, lineCents - itemDiscountCents);
      const netLine = netLineCents / 100;

      return {
        ...item,
        lineCents,
        itemDiscountCents,
        netLineCents,
        netLine,
      };
    });

    // Adjust for any rounding remainder
    const remainingDiscount = discountCents - allocatedDiscountCents;
    if (remainingDiscount > 0 && discountedItems.length > 0) {
      const lastItem = discountedItems[discountedItems.length - 1];
      const extra = Math.min(remainingDiscount, lastItem.netLineCents);
      lastItem.itemDiscountCents += extra;
      lastItem.netLineCents = Math.max(0, lastItem.netLineCents - extra);
      lastItem.netLine = lastItem.netLineCents / 100;
    }

    const discountedSubtotal = discountedItems.reduce(
      (sum, item) => sum + item.netLine,
      0
    );
    const reservationFee = 500;
    const afterDiscount = Number(discountedSubtotal.toFixed(2));
    const totalAmount = afterDiscount + reservationFee;
    const effectiveDiscount = Number((preDiscount - afterDiscount).toFixed(2));

    const payMongoLineItems: any[] = [];
    discountedItems.forEach((item) => {
      const baseDesc: string[] = [];
      if (item.lineSubtotal > 0) {
        baseDesc.push(`Products: ₱${item.lineSubtotal.toFixed(2)}`);
      }
      if (item.lineAddons > 0) {
        baseDesc.push(`Add-ons: ₱${item.lineAddons.toFixed(2)}`);
      }
      const itemDiscount = Number((item.itemDiscountCents / 100).toFixed(2));
      if (itemDiscount > 0) {
        baseDesc.push(`Discount applied: -₱${itemDiscount.toFixed(2)}`);
      }

      if (!item.qty || item.qty <= 0) {
        const batchTotal = (item.netLineCents / 100).toFixed(2);
        const details = [...baseDesc, `Batch qty: 1`, `Discounted unit price: ₱${batchTotal}`, `Batch total: ₱${batchTotal}`];
        payMongoLineItems.push({
          name: `${item.name} x1${itemDiscount > 0 ? ' (discounted)' : ''}`,
          quantity: 1,
          amount: item.netLineCents,
          currency: 'PHP',
          description: details.join(' | '),
        });
        return;
      }

      const perUnitBaseCents = Math.floor(item.netLineCents / item.qty);
      const remainderUnits = item.netLineCents % item.qty;

      const pushBatch = (batchQty: number, unitCents: number) => {
        if (batchQty <= 0) return;
        const unitPrice = (unitCents / 100).toFixed(2);
        const batchTotal = ((unitCents * batchQty) / 100).toFixed(2);
        const details = [
          `Original qty: ${item.qty}`,
          ...baseDesc,
          `Batch qty: ${batchQty}`,
          `Discounted unit price: ₱${unitPrice}`,
          `Batch total: ₱${batchTotal}`,
        ];
        const labelQty = batchQty === item.qty ? `${batchQty}` : `${batchQty}/${item.qty}`;
        payMongoLineItems.push({
          name: `${item.name} x${labelQty}${itemDiscount > 0 ? ' (discounted)' : ''}`,
          quantity: batchQty,
          amount: unitCents,
          currency: 'PHP',
          description: details.join(' | '),
        });
      };

      const baseQty = item.qty - remainderUnits;
      if (baseQty > 0) {
        pushBatch(baseQty, perUnitBaseCents);
      }
      if (remainderUnits > 0) {
        pushBatch(remainderUnits, perUnitBaseCents + 1);
      }
    });

    if (effectiveDiscount > 0) {
      payMongoLineItems.push({
        name: `Discount (${voucher?.code || 'Applied'})`,
        quantity: 1,
        amount: 0,
        currency: 'PHP',
        description: `Total discount applied: -₱${effectiveDiscount.toFixed(2)}`,
      });
    }

    payMongoLineItems.push({
      name: 'Reservation Fee',
      quantity: 1,
      amount: Math.round(reservationFee * 100),
      currency: 'PHP',
      description: 'One-time reservation fee',
    });

    const payPalItems = discountedItems.map((item) => ({
      name: `${item.name} x${item.qty}`,
      quantity: '1',
      unit_amount: Number((item.netLine / 50).toFixed(2)).toFixed(2),
    }));

    if (effectiveDiscount > 0) {
      payPalItems.push({
        name: `Discount (${voucher?.code || 'Applied'})`,
        quantity: '1',
        unit_amount: '0.00',
      });
    }

    payPalItems.push({
      name: 'Reservation Fee',
      quantity: '1',
      unit_amount: Number((reservationFee / 50).toFixed(2)).toFixed(2),
    });

  const discountedMap = new Map(discountedItems.map((item) => [item.id, item]));

    // Update meta for all items
    for (const r of rows) {
      const item = discountedMap.get(r.id)!;
      await supabase
        .from('user_items')
        .update({
          meta: {
            ...(r.meta || {}),
            voucher_code: voucher?.code || null,
            discount_value: effectiveDiscount,
            subtotal,
            addons_total: addonsTotal,
            total_amount: totalAmount,
            reservation_fee: reservationFee,
            line_discount: item ? Number((item.itemDiscountCents / 100).toFixed(2)) : 0,
            line_total_after_discount: item ? Number(item.netLine.toFixed(2)) : undefined,
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
  discount_value: effectiveDiscount,
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
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
        payment_method_types: ['gcash', 'paymaya'],
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
    const lineTotalsCents = itemDetails.map((item) =>
      Math.round((item.lineSubtotal + item.lineAddons) * 100)
    );
    const totalLineCents = lineTotalsCents.reduce((acc, cents) => acc + cents, 0);
    const appliedDiscountCents = Math.round(appliedDiscount * 100);
    const discountAllocations: number[] = lineTotalsCents.map(() => 0);

    if (totalLineCents > 0 && appliedDiscountCents > 0) {
      let remaining = appliedDiscountCents;
      lineTotalsCents.forEach((line, idx) => {
        if (idx === lineTotalsCents.length - 1) {
          discountAllocations[idx] = remaining;
          remaining = 0;
        } else {
          const proportional = Math.floor((line * appliedDiscountCents) / totalLineCents);
          const allocation = Math.min(proportional, remaining);
          discountAllocations[idx] = allocation;
          remaining -= allocation;
        }
      });
      if (remaining > 0) {
        discountAllocations[discountAllocations.length - 1] += remaining;
      }
    }

    const payMongoLineItems: any[] = [];
    const displayLineItems: any[] = [];
    let computedProductTotalCents = 0;

    // Separate product total (without addons) and addon items
    itemDetails.forEach((item, idx) => {
      const grossCents = lineTotalsCents[idx] || 0;
      const itemDiscountCents = discountAllocations[idx] || 0;
      
      // Calculate product price WITHOUT addons
      const productOnlyLineSubtotal = item.lineSubtotal; // This is product price * qty
      const productOnlyCents = Math.round(productOnlyLineSubtotal * 100);
      
      // Allocate discount proportionally to product only
      const productDiscountCents = item.lineAddons === 0 
        ? itemDiscountCents 
        : Math.round((itemDiscountCents * productOnlyCents) / grossCents);
      
      const netProductCents = Math.max(0, productOnlyCents - productDiscountCents);
      const unitNetCents = item.qty > 0 ? Math.round(netProductCents / item.qty) : 0;
      computedProductTotalCents += unitNetCents * item.qty;

      const originalUnitPrice = item.qty > 0 ? (productOnlyCents / item.qty) / 100 : 0;
      const netUnitPrice = unitNetCents / 100;
      const discountValue = productDiscountCents / 100;

      const descriptionParts: string[] = [];
      descriptionParts.push(`Qty: ${item.qty}`);
      descriptionParts.push(`Unit after discount: ₱${netUnitPrice.toFixed(2)}`);
      if (productDiscountCents > 0) {
        descriptionParts.push(`Discount applied: ₱${discountValue.toFixed(2)}`);
      }

      const baseLabel = `${item.name} @ ₱${netUnitPrice.toFixed(2)}`;
      const nameWithContext = productDiscountCents > 0
        ? `${baseLabel} (Discounted)`
        : baseLabel;

      payMongoLineItems.push({
        name: nameWithContext,
        quantity: item.qty,
        amount: unitNetCents,
        currency: 'PHP',
        description: descriptionParts.join(' | ')
      });

      displayLineItems.push({
        type: 'product',
        name: item.name,
        quantity: item.qty,
        original_unit_price: Number(originalUnitPrice.toFixed(2)),
        unit_price: Number(netUnitPrice.toFixed(2)),
        discount_value: Number(discountValue.toFixed(2)),
        line_total: Number((netProductCents / 100).toFixed(2))
      });

      // Add color customization as separate line item if exists
      const colorAddon = item.addons.find((a: any) => a.key === 'color_customization');
      if (colorAddon) {
        const colorAddonPrice = 2500; // Fixed price for color customization
        const colorAddonCents = colorAddonPrice * 100;
        computedProductTotalCents += colorAddonCents;

        payMongoLineItems.push({
          name: 'Color Addon',
          quantity: 1,
          amount: colorAddonCents,
          currency: 'PHP',
          description: `Color customization: ${colorAddon.value || 'Custom color'}`
        });

        displayLineItems.push({
          type: 'addon',
          name: 'Color Addon',
          quantity: 1,
          unit_price: colorAddonPrice,
          line_total: colorAddonPrice
        });
      }
    });

    const expectedProductTotalCents = Math.round(afterDiscount * 100);
    const reservationFeeBase = 500;
    const reservationFeeCents = Math.round(reservationFeeBase * 100);

    const reservationLineItem = {
      name: 'Reservation Fee',
      quantity: 1,
      amount: reservationFeeCents,
      currency: 'PHP',
      description: 'One-time reservation fee'
    };
    payMongoLineItems.push(reservationLineItem);
    displayLineItems.push({
      type: 'reservation_fee',
      name: 'Reservation Fee',
      quantity: 1,
      unit_price: Number((reservationFeeCents / 100).toFixed(2)),
      line_total: Number((reservationFeeCents / 100).toFixed(2))
    });

    const expectedTotalCents = expectedProductTotalCents + reservationFeeCents;
    let currentTotalCents = computedProductTotalCents + reservationFeeCents;
    let totalDiffCents = expectedTotalCents - currentTotalCents;

    if (totalDiffCents !== 0) {
      const adjustedFeeCents = Math.max(0, reservationFeeCents + totalDiffCents);
      reservationLineItem.amount = adjustedFeeCents;
      const feeDisplay = displayLineItems[displayLineItems.length - 1];
      feeDisplay.unit_price = Number((adjustedFeeCents / 100).toFixed(2));
      feeDisplay.line_total = Number((adjustedFeeCents / 100).toFixed(2));
      currentTotalCents = computedProductTotalCents + adjustedFeeCents;
    }

    if (appliedDiscountCents > 0) {
      const discountLabel = voucher?.code ? `Discount (${voucher.code})` : 'Discount';
      const discountCurrencyDisplay = (appliedDiscountCents / 100).toFixed(2);
      payMongoLineItems.push({
        name: `${discountLabel} -₱${discountCurrencyDisplay}`,
        quantity: 1,
        amount: 0,
        currency: 'PHP',
        description: `Discount applied: -₱${discountCurrencyDisplay}`
      });
      displayLineItems.push({
        type: 'discount',
        name: `${discountLabel} -₱${discountCurrencyDisplay}`,
        quantity: 1,
        unit_price: -Number((appliedDiscountCents / 100).toFixed(2)),
        line_total: -Number((appliedDiscountCents / 100).toFixed(2))
      });
    }

    const reservationFeeCharged = reservationLineItem.amount / 100;
    const totalAmount = afterDiscount + reservationFeeCharged;

    const payPalItems: any[] = [];
    itemDetails.forEach((item, idx) => {
      const grossCents = lineTotalsCents[idx] || 0;
      const itemDiscountCents = discountAllocations[idx] || 0;
      
      // Calculate product price WITHOUT addons for PayPal
      const productOnlyLineSubtotal = item.lineSubtotal;
      const productOnlyCents = Math.round(productOnlyLineSubtotal * 100);
      const productDiscountCents = item.lineAddons === 0 
        ? itemDiscountCents 
        : Math.round((itemDiscountCents * productOnlyCents) / grossCents);
      
      const netProductValue = Math.max(0, (productOnlyCents - productDiscountCents) / 100);
      const unitNetValue = item.qty > 0 ? netProductValue / item.qty : 0;
      const usdUnit = Number((unitNetValue / 50).toFixed(2));
      
      payPalItems.push({
        name: productDiscountCents > 0 ? `${item.name} (Discounted)` : item.name,
        quantity: item.qty,
        unit_amount: usdUnit.toFixed(2)
      });

      // Add color addon as separate PayPal item if exists
      const colorAddon = item.addons.find((a: any) => a.key === 'color_customization');
      if (colorAddon) {
        const colorAddonUsd = Number((2500 / 50).toFixed(2));
        payPalItems.push({
          name: 'Color Addon',
          quantity: 1,
          unit_amount: colorAddonUsd.toFixed(2)
        });
      }
    });

    const reservationFeeUsd = Number((reservationFeeCharged / 50).toFixed(2));
    payPalItems.push({
      name: 'Reservation Fee',
      quantity: 1,
      unit_amount: reservationFeeUsd.toFixed(2)
    });

    const itemMetaMap = new Map<string, { lineDiscountValue: number; lineTotalAfterDiscount: number }>();
    itemDetails.forEach((item, idx) => {
      const discountValue = (discountAllocations[idx] || 0) / 100;
      const netLineTotal = Math.max(0, (lineTotalsCents[idx] - (discountAllocations[idx] || 0)) / 100);
      itemMetaMap.set(item.id, {
        lineDiscountValue: Number(discountValue.toFixed(2)),
        lineTotalAfterDiscount: Number(netLineTotal.toFixed(2)),
      });
    });

    // Update meta for all items
    for (const r of rows) {
      const item = itemDetails.find(i => i.id === r.id)!;
      const metaInfo = itemMetaMap.get(item.id) || { lineDiscountValue: 0, lineTotalAfterDiscount: 0 };
      await supabase
        .from('user_items')
        .update({
          meta: {
            ...(r.meta || {}),
            voucher_code: voucher?.code || null,
            discount_value: appliedDiscount,
            line_discount_value: metaInfo.lineDiscountValue,
            subtotal,
            addons_total: addonsTotal,
            total_amount: totalAmount,
            reservation_fee: reservationFeeCharged,
            reservation_fee_base: reservationFeeBase,
            line_total_after_discount: metaInfo.lineTotalAfterDiscount,
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
      reservation_fee: reservationFeeCharged,
      reservation_fee_base: reservationFeeBase,
      total_amount: totalAmount,
      line_items_json: JSON.stringify(displayLineItems),
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
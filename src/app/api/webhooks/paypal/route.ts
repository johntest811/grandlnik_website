import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

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

async function verifyPayPalWebhook(headers: any, body: any, webhookId: string) {
  // PayPal webhook verification logic
  // This is a simplified version - in production, implement full webhook verification
  return true;
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { event_type, resource } = body;

    console.log('PayPal webhook received:', event_type);

    // Handle PayPal payment completion
    if (event_type === 'CHECKOUT.ORDER.APPROVED' || event_type === 'PAYMENT.CAPTURE.COMPLETED') {
      const orderId = resource.id || resource.supplementary_data?.related_ids?.order_id;
      
      if (!orderId) {
        console.error('No order ID in PayPal webhook');
        return NextResponse.json({ error: 'Invalid webhook data' }, { status: 400 });
      }

      // Get order details from PayPal
      const accessToken = await getPayPalAccessToken();
      const orderResponse = await fetch(`${PAYPAL_BASE_URL}/v2/checkout/orders/${orderId}`, {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        }
      });

      if (!orderResponse.ok) {
        console.error('Failed to get PayPal order details');
        return NextResponse.json({ error: 'Failed to verify payment' }, { status: 500 });
      }

      const orderData = await orderResponse.json();
      const userItemIdsCsv = orderData.purchase_units?.[0]?.custom_id || orderData.purchase_units?.[0]?.reference_id;
      const ids = String(userItemIdsCsv || "").split(",").map((s: string) => s.trim()).filter(Boolean);

      if (ids.length === 0) {
        console.error('No user_item_id in PayPal order');
        return NextResponse.json({ error: 'Invalid order data' }, { status: 400 });
      }

      const notifiedItems: { id: string; product_id: string; quantity: number }[] = [];
      let grandTotal = 0; // accumulate total for admin notify

      for (const id of ids) {
        const { data: userItem } = await supabase
          .from('user_items')
          .select('product_id, quantity, meta')
          .eq('id', id)
          .single();

        if (!userItem) continue;

        const { data: product } = await supabase
          .from('products')
          .select('inventory, name, price')
          .eq('id', userItem.product_id)
          .single();

        const unit = Number(product?.price || 0);
        const qty = Number(userItem.quantity || 1);
        const addons: any[] = Array.isArray(userItem.meta?.addons) ? userItem.meta.addons : [];
        const addonsLine = addons.reduce((s, a) => s + Number(a?.fee || 0), 0) * qty;
        const subtotal = unit * qty;
        const addonsTotal = addonsLine;
        const discountValue = Number(userItem.meta?.voucher_discount || 0);
        const totalAmount = Math.max(0, subtotal + addonsTotal - discountValue);
        grandTotal += totalAmount;
        const reservationFee = 500; // reservation flow charges 500 upfront
        const stockBefore = Number(product?.inventory ?? 0);
        const newInventory = Math.max(0, stockBefore - qty);

        await supabase
          .from('user_items')
          .update({
            item_type: 'reservation',
            status: 'reserved',
            order_status: 'reserved',
            order_progress: 'payment_confirmed',
            payment_status: 'completed',
            payment_id: orderId,
            total_paid: totalAmount,
            payment_method: 'paypal',
            meta: {
              ...userItem.meta,
              payment_confirmed_at: new Date().toISOString(),
              payment_method: 'paypal',
              paypal_order_id: orderId,
              subtotal,
              addons_total: addonsTotal,
              discount_value: discountValue,
              total_amount: totalAmount,
              reservation_fee: reservationFee,
              product_stock_before: stockBefore,
              product_stock_after: newInventory,
            },
          })
          .eq('id', id);

        if (product) {
          await supabase.from('products').update({ inventory: newInventory }).eq('id', userItem.product_id);
          notifiedItems.push({ id, product_id: userItem.product_id, quantity: userItem.quantity });
        }
      }

      if (notifiedItems.length) {
        const paymentLabel = notifiedItems.length > 1 ? 'Reservation payments' : 'Reservation payment';
        const notificationTitle = notifiedItems.length > 1 ? 'Reservations Paid' : 'Reservation Paid';
        const adminMessage = `${paymentLabel} received via PayPal. Items: ${notifiedItems.length}. Amount: ₱${Number(grandTotal || 0).toLocaleString()}`;

        console.log('📢 Inserting admin notification:', {
          title: notificationTitle,
          message: adminMessage,
          type: 'order',
          priority: 'high',
          recipient_role: 'admin',
        });

        const { data: insertedNotif, error: adminNotifErr } = await supabase.from('notifications').insert({
          title: notificationTitle,
          message: adminMessage,
          type: 'order',
          priority: 'high',
          recipient_role: 'admin',
          is_read: false,
          created_at: new Date().toISOString(),
          metadata: {
            payment_provider: 'paypal',
            payment_type: 'reservation',
            amount_paid: grandTotal,
            user_item_ids: ids,
          },
        }).select();

        if (adminNotifErr) {
          console.error('❌ Failed to store admin notification:', adminNotifErr.message);
        } else {
          console.log('✅ Admin notification inserted successfully:', insertedNotif);
        }
      }

      console.log('PayPal payment processed successfully for user_item:', userItemIdsCsv);
      return NextResponse.json({ status: 'success' });
    }

    return NextResponse.json({ status: 'ignored' });

  } catch (error: any) {
    console.error('PayPal webhook processing error:', error);
    return NextResponse.json(
      { error: 'Webhook processing failed' },
      { status: 500 }
    );
  }
}
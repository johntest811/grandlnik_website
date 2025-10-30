import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function POST(request: NextRequest) {
  try {
    console.log('📦 PayMongo webhook received');
    const payload = await request.json();
    const data = payload?.data;

    // PayMongo paid event
    if (data?.attributes?.type === 'checkout_session.payment.paid') {
      const session = data?.attributes?.data;
      const sessionId = data?.id || session?.id || data?.attributes?.reference_number || 'unknown';
      const amountPaid = (session?.attributes?.amount || data?.attributes?.amount || 0) / 100;

      const meta = session?.attributes?.metadata || {};
      const userItemIdsCsv =
        meta?.user_item_ids ||
        session?.attributes?.metadata?.user_item_ids ||
        '';
      const ids: string[] = String(userItemIdsCsv).split(',').map((s: string) => s.trim()).filter(Boolean);

      // Pull receipt context from metadata
      const subtotal = Number(meta?.subtotal || 0);
      const addonsTotal = Number(meta?.addons_total || 0);
      const discountValue = Number(meta?.discount_value || 0);
      const paymentType = meta?.payment_type || 'order';
      const reservationFee = Number(meta?.reservation_fee || (paymentType === 'reservation' ? 500 : 0));
      const totalAmount = Number(meta?.total_amount || amountPaid);

      if (ids.length === 0) {
        console.error('❌ No user_item_id(s) in webhook data');
        return NextResponse.json({ error: 'Invalid webhook data' }, { status: 400 });
      }

      const notifiedItems: { id: string; product_id: string; quantity: number }[] = [];
      for (const id of ids) {
        const { data: userItem } = await supabase
          .from('user_items')
          .select('product_id, quantity, meta')
          .eq('id', id)
          .single();

        if (!userItem) continue;

        // Fetch product to track stock delta
        const { data: product } = await supabase
          .from('products')
          .select('inventory, name')
          .eq('id', userItem.product_id)
          .single();

        const stockBefore = Number(product?.inventory ?? 0);
        const newInventory = Math.max(0, stockBefore - Number(userItem.quantity || 0));

        await supabase
          .from('user_items')
          .update({
            item_type: 'reservation',
            status: 'reserved',
            order_status: 'reserved',
            order_progress: 'payment_confirmed',
            payment_status: 'completed',
            payment_id: sessionId,
            total_paid: amountPaid,
            total_amount: totalAmount,
            payment_method: 'paymongo',
            meta: {
              ...userItem.meta,
              payment_confirmed_at: new Date().toISOString(),
              amount_paid: amountPaid,
              total_amount: totalAmount,
              payment_session_id: sessionId,
              payment_method: 'paymongo',
              subtotal,
              addons_total: addonsTotal,
              discount_value: discountValue,
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
        const paymentLabel = paymentType === 'reservation' ? 'Reservation payment' : 'Order payment';
        const notificationTitle = paymentType === 'reservation' ? 'Reservation Paid' : 'Order Paid';
        const adminMessage = `${paymentLabel} received via PayMongo. Items: ${notifiedItems.length}. Amount: ₱${Number(amountPaid || 0).toLocaleString()}`;

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
            payment_provider: 'paymongo',
            payment_type: paymentType,
            amount_paid: amountPaid,
            subtotal,
            addons_total: addonsTotal,
            discount_value: discountValue,
            reservation_fee: reservationFee,
            user_item_ids: ids,
          },
        }).select();

        if (adminNotifErr) {
          console.error('❌ Failed to store admin notification:', adminNotifErr.message);
        } else {
          console.log('✅ Admin notification inserted successfully:', insertedNotif);
        }
      }

      console.log('✅ PayMongo webhook processed');
      return NextResponse.json({ status: 'success' });
    }

    return NextResponse.json({ status: 'ignored' });
  } catch (error: any) {
    console.error('💥 Webhook processing error:', error);
    return NextResponse.json(
      { error: 'Webhook processing failed' },
      { status: 500 }
    );
  }
}
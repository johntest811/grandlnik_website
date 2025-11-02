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

      const notifiedItems: { id: string; product_id: string; quantity: number; total_paid: number; user_id?: string }[] = [];
      let grandTotalPaid = 0;
      let cartUserId: string | null = null;

      for (const id of ids) {
        const { data: userItem } = await supabase
          .from('user_items')
          .select('user_id, product_id, quantity, meta, reservation_fee, item_type, order_status')
          .eq('id', id)
          .single();

        if (!userItem) continue;
        
        if (!cartUserId) cartUserId = userItem.user_id;

        const itemMeta = userItem.meta || {};
        const lineAfterDiscount = Number(itemMeta.line_total_after_discount ?? itemMeta.line_total ?? 0);
        const addonsPerItem = Number(itemMeta.addons_total_per_item ?? itemMeta.addons_total ?? 0);
        const storedShare = Number(itemMeta.reservation_fee_share ?? 0);
        const fallbackShare = ids.length > 0 ? reservationFee / ids.length : reservationFee;
        const reservationShareRaw = storedShare || fallbackShare;
        const reservationShare = Number(reservationShareRaw.toFixed(2));
        const storedFinal = Number(itemMeta.final_total_per_item ?? 0);
        const computedFinal = lineAfterDiscount + reservationShare;
        const finalTotalPerItem = Number((storedFinal > 0 ? storedFinal : computedFinal).toFixed(2));

        grandTotalPaid += finalTotalPerItem;

        await supabase
          .from('user_items')
          .update({
            item_type: 'reservation',
            status: 'reserved',
            order_status: 'reserved',
            order_progress: 'payment_completed',
            payment_status: 'completed',
            payment_id: sessionId,
            total_paid: finalTotalPerItem,
            total_amount: lineAfterDiscount,
            reservation_fee: reservationFee,
            payment_method: 'paymongo',
            meta: {
              ...itemMeta,
              payment_confirmed_at: new Date().toISOString(),
              amount_paid: finalTotalPerItem,
              total_amount: lineAfterDiscount,
              payment_session_id: sessionId,
              payment_method: 'paymongo',
              subtotal,
              addons_total: addonsTotal,
              addons_total_per_item: addonsPerItem,
              discount_value: discountValue,
              reservation_fee: reservationFee,
              reservation_fee_share: reservationShare,
              final_total_per_item: finalTotalPerItem,
              payment_type: paymentType,
            },
            updated_at: new Date().toISOString(),
          })
          .eq('id', id);

        notifiedItems.push({
          id,
          product_id: userItem.product_id,
          quantity: userItem.quantity,
          total_paid: finalTotalPerItem,
          user_id: userItem.user_id,
        });
      }

      // Clear cart items for this user (items with item_type='cart')
      if (cartUserId) {
        try {
          const { error: clearErr } = await supabase
            .from('user_items')
            .delete()
            .eq('user_id', cartUserId)
            .eq('item_type', 'cart');
          
          if (clearErr) {
            console.warn('⚠️ Failed to clear cart:', clearErr.message);
          } else {
            console.log('✅ Cart cleared for user:', cartUserId);
          }
        } catch (e) {
          console.warn('⚠️ Cart clear error:', e);
        }
      }

      if (notifiedItems.length) {
        const paymentLabel = paymentType === 'reservation' ? 'Reservation payment' : 'Order payment';
        const notificationTitle = paymentType === 'reservation' ? 'Reservation Paid' : 'Order Paid';
        const adminMessage = `${paymentLabel} received via PayMongo. Items: ${notifiedItems.length}. Amount: ₱${Number(grandTotalPaid || amountPaid || 0).toLocaleString()}`;

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
            amount_paid: grandTotalPaid || amountPaid,
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
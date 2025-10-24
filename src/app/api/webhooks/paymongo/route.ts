import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const ADMIN_URL = process.env.NEXT_PUBLIC_ADMIN_ORIGIN || "https://adminside-grandlink.vercel.app";

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
            meta: {
              ...userItem.meta,
              payment_confirmed_at: new Date().toISOString(),
              amount_paid: amountPaid,
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
        try {
          await fetch(`${ADMIN_URL}/api/notify`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              type: 'order_placed',
              items: notifiedItems,
              total: amountPaid,
            }),
          });
        } catch (notifyErr) {
          console.warn('Admin notify failed:', notifyErr);
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
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
      const session = data?.attributes?.data; // checkout_session object
      const sessionId = data?.id || session?.id || data?.attributes?.reference_number || 'unknown';
      const amountPaid = (session?.attributes?.amount || data?.attributes?.amount || 0) / 100; // centavos to PHP

      const userItemIdsCsv =
        session?.attributes?.metadata?.user_item_ids ||
        session?.attributes?.metadata?.user_item_id ||
        session?.attributes?.metadata?.user_item ||
        session?.attributes?.metadata?.user_items ||
        '';
      const ids: string[] = String(userItemIdsCsv).split(',').map((s: string) => s.trim()).filter(Boolean);

      if (ids.length === 0) {
        console.error('❌ No user_item_id(s) in webhook data');
        return NextResponse.json({ error: 'Invalid webhook data' }, { status: 400 });
      }

      for (const id of ids) {
        const { data: userItem } = await supabase
          .from('user_items')
          .select('product_id, quantity, meta')
          .eq('id', id)
          .single();

        if (!userItem) continue;

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
            },
          })
          .eq('id', id);

        // Deduct inventory
        if (userItem.product_id && userItem.quantity) {
          const { data: product } = await supabase
            .from('products')
            .select('inventory, name')
            .eq('id', userItem.product_id)
            .single();
          if (product) {
            const newInventory = Math.max(0, (product.inventory || 0) - userItem.quantity);
            await supabase.from('products').update({ inventory: newInventory }).eq('id', userItem.product_id);

            // Notify admin about order
            try {
              await fetch(`${process.env.NEXT_PUBLIC_BASE_URL || ''}/api/notifyServers`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  type: 'order_placed',
                  items: [{ id, product_id: userItem.product_id, quantity: userItem.quantity }],
                  total: amountPaid
                })
              });
            } catch (e) {
              console.warn('Admin notify failed:', e);
            }
          }
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
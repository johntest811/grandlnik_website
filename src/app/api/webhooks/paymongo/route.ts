import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function POST(request: NextRequest) {
  try {
    console.log('📦 PayMongo webhook received');
    
    const body = await request.json();
    const { data } = body;

    // After you parsed the incoming payload and have `sessionData` (usually payload.data)
    const sessionId =
      String(
        (sessionData && (sessionData.id || sessionData.reference_number)) ||
        (payload?.data?.id) ||
        (payload?.id) ||
        ''
      );

    if (data?.attributes?.type === 'checkout_session.payment.paid') {
      const sessionData = data.attributes.data;
      const userItemIdsCsv = sessionData?.attributes?.metadata?.user_item_ids;
      const userItemId = sessionData?.attributes?.metadata?.user_item_id;
      const userItemIds: string[] = userItemIdsCsv
        ? String(userItemIdsCsv).split(',').map(s => s.trim()).filter(Boolean)
        : (userItemId ? [userItemId] : []);

      if (userItemIds.length === 0) {
        console.error('❌ No user_item_id(s) in webhook data');
        return NextResponse.json({ error: 'Invalid webhook data' }, { status: 400 });
      }

      for (const id of userItemIds) {
        // Get user_item details with product info
        const { data: userItem } = await supabase
          .from('user_items')
          .select('product_id, quantity, meta')
          .eq('id', id)
          .single();

        if (!userItem) continue;

        await supabase
          .from('user_items')
          .update({
            status: 'reserved',
            order_status: 'reserved',
            order_progress: 'payment_confirmed',
            payment_status: 'completed',
            payment_id: sessionId, // <-- now defined
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
            .select('inventory')
            .eq('id', userItem.product_id)
            .single();
          if (product) {
            const newInventory = Math.max(0, (product.inventory || 0) - userItem.quantity);
            await supabase.from('products').update({ inventory: newInventory }).eq('id', userItem.product_id);
          }
        }
      }

      console.log('✅ PayMongo webhook processed - Order awaiting admin acceptance');
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
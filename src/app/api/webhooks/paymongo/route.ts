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

    if (data?.attributes?.type === 'checkout_session.payment.paid') {
      const sessionData = data.attributes.data;
      const userItemId = sessionData?.attributes?.metadata?.user_item_id;
      const sessionId = sessionData?.id;
      const amountPaid = sessionData?.attributes?.amount / 100;

      if (!userItemId) {
        console.error('❌ No user_item_id in webhook data');
        return NextResponse.json({ error: 'Invalid webhook data' }, { status: 400 });
      }

      // Get user_item details with product info
      const { data: userItem, error: fetchError } = await supabase
        .from('user_items')
        .select('*, products(*)')
        .eq('id', userItemId)
        .single();

      if (fetchError || !userItem) {
        console.error('❌ Error fetching user_item:', fetchError);
        return NextResponse.json({ error: 'User item not found' }, { status: 404 });
      }

      // ✅ DEDUCT INVENTORY
      if (userItem.product_id && userItem.quantity) {
        const currentInventory = userItem.products?.inventory || 0;
        const newInventory = Math.max(0, currentInventory - userItem.quantity);

        const { error: inventoryError } = await supabase
          .from('products')
          .update({ inventory: newInventory })
          .eq('id', userItem.product_id);

        if (inventoryError) {
          console.error('❌ Failed to update inventory:', inventoryError);
        } else {
          console.log(`✅ Inventory updated: ${currentInventory} → ${newInventory}`);
        }
      }

      // Update user_item to "pending_acceptance" status
      const updatedMeta = {
        ...userItem.meta,
        payment_confirmed_at: new Date().toISOString(),
        amount_paid: amountPaid,
        payment_session_id: sessionId,
        payment_method: 'paymongo',
        payment_status: 'completed',
        full_amount: userItem.products?.price * userItem.quantity,
        reservation_fee: 500
      };

      const { error: updateError } = await supabase
        .from('user_items')
        .update({ 
          status: 'pending_acceptance',
          order_status: 'pending_acceptance',
          order_progress: 'awaiting_acceptance',
          payment_status: 'completed',
          payment_id: sessionId,
          meta: updatedMeta,
          updated_at: new Date().toISOString()
        })
        .eq('id', userItemId);

      if (updateError) {
        console.error('❌ Error updating user_item:', updateError);
        return NextResponse.json({ error: 'Failed to update reservation' }, { status: 500 });
      }

      // Update payment session
      await supabase
        .from('payment_sessions')
        .update({ 
          status: 'completed',
          completed_at: new Date().toISOString()
        })
        .eq('stripe_session_id', sessionId);

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
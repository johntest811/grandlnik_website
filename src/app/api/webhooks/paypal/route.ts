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
      const userItemId = orderData.purchase_units?.[0]?.custom_id || orderData.purchase_units?.[0]?.reference_id;
      
      if (!userItemId) {
        console.error('No user_item_id in PayPal order');
        return NextResponse.json({ error: 'Invalid order data' }, { status: 400 });
      }

      // Update payment session status
      await supabase
        .from('payment_sessions')
        .update({ 
          status: 'completed',
          completed_at: new Date().toISOString()
        })
        .eq('stripe_session_id', orderId);

      // Get user_item details
      const { data: userItem, error: fetchError } = await supabase
        .from('user_items')
        .select('product_id, quantity, meta')
        .eq('id', userItemId)
        .single();

      if (fetchError) {
        console.error('Error fetching user_item:', fetchError);
        return NextResponse.json({ error: 'User item not found' }, { status: 404 });
      }

      // Update user_item status to reserved
      const { error: updateError } = await supabase
        .from('user_items')
        .update({ 
          status: 'reserved',
          payment_status: 'completed',
          payment_id: orderId,
          meta: {
            ...userItem.meta,
            payment_confirmed_at: new Date().toISOString(),
            payment_method: 'paypal',
            paypal_order_id: orderId,
            payment_session_id: orderId
          }
        })
        .eq('id', userItemId);

      if (updateError) {
        console.error('Error updating user_item:', updateError);
        return NextResponse.json({ error: 'Failed to update reservation' }, { status: 500 });
      }

      // Deduct inventory
      const { data: product, error: productError } = await supabase
        .from('products')
        .select('inventory')
        .eq('id', userItem.product_id)
        .single();

      if (!productError && product) {
        const newInventory = Math.max(0, (product.inventory || 0) - userItem.quantity);
        
        await supabase
          .from('products')
          .update({ inventory: newInventory })
          .eq('id', userItem.product_id);
      }

      console.log('PayPal payment processed successfully for user_item:', userItemId);
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
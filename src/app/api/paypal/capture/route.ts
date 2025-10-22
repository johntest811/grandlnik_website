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

export async function POST(request: NextRequest) {
  try {
    const { orderId } = await request.json();

    if (!orderId) {
      return NextResponse.json({ error: 'Order ID required' }, { status: 400 });
    }

    // Get access token
    const accessToken = await getPayPalAccessToken();

    // Capture the order
    const captureResponse = await fetch(`${PAYPAL_BASE_URL}/v2/checkout/orders/${orderId}/capture`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      }
    });

    if (!captureResponse.ok) {
      const errorData = await captureResponse.text();
      console.error('PayPal capture failed:', errorData);
      return NextResponse.json({ error: 'Payment capture failed' }, { status: 500 });
    }

    const captureData = await captureResponse.json();
    
    // Process the successful payment (similar to webhook logic)
    const userItemId = captureData.purchase_units?.[0]?.custom_id || captureData.purchase_units?.[0]?.reference_id;
    
    if (userItemId) {
      // Update payment session
      await supabase
        .from('payment_sessions')
        .update({ 
          status: 'completed',
          completed_at: new Date().toISOString()
        })
        .eq('stripe_session_id', orderId);

      // Get user_item and update
      const { data: userItem, error: fetchError } = await supabase
        .from('user_items')
        .select('product_id, quantity, meta')
        .eq('id', userItemId)
        .single();

      if (!fetchError && userItem) {
        // Update user_item status
        await supabase
          .from('user_items')
          .update({ 
            status: 'reserved',
            payment_status: 'completed',
            payment_id: orderId,
            meta: {
              ...userItem.meta,
              payment_confirmed_at: new Date().toISOString(),
              payment_method: 'paypal',
              paypal_order_id: orderId
            }
          })
          .eq('id', userItemId);

        // Deduct inventory
        const { data: product } = await supabase
          .from('products')
          .select('inventory')
          .eq('id', userItem.product_id)
          .single();

        if (product) {
          const newInventory = Math.max(0, (product.inventory || 0) - userItem.quantity);
          await supabase
            .from('products')
            .update({ inventory: newInventory })
            .eq('id', userItem.product_id);
        }
      }
    }

    return NextResponse.json({ 
      success: true,
      captureData,
      userItemId 
    });

  } catch (error: any) {
    console.error('PayPal capture error:', error);
    return NextResponse.json(
      { error: error.message || 'Payment processing failed' },
      { status: 500 }
    );
  }
}
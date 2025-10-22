import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

// Initialize Supabase
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// PayMongo configuration
const PAYMONGO_SECRET_KEY = process.env.PAYMONGO_SECRET_KEY;

// PayPal configuration
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
    user_item_id,
    product_name,
    success_url,
    cancel_url
  } = sessionData;

  // PayMongo requires line_items format
  const lineItems = [{
    name: product_name || 'Product Reservation',
    quantity: 1,
    amount: Math.round(amount * 100), // Convert to centavos
    currency: currency.toUpperCase(),
    description: `Reservation fee for ${product_name || 'product'}`
  }];

  const checkoutData = {
    data: {
      attributes: {
        send_email_receipt: true,
        show_description: true,
        show_line_items: true,
        line_items: lineItems,
        payment_method_types: [
          'gcash',
          'paymaya'
        ], // REMOVED: 'card' and 'grab_pay' - keeping only GCash and PayMaya
        success_url: success_url,
        cancel_url: cancel_url,
        description: `Reservation payment for ${product_name}`,
        metadata: {
          user_item_id: user_item_id,
          payment_type: 'reservation'
        }
      }
    }
  };

  console.log('🔧 PayMongo checkout data:', JSON.stringify(checkoutData, null, 2));

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
    console.error('❌ PayMongo error:', errorData);
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
    currency,
    user_item_id,
    product_name,
    success_url,
    cancel_url
  } = orderData;

  const accessToken = await getPayPalAccessToken();

  // Convert PHP to USD for PayPal (approximate rate)
  const usdAmount = currency === 'PHP' ? (amount / 50).toFixed(2) : amount.toFixed(2);

  const paypalOrderData = {
    intent: 'CAPTURE',
    purchase_units: [{
      reference_id: user_item_id,
      custom_id: user_item_id,
      description: `Reservation fee for ${product_name}`,
      amount: {
        currency_code: 'USD',
        value: usdAmount
      }
    }],
    application_context: {
      brand_name: 'GrandLink',
      landing_page: 'NO_PREFERENCE',
      user_action: 'PAY_NOW',
      return_url: success_url,
      cancel_url: cancel_url
    }
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
    console.error('❌ PayPal error:', errorData);
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
      amount,
      currency = 'PHP',
      user_item_id,
      product_name,
      payment_type = 'reservation',
      payment_method = 'paymongo',
      success_url,
      cancel_url
    } = await request.json();

    console.log('💳 Creating payment session for user_item:', user_item_id);
    console.log('💰 Amount:', amount, currency);
    console.log('🎯 Payment method:', payment_method);

    // Validate required fields
    if (!user_item_id || !amount || !success_url || !cancel_url) {
      return NextResponse.json(
        { error: 'Missing required payment data' },
        { status: 400 }
      );
    }

    // Verify user_item exists
    const { data: userItem, error: fetchError } = await supabase
      .from('user_items')
      .select('id, status, payment_status')
      .eq('id', user_item_id)
      .single();

    if (fetchError || !userItem) {
      console.error('❌ User item not found:', fetchError);
      return NextResponse.json(
        { error: 'Reservation not found' },
        { status: 404 }
      );
    }

    if (userItem.payment_status === 'completed') {
      return NextResponse.json(
        { error: 'Payment already completed' },
        { status: 400 }
      );
    }

    let sessionId: string;
    let checkoutUrl: string;

    // Create payment session based on method
    if (payment_method === 'paypal') {
      const paypalResult = await createPayPalOrder({
        amount,
        currency: 'USD', // PayPal uses USD
        user_item_id,
        product_name,
        success_url,
        cancel_url
      });
      
      sessionId = paypalResult.sessionId;
      checkoutUrl = paypalResult.checkoutUrl;
    } else {
      // Default to PayMongo
      const paymongoResult = await createPayMongoSession({
        amount,
        currency: 'PHP', // PayMongo uses PHP
        user_item_id,
        product_name,
        success_url,
        cancel_url
      });
      
      sessionId = paymongoResult.sessionId;
      checkoutUrl = paymongoResult.checkoutUrl;
    }

    console.log('✅ Payment session created:', sessionId);
    console.log('🔗 Checkout URL:', checkoutUrl);

    return NextResponse.json({
      sessionId,
      checkoutUrl,
      success: true
    });

  } catch (error: any) {
    console.error('💥 Payment session creation error:', error);
    return NextResponse.json(
      { 
        error: error.message || 'Failed to create payment session',
        details: error.stack
      },
      { status: 500 }
    );
  }
}
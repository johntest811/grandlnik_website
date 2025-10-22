import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function GET(request: NextRequest) {
  try {
    console.log('🔍 Debug: Checking user_items table...');

    // Get all user_items
    const { data: userItems, error: itemsError } = await supabase
      .from('user_items')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(10);

    // Get all payment_sessions  
    const { data: paymentSessions, error: sessionsError } = await supabase
      .from('payment_sessions')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(10);

    return NextResponse.json({
      user_items: {
        count: userItems?.length || 0,
        data: userItems || [],
        error: itemsError
      },
      payment_sessions: {
        count: paymentSessions?.length || 0,
        data: paymentSessions || [],
        error: sessionsError
      }
    });

  } catch (error: any) {
    console.error('Debug error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
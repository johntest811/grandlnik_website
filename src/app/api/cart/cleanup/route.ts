import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } }
);

export async function POST(request: NextRequest) {
  try {
    const { user_id, minutes = 60 } = await request.json();
    if (!user_id) return NextResponse.json({ error: 'user_id required' }, { status: 400 });

    const sinceIso = new Date(Date.now() - Math.max(1, Number(minutes)) * 60 * 1000).toISOString();

    // Find reservations created/updated recently with a cart_id reference
    const { data: items, error: itemsErr } = await supabase
      .from('user_items')
      .select('id, meta')
      .eq('user_id', user_id)
      .eq('item_type', 'reservation')
      .in('status', ['pending_payment', 'reserved'])
      .gte('updated_at', sinceIso);

    if (itemsErr) return NextResponse.json({ error: itemsErr.message }, { status: 500 });

    const cartIds = Array.from(
      new Set(
        (items || [])
          .map((it: any) => it?.meta?.cart_id)
          .filter((id: any) => typeof id === 'string' && id.length > 0)
      )
    );

    if (cartIds.length === 0) {
      return NextResponse.json({ success: true, deleted: 0 });
    }

    const { error: delErr } = await supabase
      .from('cart')
      .delete()
      .in('id', cartIds);

    if (delErr) return NextResponse.json({ error: delErr.message }, { status: 500 });

    return NextResponse.json({ success: true, deleted: cartIds.length });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Cleanup failed' }, { status: 500 });
  }
}

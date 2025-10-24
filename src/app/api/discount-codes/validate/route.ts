import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } }
);

export async function POST(request: NextRequest) {
  try {
    const { code, subtotal } = await request.json();
    if (!code) return NextResponse.json({ error: 'Code required' }, { status: 400 });

    const { data: d, error } = await supabase
      .from('discount_codes')
      .select('*')
      .eq('code', code.trim())
      .eq('active', true)
      .maybeSingle();

    if (error || !d) return NextResponse.json({ error: 'Invalid or inactive code' }, { status: 404 });

    const minSub = Number(d.min_subtotal || 0);
    if (typeof subtotal === 'number' && subtotal < minSub) {
      return NextResponse.json({ error: `Minimum subtotal ₱${minSub.toLocaleString()} not met` }, { status: 400 });
    }

    // Note: optional: starts_at check
    const discount = { code: d.code, type: d.type as 'percent'|'amount', value: Number(d.value) };
    return NextResponse.json({ discount });
  } catch (e: any) {
    return NextResponse.json({ error: e.message || 'Failed to validate code' }, { status: 500 });
  }
}
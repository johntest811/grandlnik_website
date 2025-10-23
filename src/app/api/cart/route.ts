import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } }
);

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET(req: NextRequest) {
  const userId = req.nextUrl.searchParams.get("userId");
  if (!userId) return NextResponse.json({ error: "userId required" }, { status: 400 });

  const { data, error } = await supabase
    .from("user_items")
    .select("*")
    .eq("user_id", userId)
    .eq("item_type", "cart")
    .order("created_at", { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ items: data ?? [] });
}

export async function POST(req: NextRequest) {
  const { userId, productId, quantity = 1, meta = {} } = await req.json();
  if (!userId || !productId) return NextResponse.json({ error: "userId and productId required" }, { status: 400 });

  // Upsert: if cart row exists for same product, bump quantity
  const { data: existing } = await supabase
    .from("user_items")
    .select("id, quantity, meta")
    .eq("user_id", userId)
    .eq("product_id", productId)
    .eq("item_type", "cart")
    .limit(1)
    .maybeSingle();

  if (existing) {
    const newQty = Math.max(1, (existing.quantity || 1) + Number(quantity || 1));
    const { data, error } = await supabase
      .from("user_items")
      .update({ quantity: newQty, meta: { ...(existing.meta || {}), ...meta }, updated_at: new Date().toISOString() })
      .eq("id", existing.id)
      .select()
      .single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ item: data });
  }

  const { data, error } = await supabase
    .from("user_items")
    .insert({
      user_id: userId,
      product_id: productId,
      item_type: "cart",
      status: "active",
      quantity: Math.max(1, Number(quantity || 1)),
      meta: meta,
      created_at: new Date().toISOString(),
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ item: data });
}

export async function PATCH(req: NextRequest) {
  const { itemId, quantity, meta } = await req.json();
  if (!itemId) return NextResponse.json({ error: "itemId required" }, { status: 400 });

  const patch: any = { updated_at: new Date().toISOString() };
  if (typeof quantity === "number") patch.quantity = Math.max(1, quantity);
  if (meta) patch.meta = meta;

  const { data, error } = await supabase
    .from("user_items")
    .update(patch)
    .eq("id", itemId)
    .eq("item_type", "cart")
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ item: data });
}

export async function DELETE(req: NextRequest) {
  const { itemId } = await req.json();
  if (!itemId) return NextResponse.json({ error: "itemId required" }, { status: 400 });

  const { error } = await supabase.from("user_items").delete().eq("id", itemId).eq("item_type", "cart");
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}
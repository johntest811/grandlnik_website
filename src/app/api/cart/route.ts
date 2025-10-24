import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } }
);

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const userId = searchParams.get('userId');
    if (!userId) return NextResponse.json({ error: 'userId required' }, { status: 400 });

    const { data, error } = await supabase
      .from('user_items')
      .select('*')
      .eq('user_id', userId)
      .eq('item_type', 'cart')
      .order('created_at', { ascending: false });

    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    return NextResponse.json({ items: data ?? [] });
  } catch (e: any) {
    return NextResponse.json({ error: e.message || 'Failed to load cart' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const { userId, productId, quantity = 1, meta = {} } = await request.json();
    if (!userId || !productId) return NextResponse.json({ error: 'Missing userId or productId' }, { status: 400 });

    // If same product already in cart, merge quantities
    const { data: existing } = await supabase
      .from('user_items')
      .select('*')
      .eq('user_id', userId)
      .eq('item_type', 'cart')
      .eq('product_id', productId)
      .limit(1)
      .maybeSingle();

    if (existing) {
      const nextQty = Math.max(1, Number(existing.quantity || 0) + Number(quantity || 0));
      const { data, error } = await supabase
        .from('user_items')
        .update({
          quantity: nextQty,
          meta: { ...(existing.meta || {}), ...(meta || {}) },
          updated_at: new Date().toISOString()
        })
        .eq('id', existing.id)
        .select()
        .single();

      if (error) return NextResponse.json({ error: error.message }, { status: 400 });
      return NextResponse.json({ item: data, merged: true });
    }

    const { data, error } = await supabase
      .from('user_items')
      .insert([{
        user_id: userId,
        product_id: productId,
        item_type: 'cart',
        status: 'active',
        quantity: Math.max(1, Number(quantity || 1)),
        meta: { ...meta },
        created_at: new Date().toISOString()
      }])
      .select()
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    return NextResponse.json({ item: data });
  } catch (e: any) {
    return NextResponse.json({ error: e.message || 'Failed to add to cart' }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const { id, quantity, meta } = await request.json();
    if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 });

    const update: any = { updated_at: new Date().toISOString() };
    if (typeof quantity === 'number') update.quantity = Math.max(1, quantity);
    if (meta) update.meta = meta;

    const { data, error } = await supabase
      .from('user_items')
      .update(update)
      .eq('id', id)
      .eq('item_type', 'cart')
      .select()
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    return NextResponse.json({ item: data });
  } catch (e: any) {
    return NextResponse.json({ error: e.message || 'Failed to update cart' }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');
    const userId = searchParams.get('userId');
    const clear = searchParams.get('clear');

    if (clear === 'true' && userId) {
      const { error } = await supabase
        .from('user_items')
        .delete()
        .eq('user_id', userId)
        .eq('item_type', 'cart');
      if (error) return NextResponse.json({ error: error.message }, { status: 400 });
      return NextResponse.json({ success: true, cleared: true });
    }

    if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 });

    const { error } = await supabase
      .from('user_items')
      .delete()
      .eq('id', id)
      .eq('item_type', 'cart');

    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    return NextResponse.json({ success: true });
  } catch (e: any) {
    return NextResponse.json({ error: e.message || 'Failed to remove item' }, { status: 500 });
  }
}
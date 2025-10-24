"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { createClient } from "@supabase/supabase-js";

type UserItem = {
  id: string;
  user_id: string;
  product_id: string;
  item_type: string;
  status: string;
  quantity: number;
  meta: any;
  created_at: string;
};

type Product = {
  id: string;
  name?: string;
  price?: number;
  images?: string[];
  image1?: string;
  image2?: string;
};

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

export default function CartPage() {
  const [userId, setUserId] = useState<string | null>(null);
  const [items, setItems] = useState<UserItem[]>([]);
  const [productsById, setProductsById] = useState<Record<string, Product>>({});
  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const [loading, setLoading] = useState(true);
  const [voucher, setVoucher] = useState("");
  const [voucherInfo, setVoucherInfo] = useState<{ code: string; type: 'percent'|'amount'; value: number } | null>(null);
  const [applying, setApplying] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState<'paymongo'|'paypal'>('paypal');

  useEffect(() => {
    (async () => {
      const { data } = await supabase.auth.getUser();
      const uid = (data as any)?.user?.id ?? null;
      setUserId(uid);
    })();
  }, []);

  const loadCart = async (uid: string) => {
    setLoading(true);
    try {
      const res = await fetch(`/api/cart?userId=${uid}`, { cache: 'no-store' });
      const j = await res.json();
      const cartItems: UserItem[] = j.items ?? [];
      setItems(cartItems);

      const productIds = Array.from(new Set(cartItems.map(i => i.product_id).filter(Boolean)));
      if (productIds.length) {
        const { data: prods, error } = await supabase
          .from('products')
          .select('id, name, price, images, image1, image2')
          .in('id', productIds);
        if (!error) {
          const map: Record<string, Product> = {};
          (prods ?? []).forEach(p => (map[p.id] = p));
          setProductsById(map);
        }
      } else {
        setProductsById({});
      }
    } catch (e) {
      console.error(e);
      setItems([]);
      setProductsById({});
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (userId) loadCart(userId);
  }, [userId]);

  const toggleSelectAll = (checked: boolean) => {
    if (!checked) {
      setSelected({});
      return;
    }
    const sel: Record<string, boolean> = {};
    items.forEach(i => { sel[i.id] = true; });
    setSelected(sel);
  };

  const selectedItems = useMemo(
    () => items.filter(i => selected[i.id]),
    [items, selected]
  );

  const getItemImage = (p?: Product) =>
    (p?.images && p.images[0]) || p?.image1 || p?.image2 || "/no-orders.png";

  const computeItemTotal = (item: UserItem, product: Product | undefined) => {
    const base = Number(product?.price || 0) * Number(item.quantity || 1);
    const addons: any[] = Array.isArray(item.meta?.addons) ? item.meta.addons : [];
    const addonTotal = addons.reduce((sum, a) => sum + Number(a?.fee || 0), 0) * Number(item.quantity || 1);
    return { base, addonTotal, lineTotal: base + addonTotal };
  };

  const totals = useMemo(() => {
    const t = selectedItems.reduce((acc, it) => {
      const p = productsById[it.product_id];
      const c = computeItemTotal(it, p);
      acc.subtotal += c.base;
      acc.addons += c.addonTotal;
      acc.total += c.lineTotal;
      return acc;
    }, { subtotal: 0, addons: 0, total: 0 });

    let discount = 0;
    if (voucherInfo) {
      if (voucherInfo.type === 'percent') discount = (t.total * (voucherInfo.value / 100));
      else discount = voucherInfo.value;
      discount = Math.min(discount, t.total);
    }
    const grand = Math.max(0, t.total - discount);

    return { ...t, discount, grand };
  }, [selectedItems, productsById, voucherInfo]);

  const inc = async (item: UserItem) => {
    await fetch('/api/cart', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: item.id, quantity: (item.quantity || 1) + 1 })
    });
    if (userId) loadCart(userId);
  };

  const dec = async (item: UserItem) => {
    const next = Math.max(1, (item.quantity || 1) - 1);
    await fetch('/api/cart', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: item.id, quantity: next })
    });
    if (userId) loadCart(userId);
  };

  const removeItem = async (id: string) => {
    await fetch(`/api/cart?id=${id}`, { method: 'DELETE' });
    if (userId) loadCart(userId);
  };

  const clearCart = async () => {
    if (!userId) return;
    const confirmed = window.confirm('Clear entire cart?');
    if (!confirmed) return;
    await fetch(`/api/cart?clear=true&userId=${userId}`, { method: 'DELETE' });
    loadCart(userId);
  };

  const applyVoucher = async () => {
    setApplying(true);
    try {
      if (!voucher) {
        setVoucherInfo(null);
        return;
      }
      const res = await fetch('/api/discount-codes/validate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          code: voucher.trim(),
          subtotal: totals.total // apply against total including add-ons
        })
      });
      const j = await res.json();
      if (!res.ok) {
        alert(j?.error || 'Invalid voucher');
        setVoucherInfo(null);
        return;
      }
      setVoucherInfo(j.discount);
    } catch (e) {
      console.error(e);
      alert('Failed to apply voucher');
      setVoucherInfo(null);
    } finally {
      setApplying(false);
    }
  };

  const checkout = async () => {
    if (!userId) return alert('Please login');
    if (selectedItems.length === 0) return alert('Please select at least one item');

    // Build payload
    const user_item_ids = selectedItems.map(i => i.id);
    const amount = totals.grand;
    const product_name = selectedItems.length === 1
      ? (productsById[selectedItems[0].product_id]?.name || 'Item')
      : `Cart items (${selectedItems.length})`;

    const success_url = `${window.location.origin}/profile/order`;
    const cancel_url = `${window.location.origin}/profile/cart`;

    const res = await fetch('/api/create-payment-session', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        user_item_ids,
        amount,
        currency: 'PHP',
        product_name,
        payment_type: 'order',
        payment_method: paymentMethod,
        success_url,
        cancel_url,
        // optional: pass voucher info to metadata
        voucher: voucherInfo || undefined
      })
    });
    const data = await res.json();
    if (!res.ok) {
      console.error(data);
      alert(data?.error || 'Failed to create payment session');
      return;
    }
    if (!data.checkoutUrl) {
      alert('No checkout URL returned');
      return;
    }
    window.location.href = data.checkoutUrl;
  };

  const updateColorAddon = async (item: UserItem, color: string, fee: number) => {
    const currentAddons: any[] = Array.isArray(item.meta?.addons) ? item.meta.addons : [];
    const others = currentAddons.filter(a => a?.key !== 'color_customization');
    const next = color
      ? [...others, { key: 'color_customization', label: 'Color Customization', fee: Number(fee || 0), value: color }]
      : others;
    await fetch('/api/cart', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: item.id, meta: { ...(item.meta || {}), addons: next } })
    });
    if (userId) loadCart(userId);
  };

  if (loading) {
    return <div className="min-h-screen flex items-center justify-center">Loading cart...</div>;
  }

  return (
    <div className="p-6 max-w-6xl mx-auto">
      {/* Controls */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <input
            type="checkbox"
            checked={selectedItems.length === items.length && items.length > 0}
            onChange={(e) => toggleSelectAll(e.target.checked)}
          />
          <span className="text-black">Select All</span>
          <span className="text-gray-500">({selectedItems.length}/{items.length})</span>
        </div>
        <div className="flex items-center gap-3">
          <select
            value={paymentMethod}
            onChange={(e) => setPaymentMethod(e.target.value as any)}
            className="border px-2 py-1 rounded text-black"
          >
            <option value="paypal">PayPal</option>
            <option value="paymongo">PayMongo (GCash/PayMaya)</option>
          </select>
          <button onClick={clearCart} className="text-red-600 hover:underline">Clear Cart</button>
        </div>
      </div>

      {/* Items */}
      <div className="grid grid-cols-1 gap-4">
        {items.map((it) => {
          const p = productsById[it.product_id];
          const colorAddon = (Array.isArray(it.meta?.addons) ? it.meta.addons : []).find((a: any) => a?.key === 'color_customization');
          return (
            <div key={it.id} className="bg-white rounded border p-3 flex items-start justify-between">
              <div className="flex items-start gap-3">
                <input
                  type="checkbox"
                  checked={!!selected[it.id]}
                  onChange={(e) => setSelected(prev => ({ ...prev, [it.id]: e.target.checked }))}
                />
                <Image src={getItemImage(p)} alt={p?.name || 'Item'} width={90} height={90} className="rounded object-cover border" />
                <div>
                  <div className="text-black font-semibold">{p?.name || 'Unknown'}</div>
                  <div className="text-gray-600 text-sm">₱{Number(p?.price || 0).toLocaleString()}</div>

                  {/* Add-ons (Color customization) */}
                  <div className="mt-2 flex items-center gap-2">
                    <label className="text-sm text-gray-700">Color:</label>
                    <input
                      className="border rounded px-2 py-1 text-black"
                      placeholder="optional"
                      value={colorAddon?.value || ''}
                      onChange={(e) => updateColorAddon(it, e.target.value, Number(colorAddon?.fee || 0))}
                    />
                    <label className="text-sm text-gray-700">Add-on Fee:</label>
                    <input
                      className="border rounded px-2 py-1 w-24 text-black"
                      type="number"
                      min={0}
                      value={colorAddon?.fee || 0}
                      onChange={(e) => updateColorAddon(it, colorAddon?.value || '', Number(e.target.value || 0))}
                    />
                  </div>
                </div>
              </div>

              {/* Quantity + Remove */}
              <div className="flex items-center gap-3">
                <div className="flex items-center gap-2">
                  <button onClick={() => dec(it)} className="w-8 h-8 rounded border hover:bg-gray-100">-</button>
                  <div className="min-w-8 text-center text-black">{it.quantity || 1}</div>
                  <button onClick={() => inc(it)} className="w-8 h-8 rounded border hover:bg-gray-100">+</button>
                </div>
                <button onClick={() => removeItem(it.id)} className="text-red-600 hover:underline">Remove</button>
              </div>
            </div>
          );
        })}
        {items.length === 0 && (
          <div className="bg-white rounded border p-8 text-center text-gray-600">
            Your cart is empty. Browse products <Link href="/Product" className="text-red-600 underline">here</Link>.
          </div>
        )}
      </div>

      {/* Voucher + Summary */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mt-6">
        <div className="md:col-span-2 bg-white border rounded p-4">
          <div className="text-black font-semibold mb-2">Voucher / Discount</div>
          <div className="flex items-center gap-2">
            <input
              className="border rounded px-3 py-2 flex-1 text-black"
              placeholder="Enter voucher code"
              value={voucher}
              onChange={(e) => setVoucher(e.target.value)}
            />
            <button
              disabled={applying || selectedItems.length === 0}
              onClick={applyVoucher}
              className="bg-[#8B1C1C] text-white px-4 py-2 rounded disabled:opacity-50"
            >
              {applying ? 'Applying...' : 'Apply'}
            </button>
          </div>
          {voucherInfo && (
            <div className="mt-2 text-sm text-green-700">
              Applied {voucherInfo.code} ({voucherInfo.type === 'percent' ? `${voucherInfo.value}%` : `₱${voucherInfo.value}`})
            </div>
          )}
        </div>

        <div className="bg-white border rounded p-4">
          <div className="text-black font-semibold mb-2">Payment Details</div>
          <div className="flex items-center justify-between text-sm text-gray-700">
            <span>Subtotal</span><span>₱{totals.subtotal.toLocaleString()}</span>
          </div>
          <div className="flex items-center justify-between text-sm text-gray-700">
            <span>Add-ons</span><span>₱{totals.addons.toLocaleString()}</span>
          </div>
          <div className="flex items-center justify-between text-sm text-gray-700">
            <span>Discount</span><span>-₱{totals.discount.toLocaleString()}</span>
          </div>
          <hr className="my-2" />
          <div className="flex items-center justify-between text-base text-black font-semibold">
            <span>Total</span><span>₱{totals.grand.toLocaleString()}</span>
          </div>
          <button
            onClick={checkout}
            disabled={selectedItems.length === 0 || totals.grand <= 0}
            className="w-full mt-4 bg-[#8B1C1C] hover:bg-[#a83232] text-white px-4 py-2 rounded disabled:opacity-50"
          >
            Checkout ({selectedItems.length} item{selectedItems.length !== 1 ? 's' : ''})
          </button>
        </div>
      </div>
    </div>
  );
}
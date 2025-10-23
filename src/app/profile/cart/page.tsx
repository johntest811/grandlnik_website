"use client";

import { useEffect, useMemo, useState } from "react";
import Image from "next/image";
import { createClient } from "@supabase/supabase-js";
import { useRouter } from "next/navigation";

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!);

type CartItem = {
  id: string;
  product_id: string;
  quantity: number;
  meta: any;
  products?: { id: string; name: string; price?: number; image1?: string; images?: string[] };
};

export default function CartPage() {
  const [userId, setUserId] = useState<string | null>(null);
  const [items, setItems] = useState<CartItem[]>([]);
  const [voucher, setVoucher] = useState("");
  const [loading, setLoading] = useState(true);
  const router = useRouter();

  useEffect(() => {
    const init = async () => {
      const { data } = await supabase.auth.getUser();
      const uid = (data as any)?.user?.id || null;
      setUserId(uid);
      if (!uid) { setLoading(false); return; }
      await loadCart(uid);
    };
    init();
  }, []);

  const loadCart = async (uid: string) => {
    setLoading(true);
    const res = await fetch(`/api/cart?userId=${uid}`);
    const data = await res.json();
    const arr: CartItem[] = data?.items || [];
    setItems(arr);
    setLoading(false);
  };

  const updateQty = async (item: CartItem, delta: number) => {
    const next = Math.max(1, (item.quantity || 1) + delta);
    await fetch('/api/cart', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ itemId: item.id, quantity: next })});
    await loadCart(userId!);
  };

  const removeItem = async (item: CartItem) => {
    await fetch('/api/cart', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ itemId: item.id }) });
    await loadCart(userId!);
  };

  const totals = useMemo(() => {
    const rows = items.map(it => {
      const base = Number(it.meta?.base_price || 0);
      const qty = Number(it.quantity || 1);
      const addonsTotal = (Array.isArray(it.meta?.addons) ? it.meta.addons : []).reduce((acc: number, a: any) => acc + Number(a.fee || 0), 0);
      return { line: (base + addonsTotal) * qty };
    });
    const subtotal = rows.reduce((a, r) => a + r.line, 0);
    return { subtotal, discount: 0, total: subtotal };
  }, [items]);

  const checkout = async () => {
    if (!userId || items.length === 0) return;
    const payload = {
      userId,
      itemIds: items.map(i => i.id),
      voucherCode: voucher || null,
      addonsByItemId: Object.fromEntries(items.map(i => [i.id, Array.isArray(i.meta?.addons) ? i.meta.addons : []]))
    };
    const res = await fetch('/api/cart/checkout', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
    const data = await res.json();
    if (!res.ok) { alert(data?.error || "Checkout failed"); return; }
    window.location.href = data.checkoutUrl;
  };

  if (loading) return <div className="min-h-[50vh] flex items-center justify-center">Loading...</div>;

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <h1 className="text-2xl font-bold text-black mb-4">My Cart</h1>
      {!userId && <p className="text-gray-600">Please log in to view your cart.</p>}
      {userId && items.length === 0 && <p className="text-gray-600">Your cart is empty.</p>}

      {userId && items.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="md:col-span-2 space-y-3">
            {items.map((it) => {
              const img =
                (it.meta?.images && it.meta.images[0]) ||
                it.meta?.image1 || "/no-image.png";
              const name = it.meta?.product_name || "Product";
              const base = Number(it.meta?.base_price || 0);
              const addons = Array.isArray(it.meta?.addons) ? it.meta.addons : [];
              const addonsTotal = addons.reduce((acc: number, a: any) => acc + Number(a.fee || 0), 0);
              const line = (base + addonsTotal) * (it.quantity || 1);

              return (
                <div key={it.id} className="flex items-center gap-4 border p-3 rounded">
                  <Image src={img} alt={name} width={80} height={80} className="rounded object-cover"/>
                  <div className="flex-1">
                    <p className="font-semibold text-black">{name}</p>
                    <p className="text-sm text-gray-600">Base: ₱{base.toLocaleString()} {addonsTotal > 0 && <>+ Add-ons: ₱{addonsTotal.toLocaleString()}</>}</p>
                    {addons.length > 0 && (
                      <ul className="text-xs text-gray-500 mt-1 list-disc ml-5">
                        {addons.map((a: any, idx: number) => <li key={idx}>{a.label} {a.value ? `(${a.value})` : ""} +₱{Number(a.fee || 0).toLocaleString()}</li>)}
                      </ul>
                    )}
                    <div className="flex items-center gap-2 mt-2">
                      <button className="px-2 py-1 border rounded" onClick={() => updateQty(it, -1)}>-</button>
                      <span className="min-w-8 text-center">{it.quantity}</span>
                      <button className="px-2 py-1 border rounded" onClick={() => updateQty(it, +1)}>+</button>
                      <button className="ml-4 text-red-600" onClick={() => removeItem(it)}>Remove</button>
                    </div>
                  </div>
                  <div className="font-semibold text-black">₱{line.toLocaleString()}</div>
                </div>
              );
            })}
          </div>

          <div className="border p-4 rounded space-y-3">
            <h2 className="font-semibold text-black">Payment Details</h2>
            <div className="flex items-center gap-2">
              <input className="border rounded px-2 py-1 flex-1" placeholder="Voucher code" value={voucher} onChange={(e) => setVoucher(e.target.value)} />
            </div>
            <div className="border-t pt-3 text-sm text-gray-700 space-y-1">
              <div className="flex justify-between"><span>Subtotal</span><span>₱{totals.subtotal.toLocaleString()}</span></div>
              <div className="flex justify-between"><span>Discount</span><span>₱{totals.discount.toLocaleString()}</span></div>
              <div className="flex justify-between font-semibold text-black"><span>Total</span><span>₱{totals.total.toLocaleString()}</span></div>
            </div>
            <button className="w-full bg-[#8B1C1C] text-white px-4 py-2 rounded hover:bg-[#a83232]" onClick={checkout}>Checkout</button>
          </div>
        </div>
      )}
    </div>
  );
}
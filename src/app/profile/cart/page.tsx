"use client";

import { useEffect, useState, useMemo } from "react";
import { createClient } from "@supabase/supabase-js";
import Link from "next/link";

type UserItem = {
  price: number | undefined;
  id: string;
  product_id: string;
  quantity: number;
  meta: any;
};

type Product = {
  id: string;
  name?: string;
  price?: number;
  images?: string[];
  image1?: string;
};

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

export default function CartPage() {
  const [userId, setUserId] = useState<string | null>(null);
  const [items, setItems] = useState<UserItem[]>([]);
  const [products, setProducts] = useState<Record<string, Product>>({});
  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState(false);
  const [voucher, setVoucher] = useState("");
  const [voucherInfo, setVoucherInfo] = useState<{ code: string; type: 'percent'|'amount'; value: number } | null>(null);
  const [applying, setApplying] = useState(false);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      const uid = data?.user?.id || null;
      setUserId(uid);
      if (!uid) return setLoading(false);
      loadCart(uid);
    });
  }, []);

  const loadCart = async (uid: string) => {
    setLoading(true);
    try {
      const res = await fetch(`/api/cart?userId=${uid}`, { cache: "no-store" });
      const json = await res.json();
      const cartItems: UserItem[] = json.items || [];
      setItems(cartItems);

      if (cartItems.length) {
        const ids = Array.from(new Set(cartItems.map(item => item.product_id)));
        const { data: prods } = await supabase
          .from("products")
          .select("id, name, price, images, image1")
          .in("id", ids);

        const map: Record<string, Product> = {};
        (prods || []).forEach(p => {
          map[p.id] = p;
        });
        setProducts(map);
      } else {
        setProducts({});
      }
    } finally {
      setLoading(false);
    }
  };

  const toggleAll = (value: boolean) => {
    if (!value) return setSelected({});
    const next: Record<string, boolean> = {};
    items.forEach(item => (next[item.id] = true));
    setSelected(next);
  };

  const selectedItems = useMemo(
    () => items.filter(item => selected[item.id]),
    [items, selected]
  );

  const totals = useMemo(() => {
    const base = selectedItems.reduce(
      (acc, item) => {
        const product = products[item.product_id];
        const unitPrice = Number(item.price ?? product?.price ?? 0);
        const quantity = Number(item.quantity || 1);
        const addons = Array.isArray(item.meta?.addons)
          ? item.meta.addons.reduce((sum: number, addon: any) => sum + Number(addon?.fee || 0), 0)
          : 0;
        const baseLine = unitPrice * quantity;
        const addonLine = addons * quantity;
        acc.subtotal += baseLine;
        acc.addons += addonLine;
        return acc;
      },
      { subtotal: 0, addons: 0 }
    );
    let preDiscount = base.subtotal + base.addons;
    let discount = 0;
    if (voucherInfo) {
      discount = voucherInfo.type === 'percent'
        ? preDiscount * (voucherInfo.value / 100)
        : voucherInfo.value;
      discount = Math.min(discount, preDiscount);
    }
    const reservationFee = selectedItems.length > 0 ? 500 : 0;
    const total = Math.max(0, preDiscount - discount + reservationFee);
    return { ...base, discount, reservationFee, total };
  }, [selectedItems, products, voucherInfo]);

  const updateQuantity = async (item: UserItem, delta: number) => {
    const next = Math.max(1, (item.quantity || 1) + delta);
    await fetch("/api/cart", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: item.id, quantity: next })
    });
    if (userId) loadCart(userId);
  };

  const removeItem = async (id: string) => {
    await fetch(`/api/cart?id=${id}`, { method: "DELETE" });
    if (userId) loadCart(userId);
  };

  const clearCart = async () => {
    if (!userId) return;
    await fetch(`/api/cart?clear=true&userId=${userId}`, { method: "DELETE" });
    loadCart(userId);
  };

  const proceedCheckout = async () => {
    if (!userId) {
      alert("Sign in required.");
      return;
    }
    if (!selectedItems.length) {
      alert("Select at least one item.");
      return;
    }
    setProcessing(true);
    try {
      const res = await fetch("/api/cart/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId,
          itemIds: selectedItems.map(item => item.id),
          voucherCode: voucherInfo?.code || null
        })
      });
      const json = await res.json();
      if (!res.ok || !json.checkoutUrl) throw new Error(json.error || "Checkout failed");
      window.location.href = json.checkoutUrl;
    } catch (error: any) {
      alert(error.message);
    } finally {
      setProcessing(false);
    }
  };

  const applyVoucher = async () => {
    if (!selectedItems.length) return alert("Select items first.");
    setApplying(true);
    try {
      const preDiscount = totals.subtotal + totals.addons;
      const res = await fetch("/api/discount-codes/validate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: voucher.trim(), subtotal: preDiscount })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "Invalid code");
      setVoucherInfo(data.discount);
    } catch (error: any) {
      alert(error.message);
      setVoucherInfo(null);
    } finally {
      setApplying(false);
    }
  };

  if (loading) {
    return <div className="p-8 text-center text-black">Loading cart…</div>;
  }

  if (!userId) {
    return (
      <div className="p-8 text-center text-black">
        Please <Link href="/login" className="text-[#8B1C1C] underline">sign in</Link> to view your cart.
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <input
            type="checkbox"
            checked={selectedItems.length === items.length && items.length > 0}
            onChange={event => toggleAll(event.target.checked)}
          />
          <span className="text-black">
            Select All ({selectedItems.length}/{items.length})
          </span>
        </div>
        <button onClick={clearCart} className="text-red-600 hover:underline">
          Clear Cart
        </button>
      </div>

      <div className="space-y-4">
        {items.map(item => {
          const product = products[item.product_id];
          const image =
            (product?.images && product.images[0]) ||
            product?.image1 ||
            "/no-orders.png";

          const selectedFlag = !!selected[item.id];
          const qty = item.quantity || 1;
          const unitPrice = Number(item.price ?? product?.price ?? 0);
          const addonsArr: any[] = Array.isArray(item.meta?.addons) ? item.meta.addons : [];
          const hasColorAddon = addonsArr.some((a: any) => a?.key === 'color_customization');
          const colorValue = (addonsArr.find((a: any) => a?.key === 'color_customization')?.value) || '';

          const updateItemMeta = async (nextAddons: any[]) => {
            await fetch("/api/cart", {
              method: "PATCH",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ id: item.id, meta: { ...(item.meta || {}), addons: nextAddons } })
            });
            if (userId) loadCart(userId);
          };

          const toggleAddon = async (checked: boolean) => {
            const next = [...addonsArr];
            const idx = next.findIndex((a: any) => a?.key === 'color_customization');
            if (checked) {
              if (idx === -1) {
                next.push({ key: 'color_customization', label: 'Color Customization', fee: 2500, value: colorValue || 'Custom color' });
              }
            } else {
              if (idx !== -1) next.splice(idx, 1);
            }
            await updateItemMeta(next);
          };

          const updateColorValue = async (val: string) => {
            const next = [...addonsArr];
            const idx = next.findIndex((a: any) => a?.key === 'color_customization');
            if (idx !== -1) {
              next[idx] = { ...next[idx], value: val || 'Custom color' };
              await updateItemMeta(next);
            }
          };

          return (
            <div key={item.id} className="bg-white border rounded-lg p-4">
              <div className="flex gap-4">
                <input
                  type="checkbox"
                  checked={selectedFlag}
                  onChange={(e) => setSelected(prev => ({ ...prev, [item.id]: e.target.checked }))}
                  className="mt-2"
                />
                <img src={image} alt={product?.name || 'Item'} className="w-24 h-24 object-cover rounded" />
                <div className="flex-1">
                  <div className="flex justify-between">
                    <div>
                      <div className="text-black font-semibold">{product?.name || 'Product'}</div>
                      <div className="text-black text-sm">₱{unitPrice.toLocaleString()} each</div>
                    </div>
                    <button onClick={() => removeItem(item.id)} className="text-red-600 text-sm hover:underline">Remove</button>
                  </div>

                  <div className="mt-3 flex items-center gap-2">
                    <button className="px-2 py-1 border rounded text-black" onClick={() => updateQuantity(item, -1)}>-</button>
                    <span className="w-10 text-center text-black">{qty}</span>
                    <button className="px-2 py-1 border rounded text-black" onClick={() => updateQuantity(item, 1)}>+</button>
                  </div>

                  <div className="mt-3">
                    <label className="inline-flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={hasColorAddon}
                        onChange={e => toggleAddon(e.target.checked)}
                      />
                      <span className="text-sm text-black">Color Customization (+₱2,500 per unit)</span>
                    </label>
                    {hasColorAddon && (
                      <input
                        className="mt-2 border rounded px-3 py-2 w-full text-black"
                        placeholder="Enter desired color"
                        defaultValue={colorValue}
                        onBlur={e => updateColorValue(e.target.value)}
                      />
                    )}
                  </div>

                  <div className="mt-3 text-sm text-black">
                    {addonsArr.length > 0 && (
                      <div>
                        Add-ons:
                        <ul className="list-disc ml-5">
                          {addonsArr.map((a: any, i: number) => (
                            <li key={i}>{a.label || a.key} - ₱{Number(a.fee || 0).toLocaleString()} {a.value ? `(${a.value})` : ''}</li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          );
        })}

        {items.length === 0 && (
          <div className="p-8 text-center text-black border rounded bg-white">Your cart is empty.</div>
        )}
      </div>

      <div className="bg-white border rounded p-4 max-w-md ml-auto space-y-2">
        <div className="text-black font-semibold text-lg">Payment Details</div>
        <div className="flex justify-between text-sm text-black">
          <span>Product Subtotal</span>
          <span>₱{totals.subtotal.toLocaleString()}</span>
        </div>
        <div className="flex justify-between text-sm text-black">
          <span>Add-ons</span>
          <span>₱{totals.addons.toLocaleString()}</span>
        </div>
        <div className="flex justify-between text-sm text-black">
          <span>Discount</span>
          <span className="text-green-700">-₱{Number(totals.discount || 0).toLocaleString()}</span>
        </div>
        <div className="flex justify-between text-sm text-black">
          <span>Reservation Fee</span>
          <span>₱{totals.reservationFee.toLocaleString()}</span>
        </div>
        <hr className="my-2" />
        <div className="text-base text-black font-semibold flex justify-between">
          <span>Total</span>
          <span>₱{totals.total.toLocaleString()}</span>
        </div>
        <button
          onClick={proceedCheckout}
          disabled={processing || !selectedItems.length}
          className="w-full mt-4 bg-[#8B1C1C] text-white rounded px-4 py-2 disabled:opacity-50"
        >
          {processing ? 'Processing…' : 'Pay Now'}
        </button>

        <div className="mt-4">
          <div className="text-black font-semibold mb-2 text-sm">Voucher / Discount</div>
          <div className="flex items-center gap-2">
            <input
              value={voucher}
              onChange={event => setVoucher(event.target.value)}
              placeholder="Enter voucher code"
              className="flex-1 border rounded px-3 py-2 text-black"
            />
            <button
              onClick={applyVoucher}
              disabled={applying || !selectedItems.length}
              className="px-4 py-2 bg-[#8B1C1C] text-white rounded disabled:opacity-50"
            >
              {applying ? 'Applying…' : 'Apply'}
            </button>
          </div>
          {voucherInfo && (
            <div className="mt-2 text-sm text-green-700">
              Applied {voucherInfo.code} ({voucherInfo.type === 'percent' ? `${voucherInfo.value}%` : `₱${voucherInfo.value.toLocaleString()}`})
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
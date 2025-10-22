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
  images?: string[]; // array of image URLs
  image1?: string;
  image2?: string;
};

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
const SUPABASE_ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";
const supabase = createClient(SUPABASE_URL, SUPABASE_ANON);

export default function UserProfilePage() {
  const [query, setQuery] = useState("");
  const [items, setItems] = useState<UserItem[]>([]);
  const [productsById, setProductsById] = useState<Record<string, Product>>({});
  const [loading, setLoading] = useState(true);
  const [userId, setUserId] = useState<string | null>(null);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      try {
        const { data: userData } = await supabase.auth.getUser();
        const uid = (userData as any)?.user?.id ?? null;
        if (!uid) {
          setUserId(null);
          setItems([]);
          setProductsById({});
          setLoading(false);
          return;
        }
        setUserId(uid);

        // Fetch user_items for both my-list and reserve
        const { data: uiData, error: uiErr } = await supabase
          .from("user_items")
          .select("*")
          .eq("user_id", uid)
          .in("item_type", ["my-list", "reserve"])
          .order("created_at", { ascending: false });

        if (uiErr) throw uiErr;
        const userItems = uiData ?? [];
        setItems(userItems);

        // Fetch products for product_ids found
        const productIds = Array.from(new Set(userItems.map((u) => u.product_id).filter(Boolean)));
        if (productIds.length) {
          const { data: prodData, error: prodErr } = await supabase
            .from("products")
            .select("id, name, images, image1, image2")
            .in("id", productIds);
          if (prodErr) throw prodErr;
          const map: Record<string, Product> = {};
          (prodData ?? []).forEach((p) => {
            map[p.id] = p;
          });
          setProductsById(map);
        } else {
          setProductsById({});
        }
      } catch (e) {
        console.error("load all items error", e);
        setItems([]);
        setProductsById({});
      } finally {
        setLoading(false);
      }
    };

    load();
  }, []);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return items;
    return items.filter((it) => {
      const product = productsById[it.product_id];
      return (
        it.id.toLowerCase().includes(q) ||
        (product?.name?.toLowerCase().includes(q) ?? false)
      );
    });
  }, [items, query, productsById]);

  return (
    <div className="min-h-screen flex flex-col bg-gray-50">
      <main className="flex-1 flex flex-row">
        {/* Main Content */}
        <section className="flex-1 flex flex-col px-8 py-8">
          {/* Tabs */}
          <div className="flex gap-2 mb-4">
            {/* You can add tabs here if needed */}
          </div>

          {/* Search Bar */}
          <div className="mb-4">
            <input
              type="text"
              placeholder="Search by order id or product name"
              className="w-full border rounded px-4 py-2 bg-gray-100 text-gray-700"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>
          <hr className="mb-4" />

          {/* Results */}
          <div className="flex-1">
            {filtered.length ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {filtered.map((it) => {
                  const product = productsById[it.product_id];
                  // Get the first image from images array, or fallback to image1/image2
                  let imageUrl =
                    (product?.images && product.images.length && product.images[0]) ||
                    product?.image1 ||
                    product?.image2 ||
                    "/no-orders.png";
                  return (
                    <div key={it.id} className="bg-white p-4 rounded shadow flex items-center justify-between">
                      <div className="flex items-center gap-4">
                        <Image
                          src={imageUrl}
                          alt={product?.name || "Product"}
                          width={80}
                          height={80}
                          className="rounded border"
                        />
                        <div>
                          <h3 className="font-semibold text-black">{product?.name || "Unknown Product"}</h3>
                          <div className="text-sm text-gray-500">Type: {it.item_type}</div>
                        </div>
                      </div>
                      <Link href={`/Product/details?id=${it.product_id}`} className="bg-[#8B1C1C] text-white px-4 py-2 rounded hover:bg-[#a82c2c]">
                        View
                      </Link>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="flex flex-1 items-center justify-center border rounded bg-white py-16">
                <div className="flex flex-col items-center">
                  {/* <Image src="/no-orders.png" alt="No Orders" width={80} height={80} /> */}
                  <p className="mt-4 text-gray-600 text-lg font-medium">{query ? "No items match your search" : "No Orders yet"}</p>
                </div>
              </div>
            )}
          </div>
        </section>
      </main>
    </div>
  );
}
// app/products/page.tsx
"use client";

import Image from "next/image";
import Link from "next/link";
import { Suspense, useEffect, useState } from "react";
import TopNavBarLoggedIn from "@/components/TopNavBarLoggedIn";
import Footer from "@/components/Footer";
import { createClient } from "@supabase/supabase-js";
import { useSearchParams, useRouter } from "next/navigation";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

function ProductsPageContent() {
  const [products, setProducts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const searchParams = useSearchParams();
  const router = useRouter();

  useEffect(() => {
    const fetchProducts = async () => {
      try {
        const res = await fetch("/api/products");
        let data = await res.json();
        if (Array.isArray(data)) {
          setProducts(data);
        } else {
          setProducts([]);
          console.error("API did not return an array:", data);
        }
      } catch (err) {
        setProducts([]);
        console.error("Fetch error:", err);
      }
      setLoading(false);
    };
    fetchProducts();
  }, []);

  // Get unique categories from products
  const categories = [
    "All Products",
    "Doors",
    "Windows",
    "Enclosure",
    "Casement",
    "Sliding",
    "Railings",
    "Canopy",
    "Curtain Wall",
  ];

  const [selectedCategory, setSelectedCategory] = useState("All Products");

  // Set selected category from query param on mount / param change
  useEffect(() => {
    const param = searchParams?.get("category");
    if (param && categories.includes(param)) {
      setSelectedCategory(param);
    } else {
      setSelectedCategory("All Products");
    }
  }, [searchParams]);

  // when clicking category buttons update the url param
  const selectCategory = (cat: string) => {
    setSelectedCategory(cat);
    const url = new URL(window.location.href);
    if (cat === "All Products") {
      url.searchParams.delete("category");
    } else {
      url.searchParams.set("category", cat);
    }
    router.push(url.pathname + url.search);
  };

  // search state
  const [search, setSearch] = useState("");

  // Helper to get the first available image from product table
  const getProductImage = (prod: any) => {
    return (
      prod.image1 ||
      prod.image2 ||
      prod.image3 ||
      prod.image4 ||
      prod.image5 ||
      "https://placehold.co/400x300?text=No+Image"
    );
  };

  // Filter products by category + search
  const filteredProducts = products.filter((p) => {
    const matchesCategory =
      selectedCategory === "All Products" || (p.category || "") === selectedCategory;
    const q = search.trim().toLowerCase();
    if (!q) return matchesCategory;
    const inName = (p.name || "").toLowerCase().includes(q);
    const inDesc = (p.description || "").toLowerCase().includes(q);
    const inCategory = (p.category || "").toLowerCase().includes(q);
    return matchesCategory && (inName || inDesc || inCategory);
  });

  return (
    <div className="min-h-screen flex flex-col">
      <TopNavBarLoggedIn />
      <main className="flex-1 bg-white">
        {/* Search bar */}
        <div className="py-6">
          <div className="max-w-6xl mx-auto px-4 flex justify-center text-black">
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search products by name, description or category..."
              className="w-full max-w-md border rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-red-600"
            />
          </div>
        </div>

        {/* Category Tabs */}
        <section className="py-6 border-b">
          <div className="flex flex-wrap justify-center gap-4 text-sm font-medium">
            {categories.map((cat) => (
              <button
                key={cat}
                onClick={() => selectCategory(cat)}
                className={`px-4 py-2 rounded transition ${
                  selectedCategory === cat
                    ? "text-red-600 border-b-2 border-red-600"
                    : "text-gray-700 hover:text-red-600"
                }`}
              >
                {cat}
              </button>
            ))}
          </div>
        </section>

        {/* Product Grid */}
        <section className="py-10 max-w-6xl mx-auto px-4">
          {loading ? (
            <div className="text-center text-gray-500">Loading products...</div>
          ) : Array.isArray(filteredProducts) && filteredProducts.length > 0 ? (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-6">
              {filteredProducts.map((prod) => (
                <Link
                  key={prod.id}
                  href={`/Product/details?id=${prod.id}`}
                  className="border p-2 rounded hover:shadow-lg transition block"
                >
                  {getProductImage(prod) && (
                    <Image
                      src={getProductImage(prod)}
                      alt={prod.name}
                      width={400}
                      height={300}
                      className="w-full h-40 object-cover rounded"
                    />
                  )}
                  <p className="mt-2 text-center text-base md:text-lg font-medium text-black">
                    {prod.name}
                  </p>
                  {/* small underline below product name */}
                  <div className="w-6 h-0.5 bg-red-600 mx-auto mt-1" aria-hidden="true" />

                  {/* Price and Inventory */}
                  <div className="mt-2 flex flex-col items-center text-sm text-gray-700">
                    <span>
                      <b>Price:</b> {prod.price !== undefined && prod.price !== null ? `₱${prod.price}` : "—"}
                    </span>
                    <span>
                      <b>Inventory:</b> {prod.inventory !== undefined && prod.inventory !== null ? prod.inventory : "—"}
                    </span>
                  </div>
                </Link>
              ))}
            </div>
          ) : (
            <div className="text-center text-gray-500">No products found.</div>
          )}
        </section>
      </main>
      <Footer />
    </div>
  );
}

export default function ProductsPage() {
  return (
    <Suspense fallback={<div className="min-h-screen flex items-center justify-center">Loading products...</div>}>
      <ProductsPageContent />
    </Suspense>
  );
}
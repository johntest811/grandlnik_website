"use client";
import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import Image from "next/image";
import Link from "next/link";
import TopNavBarLoggedIn from "@/components/TopNavBarLoggedIn";
import Footer from "@/components/Footer";
import dynamic from "next/dynamic";
import { createClient } from "@supabase/supabase-js";
import { useRouter } from "next/navigation";

const ThreeDFBXViewer = dynamic(() => import("./ThreeDFBXViewer"), { ssr: false });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

function ProductDetailsPageContent() {
  const searchParams = useSearchParams();
  const productId = searchParams.get("id");
  const [product, setProduct] = useState<any>(null);
  const [carouselIdx, setCarouselIdx] = useState(0);
  const [show3D, setShow3D] = useState(false);
  const router = useRouter();

  useEffect(() => {
    const fetchProduct = async () => {
      if (!productId) return;
      const res = await fetch(`/api/products?id=${productId}`);
      const data = await res.json();

      const additionalfeatures = Array.isArray(data?.additionalfeatures)
        ? data.additionalfeatures.join("\n")
        : (data?.additionalfeatures ?? (data?.features?.length ? data.features.join("\n") : ""));

      setProduct({ ...data, additionalfeatures });
    };
    fetchProduct();
  }, [productId]);

  if (!product) {
    return <div className="min-h-screen flex items-center justify-center">Loading...</div>;
  }

  const images: string[] = product.images?.length
    ? product.images
    : [product.image1, product.image2, product.image3, product.image4, product.image5].filter(Boolean);

  // Get FBX URLs - prioritize fbx_urls array, fallback to single fbx_url
  const fbxUrls: string[] = product.fbx_urls && Array.isArray(product.fbx_urls) && product.fbx_urls.length > 0
    ? product.fbx_urls.filter((url: string) => url && url.trim() !== '')
    : product.fbx_url ? [product.fbx_url] : [];

  const handlePrev = () => setCarouselIdx((idx) => (idx === 0 ? images.length - 1 : idx - 1));
  const handleNext = () => setCarouselIdx((idx) => (idx === images.length - 1 ? 0 : idx + 1));

  // Add to Wishlist with confirmation
  const handleAddToWishlist = async () => {
    if (!window.confirm("Add this product to your wishlist?")) return;
    const { data: userData } = await supabase.auth.getUser();
    const userId = (userData as any)?.user?.id;
    if (!userId) {
      alert("Please log in to add to wishlist.");
      return;
    }
    const { error } = await supabase
      .from("user_items")
      .insert([
        {
          user_id: userId,
          product_id: product.id,
          item_type: "my-list",
          status: "active",
          quantity: 1,
          created_at: new Date().toISOString(),
        },
      ]);
    if (error) {
      alert("Could not add to wishlist.");
      return;
    }
    router.push("/profile/my-list");
  };

  // Reserve Now - redirect to reservation form with product data
  const handleReserveNow = async () => {
    const { data: userData } = await supabase.auth.getUser();
    const userId = (userData as any)?.user?.id;
    if (!userId) {
      alert("Please log in to make a reservation.");
      return;
    }

    // Check inventory
    if (product.inventory <= 0) {
      alert("Sorry, this product is currently out of stock and cannot be reserved.");
      return;
    }

    // Redirect to reservation form with product ID
    router.push(`/reservation?productId=${product.id}`);
  };

  const isOutOfStock = product.inventory <= 0;
  const has3DModels = fbxUrls.length > 0;

  return (
    <div className="min-h-screen bg-white flex flex-col">
      <TopNavBarLoggedIn />
      <div className="flex-1 flex flex-col items-center py-10 bg-white">
        <div className="w-full max-w-4xl xl:max-w-6xl bg-white rounded shadow p-12">
          {/* Carousel */}
          <div className="relative flex flex-col items-center">
            <Image
              src={images[carouselIdx] || "https://placehold.co/800x500?text=No+Image"}
              alt={product.name}
              width={1200}
              height={700}
              className="w-full h-[36rem] object-cover rounded"
            />
            {/* Arrow buttons */}
            <button
              className="absolute left-2 top-1/2 -translate-y-1/2 text-black hover:text-red-600 px-2 py-2 rounded-full transition flex items-center justify-center"
              style={{ background: "none", zIndex: 2 }}
              onClick={handlePrev}
              aria-label="Previous"
            >
              <svg width="40" height="40" viewBox="0 0 40 40" fill="none">
                <path d="M24 14L18 20L24 26" stroke="black" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </button>
            <button
              className="absolute right-2 top-1/2 -translate-y-1/2 text-black hover:text-red-600 px-2 py-2 rounded-full transition flex items-center justify-center"
              style={{ background: "none", zIndex: 2 }}
              onClick={handleNext}
              aria-label="Next"
            >
              <svg width="40" height="40" viewBox="0 0 40 40" fill="none">
                <path d="M16 14L22 20L16 26" stroke="black" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </button>
            {/* Thumbnails */}
            <div className="flex gap-2 mt-4 justify-center">
              {images.map((img, idx) => (
                <Image
                  key={idx}
                  src={img}
                  alt={`Thumbnail ${idx + 1}`}
                  width={90}
                  height={90}
                  className={`rounded border cursor-pointer ${carouselIdx === idx ? "border-red-600" : "border-gray-300"}`}
                  onClick={() => setCarouselIdx(idx)}
                />
              ))}
            </div>
          </div>

          {/* Product Info */}
          <div className="mt-10">
            <h2 className="text-4xl font-bold text-black">{product.name}</h2>

            {product.fullproductname && (
              <div className="text-2xl text-gray-600 mt-1">{product.fullproductname}</div>
            )}

            <h3 className="text-2xl font-semibold text-gray-600 mt-2">{product.subtitle || product.series}</h3>
            
            {/* Stock Status */}
            <div className="mt-4">
              <span className={`px-3 py-1 rounded-full text-sm font-medium ${
                isOutOfStock 
                  ? 'bg-red-100 text-red-800' 
                  : product.inventory <= 5 
                    ? 'bg-yellow-100 text-yellow-800' 
                    : 'bg-green-100 text-green-800'
              }`}>
                {isOutOfStock 
                  ? 'Out of Stock' 
                  : `${product.inventory} in stock`
                }
              </span>
              {product.price && (
                <span className="ml-4 text-2xl font-bold text-green-600">
                  ₱{product.price.toLocaleString()}
                </span>
              )}
            </div>

            {/* 3D Models Info */}
            {has3DModels && (
              <div className="mt-3">
                <span className="px-3 py-1 bg-blue-100 text-blue-800 rounded-full text-sm font-medium">
                  {fbxUrls.length} 3D Model{fbxUrls.length > 1 ? 's' : ''} Available
                </span>
              </div>
            )}
          </div>
          
          {/* Actions */}
          <div className="flex gap-8 mt-10">
            <button
              disabled={!has3DModels}
              onClick={() => setShow3D(true)}
              className={`flex flex-col items-center px-6 py-4 rounded border transition-all duration-200
                ${has3DModels
                  ? "bg-black text-white hover:bg-gray-900 hover:scale-105"
                  : "bg-gray-200 text-gray-400 cursor-not-allowed"
                }`}
              title={has3DModels ? `View ${fbxUrls.length} 3D Model${fbxUrls.length > 1 ? 's' : ''}` : "No 3D models available"}
            >
              <span className="font-bold text-base">3D</span>
              <span className="text-base">
                3D View {has3DModels && fbxUrls.length > 1 ? `(${fbxUrls.length})` : ''}
              </span>
            </button>
            
            <button
              onClick={handleAddToWishlist}
              className="flex flex-col items-center px-6 py-4 rounded border bg-gray-100 text-gray-700 transition-all duration-200 hover:bg-red-100 hover:text-red-700 hover:scale-105"
            >
              <span className="font-bold text-base">♥</span>
              <span className="text-base">Add to Wishlist</span>
            </button>
            
            <button
              onClick={handleReserveNow}
              disabled={isOutOfStock}
              className={`px-8 py-4 rounded font-semibold text-xl transition-all duration-200 ${
                isOutOfStock
                  ? 'bg-gray-400 text-white cursor-not-allowed'
                  : 'bg-red-600 text-white hover:bg-red-700 hover:scale-105'
              }`}
            >
              {isOutOfStock ? 'Out of Stock' : 'Reserve Now (₱500)'}
            </button>
          </div>

          {/* Key Features */}
          <div className="mt-12 border-t pt-8">
            <div className="mb-6">
              <label className="block text-lg font-semibold text-gray-700 mb-2">Product Description</label>
              <p className="text-gray-800 text-sm md:text-base leading-relaxed">
                {product.description}
              </p>
            </div>

            <h4 className="text-red-700 font-bold mb-4 text-xl">Key Features</h4>

            {/* Dimensions & Material summary */}
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 mb-6">
              <div className="bg-gray-50 p-3 rounded border flex flex-col items-center justify-center text-center">
                <div className="text-sm text-gray-500">Height</div>
                <div className="text-lg font-semibold text-gray-500">{product.height ?? "—"}</div>
              </div>
              <div className="bg-gray-50 p-3 rounded border flex flex-col items-center justify-center text-center">
                <div className="text-sm text-gray-500">Width</div>
                <div className="text-lg font-semibold text-gray-500">{product.width ?? "—"}</div>
              </div>
              <div className="bg-gray-50 p-3 rounded border flex flex-col items-center justify-center text-center">
                <div className="text-sm text-gray-500">Thickness</div>
                <div className="text-lg font-semibold text-gray-500">{product.thickness ?? "—"}</div>
              </div>
              <div className="bg-gray-50 p-3 rounded border flex flex-col items-center justify-center text-center">
                <div className="text-sm text-gray-500">Material</div>
                <div className="text-lg font-semibold text-gray-500">{product.material ?? "Wood"}</div>
              </div>
              <div className="bg-gray-50 p-3 rounded border col-span-2 sm:col-span-1 flex flex-col items-center justify-center text-center">
                <div className="text-sm text-gray-500">Type</div>
                <div className="text-lg font-semibold text-gray-500">{product.type ?? "Clear"}</div>
              </div>
            </div>

            <div className="mt-2">
              <h5 className="text-lg font-semibold text-red-700 mb-2">Additional Features</h5>
              <div className="text-lg text-gray-700 whitespace-pre-line">
                {product.additionalfeatures
                  ?? (product.features?.length ? product.features.join("\n") : "")
                }
              </div>
            </div>
          </div>
        </div>
      </div>
      <Footer />

      {/* 3D Viewer Modal */}
      {show3D && has3DModels && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="w-full max-w-6xl max-h-[90vh] bg-white rounded-lg shadow-lg p-4 relative flex flex-col">
            {/* Stylish Circular Close Button */}
            <button
              className="absolute top-6 right-6 z-20 group w-12 h-12 bg-white/90 backdrop-blur-sm hover:bg-white border border-gray-200 rounded-full shadow-lg transition-all duration-300 ease-in-out hover:scale-110 hover:shadow-xl flex items-center justify-center"
              onClick={() => setShow3D(false)}
              aria-label="Close 3D viewer"
            >
              {/* X Icon */}
              <svg 
                className="w-5 h-5 text-gray-600 group-hover:text-red-500 transition-colors duration-300" 
                fill="none" 
                stroke="currentColor" 
                viewBox="0 0 24 24"
              >
                <path 
                  strokeLinecap="round" 
                  strokeLinejoin="round" 
                  strokeWidth={2.5} 
                  d="M6 18L18 6M6 6l12 12" 
                />
              </svg>
              
              {/* Subtle hover ring effect */}
              <div className="absolute inset-0 rounded-full border-2 border-transparent group-hover:border-red-200 transition-all duration-300 scale-110 opacity-0 group-hover:opacity-100"></div>
            </button>

            <div className="flex-1 w-full flex items-center justify-center overflow-hidden">
              <ThreeDFBXViewer fbxUrls={fbxUrls} />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function ProductDetailsPage() {
  return (
    <Suspense fallback={<div className="min-h-screen flex items-center justify-center">Loading product...</div>}>
      <ProductDetailsPageContent />
    </Suspense>
  );
}
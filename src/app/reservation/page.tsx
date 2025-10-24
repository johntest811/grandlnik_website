"use client";

import { Suspense, useState, useEffect } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

type Product = {
  id: string;
  name: string;
  fullproductname?: string;
  description?: string;
  price: number;
  inventory: number;
  width?: number;
  height?: number;
  thickness?: number;
  material?: string;
  type?: string;
  category?: string;
  additionalfeatures?: string;
  image1?: string;
  images?: string[];
};

type Address = {
  id: string;
  first_name: string;
  last_name: string;
  full_name: string;
  phone: string;
  address: string;
  is_default: boolean;
};

type VoucherInfo = { code: string; type: 'percent' | 'amount'; value: number };

function ReservationPageContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const productId = searchParams.get("productId");
  
  const [product, setProduct] = useState<Product | null>(null);
  const [addresses, setAddresses] = useState<Address[]>([]);
  const [selectedAddressId, setSelectedAddressId] = useState<string>("");
  const [selectedBranch, setSelectedBranch] = useState<string>("");
  const [userId, setUserId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  
  const [formData, setFormData] = useState({
    quantity: 1,
    customWidth: "",
    customHeight: "",
    customThickness: "",
    specialInstructions: "",
    colorCustomization: false,
    colorText: ""
  });
  const [voucherCode, setVoucherCode] = useState("");
  const [voucherInfo, setVoucherInfo] = useState<VoucherInfo | null>(null);
  const [applyingVoucher, setApplyingVoucher] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState<"paymongo" | "paypal">("paymongo");

  // Branch options
  const branches = [
    "BALINTAWAK BRANCH",
    "STA. ROSA BRANCH", 
    "UGONG BRANCH",
    "ALABANG SHOWROOM",
    "IMUS BRANCH",
    "PAMPANGA SHOWROOM",
    "HIHOME BRANCH",
    "MC HOME DEPO ORTIGAS",
    "SAN JUAN CITY",
    "CW COMMONWEALTH",
    "MC HOME DEPO BGC"
  ];

  // Back button handler
  const handleGoBack = () => {
    if (productId) {
      // Go back to product details page
      router.push(`/Product/details?id=${productId}`);
    } else {
      // Fallback to products listing
      router.push("/Product");
    }
  };

  useEffect(() => {
    const loadData = async () => {
      try {
        // Get current user
        const { data: userData, error: userError } = await supabase.auth.getUser();
        
        if (userError || !userData?.user) {
          router.push("/login");
          return;
        }

        const currentUserId = userData.user.id;
        setUserId(currentUserId);

        // Load product
        if (productId) {
          const { data: productData, error: productError } = await supabase
            .from("products")
            .select("*")
            .eq("id", productId)
            .single();

          if (productError) {
            console.error("Error loading product:", productError);
            alert("Product not found");
            router.push("/Product");
            return;
          }

          setProduct(productData);
        }

        // Load user addresses
        const { data: addressData, error: addressError } = await supabase
          .from("addresses")
          .select("*")
          .eq("user_id", currentUserId)
          .order("is_default", { ascending: false });

        if (!addressError && addressData) {
          setAddresses(addressData);
          const defaultAddress = addressData.find(addr => addr.is_default);
          if (defaultAddress) {
            setSelectedAddressId(defaultAddress.id);
          }
        }

      } catch (error) {
        console.error("Error loading data:", error);
      } finally {
        setLoading(false);
      }
    };

    loadData();
  }, [productId, router]);

  const productSubtotal = (product?.price || 0) * (formData.quantity || 1);
  const addonsTotal = formData.colorCustomization ? 2500 * (formData.quantity || 1) : 0;
  const preDiscount = productSubtotal + addonsTotal;
  const discountValue = voucherInfo
    ? voucherInfo.type === 'percent'
      ? Math.min(preDiscount, preDiscount * (voucherInfo.value / 100))
      : Math.min(preDiscount, voucherInfo.value)
    : 0;
  const discountedTotal = Math.max(0, preDiscount - discountValue);
  const reservationFee = 500;
  const balanceDue = Math.max(0, discountedTotal - reservationFee);

  const applyVoucher = async () => {
    if (!preDiscount) {
      alert("Please set quantity first.");
      return;
    }
    setApplyingVoucher(true);
    try {
      const res = await fetch("/api/discount-codes/validate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: voucherCode.trim(), subtotal: preDiscount })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "Invalid code");
      setVoucherInfo(data.discount);
    } catch (e: any) {
      alert(e.message);
      setVoucherInfo(null);
    } finally {
      setApplyingVoucher(false);
    }
  };

  const addToCartInstead = async () => {
    if (!userId || !product) return;
    try {
      const addons = formData.colorCustomization
        ? [{ key: 'color_customization', label: 'Color Customization', fee: 2500, value: formData.colorText || 'Custom color' }]
        : [];
      const res = await fetch("/api/cart", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId,
          productId: product.id,
          quantity: formData.quantity,
          meta: {
            custom_dimensions: {
              width: parseFloat(formData.customWidth) || product.width,
              height: parseFloat(formData.customHeight) || product.height,
              thickness: parseFloat(formData.customThickness) || product.thickness,
            },
            addons,
            voucher_code: voucherInfo?.code || null,
            voucher_discount: discountValue,
          }
        })
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error || "Failed to add to cart");
      router.push("/profile/cart");
    } catch (e: any) {
      alert(e.message);
    }
  };

  const handleReservation = async () => {
    if (!userId || !product || !selectedAddressId || !selectedBranch) {
      alert("Please complete all required fields including branch selection");
      return;
    }
    if (product.inventory < formData.quantity) {
      alert("Insufficient inventory for this quantity");
      return;
    }
    setSubmitting(true);
    try {
      const selectedAddress = addresses.find(addr => addr.id === selectedAddressId);
      if (!selectedAddress) throw new Error("Selected address not found");

      const addons = formData.colorCustomization
        ? [{ key: 'color_customization', label: 'Color Customization', fee: 2500, value: formData.colorText || 'Custom color' }]
        : [];

      const userItemData = {
        user_id: userId,
        product_id: product.id,
        item_type: "reservation",
        status: "pending_payment",
        quantity: formData.quantity,
        delivery_address_id: selectedAddressId,
        special_instructions: formData.specialInstructions || null,
        payment_status: "pending",
        reservation_fee: reservationFee,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        meta: {
          product_name: product.name,
          product_fullname: product.fullproductname,
          product_price: product.price,
          product_category: product.category,
          product_type: product.type,
          product_material: product.material,
          product_description: product.description,
          additional_features: product.additionalfeatures,
          payment_method: paymentMethod,
          selected_branch: selectedBranch,
          custom_dimensions: {
            width: parseFloat(formData.customWidth) || product.width,
            height: parseFloat(formData.customHeight) || product.height,
            thickness: parseFloat(formData.customThickness) || product.thickness,
          },
          delivery_address: {
            first_name: selectedAddress.first_name,
            last_name: selectedAddress.last_name,
            full_name: selectedAddress.full_name,
            phone: selectedAddress.phone,
            address: selectedAddress.address
          },
          addons,
          subtotal: productSubtotal,
          addons_total: addonsTotal,
          discount_value: discountValue,
          total_amount: discountedTotal,
          reservation_fee: reservationFee,
          balance_due: balanceDue,
          voucher_code: voucherInfo?.code || null,
          created_by: 'user',
          reservation_created_at: new Date().toISOString()
        }
      };

      const { data: userItem, error: userItemError } = await supabase
        .from("user_items")
        .insert([userItemData])
        .select()
        .single();

      if (userItemError) throw new Error(`Database error: ${userItemError.message}`);

      const paymentData = {
        amount: reservationFee,
        currency: paymentMethod === 'paypal' ? 'USD' : 'PHP',
        user_item_id: userItem.id,
        product_name: product.name,
        payment_type: 'reservation',
        payment_method: paymentMethod,
        success_url: `${window.location.origin}/reservation/success?reservation_id=${userItem.id}`,
        cancel_url: `${window.location.origin}/reservation?productId=${product.id}`,
        voucher: voucherInfo || undefined,
      };

      const response = await fetch('/api/create-payment-session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(paymentData)
      });
      const { checkoutUrl, sessionId, error: paymentError } = await response.json();
      if (paymentError || !checkoutUrl) throw new Error(paymentError || 'Payment session creation failed');

      await supabase
        .from('payment_sessions')
        .insert({
          user_id: userId,
          user_item_id: userItem.id,
          stripe_session_id: sessionId,
          amount: reservationFee,
          currency: paymentMethod === 'paypal' ? 'USD' : 'PHP',
          status: 'pending',
          payment_type: 'reservation',
          payment_provider: paymentMethod,
          created_at: new Date().toISOString()
        });

      window.location.href = checkoutUrl;
    } catch (error: any) {
      alert("Error creating reservation: " + (error?.message || "Unknown error occurred"));
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 py-8">
        <div className="container mx-auto px-4">
          <div className="text-center">Loading...</div>
        </div>
      </div>
    );
  }

  if (!product) {
    return (
      <div className="min-h-screen bg-gray-50 py-8">
        <div className="container mx-auto px-4">
          <div className="text-center">Product not found</div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 py-8">
      <div className="container mx-auto px-4 max-w-6xl">
        <button onClick={handleGoBack} className="flex items-center gap-2 text-gray-700 hover:text-[#8B1C1C] mb-3">
          <span>←</span> Back to Product
        </button>

        <h1 className="text-2xl md:text-3xl font-bold text-center text-black mb-4">Reserve Your Product</h1>

        <div className="bg-white rounded-lg shadow-lg p-6 md:p-8 text-black">
          <div className="flex flex-col md:flex-row gap-8">
            {/* Left: Product hero and info */}
            <div className="flex-1">
              <div className="w-full aspect-[16/9] bg-gray-100 rounded overflow-hidden mb-4">
                {/* simple hero image */}
                <img
                  src={
                    (product?.images && product.images[0]) ||
                    product?.image1 ||
                    "/no-orders.png"
                  }
                  alt={product?.name || "Product"}
                  className="w-full h-full object-cover"
                />
              </div>

              <h2 className="text-2xl font-bold">{product.name}</h2>
              <div className="text-gray-600 mt-1">{product.fullproductname || ''}</div>

              <div className="mt-3 flex items-center gap-3">
                <div className="text-2xl font-extrabold text-green-600">
                  ₱{Number(product.price).toLocaleString()}
                </div>
                <span className="text-xs px-2 py-1 bg-gray-100 rounded">
                  Stock: {product.inventory}
                </span>
              </div>

              <div className="mt-6">
                <h3 className="font-semibold text-gray-800 mb-2">Description</h3>
                <p className="text-gray-700 text-sm leading-6">
                  {product.description || '—'}
                </p>
              </div>

              <div className="mt-6">
                <h3 className="font-semibold text-gray-800 mb-2">Product Specifications</h3>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-x-8 gap-y-3 text-sm text-gray-700">
                  <div><span className="text-gray-500">Category:</span> {product.category || '—'}</div>
                  <div><span className="text-gray-500">Type:</span> {product.type || '—'}</div>
                  <div><span className="text-gray-500">Material:</span> {product.material || '—'}</div>
                  <div><span className="text-gray-500">Width:</span> {product.width ?? '—'} cm</div>
                  <div><span className="text-gray-500">Height:</span> {product.height ?? '—'} cm</div>
                  <div><span className="text-gray-500">Thickness:</span> {product.thickness ?? '—'} cm</div>
                </div>
              </div>

              {product.additionalfeatures && (
                <div className="mt-6">
                  <h3 className="font-semibold text-gray-800 mb-2">Additional Features</h3>
                  <ul className="list-disc ml-6 text-sm text-gray-700 whitespace-pre-line">
                    {String(product.additionalfeatures).split('\n').filter(Boolean).map((l, i) => (
                      <li key={i}>{l}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>

            {/* Right: Reservation details */}
            <div className="w-full md:w-80">
              <h2 className="text-lg font-semibold mb-3">Reservation Details</h2>

              <div className="space-y-3">
                <div>
                  <label className="text-sm text-gray-600">Quantity *</label>
                  <input
                    type="number"
                    min={1}
                    value={formData.quantity}
                    onChange={(e) => setFormData({ ...formData, quantity: Math.max(1, Number(e.target.value||1)) })}
                    className="w-full border rounded px-3 py-2"
                  />
                </div>

                <div>
                  <label className="text-sm text-gray-600">Delivery Address *</label>
                  <select
                    className="w-full border rounded px-3 py-2"
                    value={selectedAddressId}
                    onChange={(e) => setSelectedAddressId(e.target.value)}
                  >
                    <option value="">Select Address</option>
                    {addresses.map(a => (
                      <option key={a.id} value={a.id}>
                        {a.full_name} - {a.address}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="text-sm text-gray-600">Store Branch *</label>
                  <select
                    className="w-full border rounded px-3 py-2"
                    value={selectedBranch}
                    onChange={(e) => setSelectedBranch(e.target.value)}
                  >
                    <option value="">Select Store Branch</option>
                    {branches.map(b => <option key={b} value={b}>{b}</option>)}
                  </select>
                </div>

                <div>
                  <label className="text-sm text-gray-600">Custom Dimensions (Optional)</label>
                  <div className="grid grid-cols-3 gap-2 mt-1">
                    <input
                      placeholder="Width"
                      className="border rounded px-2 py-2"
                      value={formData.customWidth}
                      onChange={e => setFormData({ ...formData, customWidth: e.target.value })}
                    />
                    <input
                      placeholder="Height"
                      className="border rounded px-2 py-2"
                      value={formData.customHeight}
                      onChange={e => setFormData({ ...formData, customHeight: e.target.value })}
                    />
                    <input
                      placeholder="Thick."
                      className="border rounded px-2 py-2"
                      value={formData.customThickness}
                      onChange={e => setFormData({ ...formData, customThickness: e.target.value })}
                    />
                  </div>
                </div>

                <div>
                  <label className="inline-flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={formData.colorCustomization}
                      onChange={(e) => setFormData({ ...formData, colorCustomization: e.target.checked })}
                    />
                    <span className="text-sm">Color Customization (+₱2,500 per unit)</span>
                  </label>
                  {formData.colorCustomization && (
                    <input
                      placeholder="Enter desired color"
                      className="mt-2 w-full border rounded px-3 py-2"
                      value={formData.colorText}
                      onChange={(e) => setFormData({ ...formData, colorText: e.target.value })}
                    />
                  )}
                </div>

                <div>
                  <label className="text-sm text-gray-600">Special Instructions</label>
                  <textarea
                    className="w-full border rounded px-3 py-2"
                    rows={3}
                    value={formData.specialInstructions}
                    onChange={(e) => setFormData({ ...formData, specialInstructions: e.target.value })}
                  />
                </div>

                <div>
                  <label className="text-sm text-gray-600">Discount Code</label>
                  <div className="flex gap-2 mt-1">
                    <input
                      className="flex-1 border rounded px-3 py-2"
                      placeholder="Enter voucher code"
                      value={voucherCode}
                      onChange={(e) => setVoucherCode(e.target.value)}
                    />
                    <button
                      onClick={applyVoucher}
                      disabled={applyingVoucher}
                      className="px-4 py-2 bg-[#8B1C1C] text-white rounded disabled:opacity-60"
                    >
                      {applyingVoucher ? 'Applying...' : 'Apply'}
                    </button>
                  </div>
                  {voucherInfo && (
                    <div className="text-xs text-green-700 mt-2">
                      Applied {voucherInfo.code} ({voucherInfo.type === 'percent' ? `${voucherInfo.value}%` : `₱${voucherInfo.value.toLocaleString()}`})
                    </div>
                  )}
                </div>

                <div>
                  <label className="text-sm text-gray-600">Payment Method</label>
                  <div className="flex gap-4 mt-1">
                    <label className="inline-flex items-center gap-2">
                      <input
                        type="radio"
                        name="pmethod"
                        checked={paymentMethod === 'paymongo'}
                        onChange={() => setPaymentMethod('paymongo')}
                      />
                      <span className="text-sm">PayMongo - GCash & PayMaya (₱500)</span>
                    </label>
                  </div>
                  <div className="flex gap-4 mt-1">
                    <label className="inline-flex items-center gap-2">
                      <input
                        type="radio"
                        name="pmethod"
                        checked={paymentMethod === 'paypal'}
                        onChange={() => setPaymentMethod('paypal')}
                      />
                      <span className="text-sm">PayPal ($10)</span>
                    </label>
                  </div>
                </div>

                <div className="mt-4">
                  <h3 className="font-semibold mb-2">Reservation Summary</h3>
                  <div className="bg-gray-50 rounded p-4 space-y-2 text-sm">
                    <div className="flex justify-between"><span>Reservation Fee:</span><span className="text-green-600">₱{reservationFee.toLocaleString()}</span></div>
                    <div className="flex justify-between"><span>Total Product Value:</span><span>₱{discountedTotal.toLocaleString()}</span></div>
                    <div className="flex justify-between"><span>Remaining Balance:</span><span>₱{balanceDue.toLocaleString()}</span></div>
                  </div>
                </div>

                <div className="flex flex-col gap-2 pt-2">
                  <button
                    onClick={handleReservation}
                    disabled={submitting}
                    className="w-full bg-[#8B1C1C] text-white rounded px-4 py-2 disabled:opacity-60"
                  >
                    {submitting ? 'Processing…' : 'Pay Reservation Fee & Reserve'}
                  </button>
                  <button
                    onClick={addToCartInstead}
                    className="w-full bg-gray-200 text-black rounded px-4 py-2 hover:bg-gray-300"
                  >
                    Add to Cart Instead
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function ReservationPage() {
  return (
    <Suspense fallback={<div className="min-h-screen flex items-center justify-center">Loading reservation...</div>}>
      <ReservationPageContent />
    </Suspense>
  );
}

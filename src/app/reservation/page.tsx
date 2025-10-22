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
    specialInstructions: ""
  });
  
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

      console.log('🛒 Creating reservation for user:', userId);
      console.log('📦 Product:', product.name);
      console.log('📊 Quantity:', formData.quantity);
      console.log('🏢 Branch:', selectedBranch);

      // Insert into user_items table
      const userItemData = {
        user_id: userId,
        product_id: product.id,
        item_type: "reservation",
        status: "pending_payment",
        quantity: formData.quantity,
        delivery_address_id: selectedAddressId,
        special_instructions: formData.specialInstructions || null,
        payment_status: "pending",
        reservation_fee: 500,
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
          reservation_fee: 500,
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
          total_amount: product.price * formData.quantity,
          balance_due: (product.price * formData.quantity) - 500,
          created_by: 'user',
          reservation_created_at: new Date().toISOString()
        }
      };

      console.log('💾 Inserting user_item:', userItemData);

      const { data: userItem, error: userItemError } = await supabase
        .from("user_items")
        .insert([userItemData])
        .select()
        .single();

      if (userItemError) {
        console.error("❌ Failed to create user_item:", userItemError);
        throw new Error(`Database error: ${userItemError.message}`);
      }

      console.log("✅ User item created successfully:", userItem.id);

      // Create payment session
      const paymentData = {
        amount: 500,
        currency: paymentMethod === 'paypal' ? 'USD' : 'PHP',
        user_item_id: userItem.id,
        product_name: product.name,
        payment_type: 'reservation',
        payment_method: paymentMethod,
        success_url: `${window.location.origin}/reservation/success?reservation_id=${userItem.id}`,
        cancel_url: `${window.location.origin}/reservation?productId=${product.id}`,
      };

      console.log('💳 Creating payment session...');

      const response = await fetch('/api/create-payment-session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(paymentData)
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Payment session creation failed');
      }

      const { checkoutUrl, sessionId, error: paymentError } = await response.json();
      
      if (paymentError) throw new Error(paymentError);

      console.log('✅ Payment session created, redirecting to:', checkoutUrl);

      // Store payment session
      await supabase
        .from('payment_sessions')
        .insert({
          user_id: userId,
          user_item_id: userItem.id,
          stripe_session_id: sessionId,
          amount: 500,
          currency: paymentMethod === 'paypal' ? 'USD' : 'PHP',
          status: 'pending',
          payment_type: 'reservation',
          payment_provider: paymentMethod,
          created_at: new Date().toISOString()
        });

      // Redirect to payment
      if (checkoutUrl) {
        window.location.href = checkoutUrl;
      } else {
        throw new Error("No checkout URL received");
      }

    } catch (error: any) {
      console.error("💥 Reservation error:", error);
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
        <div className="bg-white rounded-lg shadow-lg p-8">
          {/* Back Button and Header */}
          <div className="flex items-center justify-between mb-8">
            <button
              onClick={handleGoBack}
              className="flex items-center text-gray-600 hover:text-gray-800 transition-colors duration-200"
            >
              <svg
                className="w-5 h-5 mr-2"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
                xmlns="http://www.w3.org/2000/svg"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M10 19l-7-7m0 0l7-7m-7 7h18"
                />
              </svg>
              Back to Product
            </button>
            
            <h1 className="text-3xl font-bold text-gray-900">
              Reserve Your Product
            </h1>
            
            {/* Spacer for centering */}
            <div className="w-32"></div>
          </div>

          <div className="grid lg:grid-cols-3 gap-8">
            {/* Product Info - Left Column */}
            <div className="lg:col-span-2">
              <div className="mb-6">
                <img
                  src={product.images?.[0] || product.image1 || "/no-image.png"}
                  alt={product.name}
                  className="w-full h-80 object-cover rounded-lg shadow-md"
                />
              </div>
              
              <div className="space-y-4">
                <div>
                  <h2 className="text-2xl font-bold text-gray-900">{product.name}</h2>
                  {product.fullproductname && (
                    <p className="text-lg text-gray-600 mt-1">{product.fullproductname}</p>
                  )}
                </div>

                <div className="flex items-center space-x-4">
                  <span className="text-3xl font-bold text-green-600">₱{product.price?.toLocaleString()}</span>
                  <span className="text-sm text-gray-500 bg-gray-100 px-2 py-1 rounded">
                    Stock: {product.inventory}
                  </span>
                </div>

                {product.description && (
                  <div>
                    <h3 className="font-semibold text-gray-800 mb-2">Description</h3>
                    <p className="text-gray-600">{product.description}</p>
                  </div>
                )}

                {/* Product Specifications */}
                <div className="bg-gray-50 p-4 rounded-lg">
                  <h3 className="font-semibold text-gray-800 mb-3">Product Specifications</h3>
                  <div className="grid grid-cols-2 gap-4 text-sm">
                    {product.category && (
                      <div>
                        <span className="text-gray-600">Category:</span>
                        <span className="ml-2 font-medium">{product.category}</span>
                      </div>
                    )}
                    {product.type && (
                      <div>
                        <span className="text-gray-600">Type:</span>
                        <span className="ml-2 font-medium">{product.type}</span>
                      </div>
                    )}
                    {product.material && (
                      <div>
                        <span className="text-gray-600">Material:</span>
                        <span className="ml-2 font-medium">{product.material}</span>
                      </div>
                    )}
                    {product.width && (
                      <div>
                        <span className="text-gray-600">Width:</span>
                        <span className="ml-2 font-medium">{product.width} cm</span>
                      </div>
                    )}
                    {product.height && (
                      <div>
                        <span className="text-gray-600">Height:</span>
                        <span className="ml-2 font-medium">{product.height} cm</span>
                      </div>
                    )}
                    {product.thickness && (
                      <div>
                        <span className="text-gray-600">Thickness:</span>
                        <span className="ml-2 font-medium">{product.thickness} cm</span>
                      </div>
                    )}
                  </div>
                </div>

                {product.additionalfeatures && (
                  <div>
                    <h3 className="font-semibold text-gray-800 mb-2">Additional Features</h3>
                    <p className="text-gray-600">{product.additionalfeatures}</p>
                  </div>
                )}
              </div>
            </div>

            {/* Reservation Form - Right Column */}
            <div className="lg:col-span-1">
              <div className="bg-gray-50 p-6 rounded-lg space-y-6 sticky top-8">
                <h3 className="text-xl font-bold text-gray-900">Reservation Details</h3>
                
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Quantity *
                  </label>
                  <input
                    type="number"
                    min="1"
                    max={product.inventory}
                    value={formData.quantity}
                    onChange={(e) => setFormData(prev => ({ ...prev, quantity: parseInt(e.target.value) || 1 }))}
                    className="w-full border rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-600 text-gray-500"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Delivery Address *
                  </label>
                  <select
                    value={selectedAddressId}
                    onChange={(e) => setSelectedAddressId(e.target.value)}
                    className="w-full border rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-600 text-gray-500"
                    required
                  >
                    <option value="">Select delivery address</option>
                    {addresses.map(address => (
                      <option key={address.id} value={address.id}>
                        {address.first_name} {address.last_name} - {address.address}
                        {address.is_default && " (Default)"}
                      </option>
                    ))}
                  </select>
                  
                  {addresses.length === 0 && (
                    <p className="text-sm text-red-600 mt-1">
                      No addresses found. <a href="/profile/address" className="underline">Add an address</a>
                    </p>
                  )}
                </div>

                {/* Store Branch Dropdown */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Store Branch *
                  </label>
                  <select
                    value={selectedBranch}
                    onChange={(e) => setSelectedBranch(e.target.value)}
                    className="w-full border rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-600 text-gray-500"
                    required
                  >
                    <option value="">Select Store Branch</option>
                    {branches.map((branch) => (
                      <option key={branch} value={branch}>
                        {branch}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Custom Dimensions */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Custom Dimensions (Optional)
                  </label>
                  <div className="grid grid-cols-3 gap-2 text-gray-500">
                    <input
                      type="number"
                      placeholder={`Width (${product.width || 'N/A'})`}
                      value={formData.customWidth}
                      onChange={(e) => setFormData(prev => ({ ...prev, customWidth: e.target.value }))}
                      className="border rounded px-2 py-1 text-sm"
                    />
                    <input
                      type="number"
                      placeholder={`Height (${product.height || 'N/A'})`}
                      value={formData.customHeight}
                      onChange={(e) => setFormData(prev => ({ ...prev, customHeight: e.target.value }))}
                      className="border rounded px-2 py-1 text-sm"
                    />
                    <input
                      type="number"
                      placeholder={`Thick. (${product.thickness || 'N/A'})`}
                      value={formData.customThickness}
                      onChange={(e) => setFormData(prev => ({ ...prev, customThickness: e.target.value }))}
                      className="border rounded px-2 py-1 text-sm"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Special Instructions
                  </label>
                  <textarea
                    value={formData.specialInstructions}
                    onChange={(e) => setFormData(prev => ({ ...prev, specialInstructions: e.target.value }))}
                    rows={3}
                    className="w-full border rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-600 text-gray-500" 
                    placeholder="Any special requirements or notes..."
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Payment Method
                  </label>
                  <div className="space-y-2 text-black">
                    <label className="flex items-center">
                      <input
                        type="radio"
                        name="paymentMethod"
                        value="paymongo"
                        checked={paymentMethod === "paymongo"}
                        onChange={(e) => setPaymentMethod(e.target.value as "paymongo" | "paypal")}
                        className="mr-2"
                      />
                      PayMongo - GCash & PayMaya (₱500)
                    </label>
                    <label className="flex items-center">
                      <input
                        type="radio"
                        name="paymentMethod"
                        value="paypal"
                        checked={paymentMethod === "paypal"}
                        onChange={(e) => setPaymentMethod(e.target.value as "paymongo" | "paypal")}
                        className="mr-2"
                      />
                      PayPal ($10)
                    </label>
                  </div>
                </div>

                <div className="bg-white p-4 rounded-lg border">
                  <h4 className="font-medium text-gray-900 mb-3">Reservation Summary</h4>
                  <div className="space-y-2 text-sm">
                    <div className="flex justify-between text-black">
                      <span>Reservation Fee:</span>
                      <span className="font-medium text-green-600">₱500.00</span>
                    </div>
                    <div className="flex justify-between text-black">
                      <span>Total Product Value:</span>
                      <span>₱{(product.price * formData.quantity).toLocaleString()}</span>
                    </div>
                    <div className="border-t pt-2 flex justify-between text-gray-600">
                      <span>Remaining Balance:</span>
                      <span className="font-medium">₱{((product.price * formData.quantity) - 500).toLocaleString()}</span>
                    </div>
                  </div>
                </div>

                <button
                  onClick={handleReservation}
                  disabled={submitting || !selectedAddressId || !selectedBranch}
                  className="w-full bg-red-700 text-white py-3 px-6 rounded-lg font-medium hover:bg-red-800 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {submitting ? "Creating Reservation..." : "Pay Reservation Fee & Reserve"}
                </button>
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

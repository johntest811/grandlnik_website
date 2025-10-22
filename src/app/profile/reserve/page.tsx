"use client";

import { useState, useEffect, useMemo } from "react";
import { createClient } from "@supabase/supabase-js";
import Image from "next/image";

type UserItem = {
  id: string;
  user_id: string;
  product_id: string;
  item_type: string;
  status: string;
  quantity: number;
  meta: any;
  created_at: string;
  updated_at?: string;
  payment_status?: string;
  payment_id?: string;
  delivery_address_id?: string;
  special_instructions?: string;
  admin_notes?: string;
  estimated_delivery_date?: string;
};

type Product = {
  id: string;
  name?: string;
  price?: number;
  images?: string[];
  image1?: string;
  image2?: string;
  stock_quantity?: number;
  inventory?: number;
  length?: number;
  width?: number;
  height?: number;
  material?: string;
  type?: string;
};

type Address = {
  id: string;
  user_id: string;
  full_name?: string;
  phone?: string;
  address?: string;
  label?: string;
  full_address?: string;
  city?: string;
  province?: string;
  postal_code?: string;
  is_default: boolean;
};

// Single Supabase client instance
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

export default function ProfileReservePage() {
  const [query, setQuery] = useState("");
  const [items, setItems] = useState<UserItem[]>([]);
  const [productsById, setProductsById] = useState<Record<string, Product>>({});
  const [addressesById, setAddressesById] = useState<Record<string, Address>>({});
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [showFullReceipt, setShowFullReceipt] = useState<{item: UserItem, product: Product} | null>(null);

  useEffect(() => {
    const load = async () => {
      try {
        // Get current user
        const { data: userData } = await supabase.auth.getUser();
        const currentUserId = userData?.user?.id;
        
        if (!currentUserId) {
          console.log("No user found");
          setLoading(false);
          return;
        }

        setUserId(currentUserId);

        // Fetch user's reservations
        const { data: userItems, error: itemsError } = await supabase
          .from("user_items")
          .select("*")
          .eq("user_id", currentUserId)
          .eq("item_type", "reservation")
          .in("status", ["pending_payment","reserved","pending_balance_payment","pending_cancellation"]) // keep in reserve only
          .order("created_at", { ascending: false });

        if (itemsError) {
          console.error("Error fetching reservations:", itemsError);
          return;
        }

        setItems(userItems || []);

        // Get unique product IDs and address IDs
        const productIds = [...new Set(userItems?.map(item => item.product_id) || [])];
        const addressIds = [...new Set(userItems?.map(item => item.delivery_address_id).filter(Boolean) || [])];

        // Fetch products
        if (productIds.length > 0) {
          const { data: products, error: productsError } = await supabase
            .from("products")
            .select("*")
            .in("id", productIds);

          if (!productsError && products) {
            const productsMap: Record<string, Product> = {};
            products.forEach(p => {
              productsMap[p.id] = p;
            });
            setProductsById(productsMap);
          }
        }

        // Fetch addresses
        if (addressIds.length > 0) {
          const { data: addresses, error: addressesError } = await supabase
            .from("addresses")
            .select("*")
            .in("id", addressIds);

          if (!addressesError && addresses) {
            const addressesMap: Record<string, Address> = {};
            addresses.forEach(a => {
              addressesMap[a.id] = a;
            });
            setAddressesById(addressesMap);
          }
        }

      } catch (error) {
        console.error("Error loading data:", error);
      } finally {
        setLoading(false);
      }
    };

    load();
  }, []);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return items;
    
    return items.filter((item) => {
      const product = productsById[item.product_id];
      const productName = product?.name?.toLowerCase() || "";
      const itemId = item.id.toLowerCase();
      const status = item.status.toLowerCase();
      
      return productName.includes(q) || itemId.includes(q) || status.includes(q);
    });
  }, [items, productsById, query]);

  const requestCancellation = async (item: UserItem) => {
    if (!userId) return;

    if (!confirm("Request cancellation for this reservation? This will require admin approval.")) {
      return;
    }

    setActionLoading(item.id);
    try {
      const updatedMeta = {
        ...item.meta,
        cancellation_requested_at: new Date().toISOString(),
        cancellation_reason: "User requested cancellation",
        cancellation_status: "pending_approval"
      };

      const { error } = await supabase
        .from("user_items")
        .update({ 
          status: "pending_cancellation",
          meta: updatedMeta,
          updated_at: new Date().toISOString()
        })
        .eq("id", item.id);

      if (error) throw error;

      // Update local state
      setItems(prev => prev.map(i => 
        i.id === item.id 
          ? { ...i, status: "pending_cancellation", meta: updatedMeta }
          : i
      ));

      alert("Cancellation request submitted successfully. You will be notified once reviewed by admin.");
    } catch (error: any) {
      console.error("Error requesting cancellation:", error);
      alert("Error submitting cancellation request: " + (error.message || "Unknown error"));
    } finally {
      setActionLoading(null);
    }
  };

  const viewFullReceipt = (item: UserItem) => {
    const product = productsById[item.product_id];
    if (product) {
      setShowFullReceipt({ item, product });
    }
  };

  // Colors -> black
  const getStatusColor = (status: string) => 'bg-black text-white';

  const getStatusDisplay = (status: string) => {
    switch (status) {
      case 'pending_payment': return 'Pending Payment';
      case 'reserved': return 'Reserved';
      case 'approved': return 'Approved';
      case 'in_production': return 'In Production';
      case 'completed': return 'Completed';
      case 'cancelled': return 'Cancelled';
      case 'pending_cancellation': return 'Cancellation Pending';
      default: return status.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
    }
  };

  const getProductImage = (product: Product) => {
    if (product.images && product.images.length > 0) {
      return product.images[0];
    }
    return product.image1 || product.image2 || "/no-image.png";
  };

  if (loading) {
    return (
      <section className="flex-1 flex flex-col px-8 py-8">
        <div className="flex items-center justify-center h-64">
          <div className="text-lg">Loading reservations...</div>
        </div>
      </section>
    );
  }

  return (
    <section className="flex-1 flex flex-col px-8 py-8">
      <div className="mb-2">
        <input
          type="text"
          placeholder="Search reservations by product name, ID, or status"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="w-full border rounded px-4 py-2 bg-gray-100 text-gray-700"
        />
      </div>
      <hr className="mb-4" />

      {filtered.length === 0 ? (
        <div className="flex flex-1 items-center justify-center border rounded bg-white">
          <div className="flex flex-col items-center py-16">
            {/* <Image src="/no-orders.png" alt="No Reservations" width={80} height={80} /> */}
            <p className="mt-4 text-gray-600 text-lg font-medium">
              {query ? "No reservations match your search" : "No reservations yet"}
            </p>
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          {filtered.map((item) => {
            const product = productsById[item.product_id];
            const address = addressesById[item.delivery_address_id || ""];
            
            return (
              <div key={item.id} className="bg-white border rounded-lg p-6 shadow-sm">
                <div className="flex items-start gap-4">
                  {/* Product Image */}
                  <div className="w-24 h-24 bg-gray-100 rounded flex-shrink-0">
                    {product && (
                      <Image
                        src={getProductImage(product)}
                        alt={product.name || "Product"}
                        width={96}
                        height={96}
                        className="w-full h-full object-cover rounded"
                      />
                    )}
                  </div>

                  {/* Content */}
                  <div className="flex-1">
                    <div className="flex justify-between items-start mb-2">
                      <div>
                        <h3 className="font-semibold text-lg">
                          {product?.name || "Unknown Product"}
                        </h3>
                        <p className="text-gray-600 text-sm">
                          Order ID: {item.id.slice(0, 8)}...
                        </p>
                      </div>
                      <span className={`px-3 py-1 rounded-full text-sm font-medium ${getStatusColor(item.status)}`}>
                        {getStatusDisplay(item.status)}
                      </span>
                    </div>

                    <div className="grid grid-cols-2 gap-4 text-sm text-gray-600 mb-4">
                      <div>
                        <span className="font-medium">Quantity:</span> {item.quantity}
                      </div>
                      <div>
                        <span className="font-medium">Created:</span> {new Date(item.created_at).toLocaleDateString()}
                      </div>
                      {item.payment_status && (
                        <div>
                          <span className="font-medium">Payment:</span> {item.payment_status.replace(/_/g, ' ')}
                        </div>
                      )}
                      {address && (
                        <div>
                          <span className="font-medium">Delivery:</span> {address.full_name}
                        </div>
                      )}
                    </div>

                    {item.special_instructions && (
                      <div className="mb-4">
                        <span className="font-medium text-sm">Special Instructions:</span>
                        <p className="text-sm text-gray-600 mt-1">{item.special_instructions}</p>
                      </div>
                    )}

                    {item.admin_notes && (
                      <div className="mb-4 p-3 bg-blue-50 rounded">
                        <span className="font-medium text-sm text-blue-800">Admin Notes:</span>
                        <p className="text-sm text-blue-700 mt-1">{item.admin_notes}</p>
                      </div>
                    )}

                    {/* Actions */}
                    <div className="flex gap-2">
                      <button
                        onClick={() => viewFullReceipt(item)}
                        className="px-4 py-2 text-sm bg-blue-600 text-white rounded hover:bg-blue-700"
                      >
                        View Details
                      </button>
                      
                      {(item.status === 'reserved' || item.status === 'approved') && (
                        <button
                          onClick={() => requestCancellation(item)}
                          disabled={actionLoading === item.id}
                          className="px-4 py-2 text-sm bg-red-600 text-white rounded hover:bg-red-700 disabled:opacity-50"
                        >
                          {actionLoading === item.id ? "Processing..." : "Request Cancellation"}
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Receipt Modal */}
      {showFullReceipt && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg max-w-2xl w-full max-h-[80vh] overflow-y-auto">
            <div className="p-6">
              <div className="flex justify-between items-center mb-6">
                <h2 className="text-xl font-bold">Reservation Details</h2>
                <button
                  onClick={() => setShowFullReceipt(null)}
                  className="text-gray-500 hover:text-gray-700"
                >
                  ✕
                </button>
              </div>

              <div className="space-y-4">
                <div className="border-b pb-4">
                  <h3 className="font-semibold">{showFullReceipt.product.name}</h3>
                  <p className="text-gray-600">Order ID: {showFullReceipt.item.id}</p>
                </div>

                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <span className="font-medium">Status:</span>
                    <span className={`ml-2 px-2 py-1 rounded text-xs ${getStatusColor(showFullReceipt.item.status)}`}>
                      {getStatusDisplay(showFullReceipt.item.status)}
                    </span>
                  </div>
                  <div>
                    <span className="font-medium">Quantity:</span> {showFullReceipt.item.quantity}
                  </div>
                  <div>
                    <span className="font-medium">Created:</span> {new Date(showFullReceipt.item.created_at).toLocaleString()}
                  </div>
                  {showFullReceipt.item.updated_at && (
                    <div>
                      <span className="font-medium">Updated:</span> {new Date(showFullReceipt.item.updated_at).toLocaleString()}
                    </div>
                  )}
                </div>

                {showFullReceipt.item.meta && (
                  <div className="border-t pt-4">
                    <h4 className="font-medium mb-2">Additional Details:</h4>
                    <pre className="text-xs bg-gray-100 p-3 rounded overflow-auto">
                      {JSON.stringify(showFullReceipt.item.meta, null, 2)}
                    </pre>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
"use client";

import { useEffect, useState } from "react";
import { supabase } from "../../Clients/Supabase/SupabaseClients";

type Address = {
  id: string;
  user_id?: string;
  first_name: string;
  last_name: string;
  full_name: string;
  phone: string;
  email?: string; // NEW
  address: string;
  is_default: boolean;
  created_at?: string;
};

export default function AddressManager() {
  const [addresses, setAddresses] = useState<Address[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [defaultId, setDefaultId] = useState<string | null>(null);

  // editing state
  const [editingId, setEditingId] = useState<string | null>(null);

  // Form states (shared for add/edit) - REMOVED BRANCH
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [phone, setPhone] = useState("");
  const [address, setAddress] = useState("");
  const [email, setEmail] = useState(""); // NEW
  const [isDefaultChecked, setIsDefaultChecked] = useState(false);

  useEffect(() => {
    fetchAddresses();
  }, []);

  async function fetchAddresses() {
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      setAddresses([]);
      setDefaultId(null);
      return;
    }

    const { data, error } = await supabase
      .from("addresses")
      .select("*")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false });

    if (error) {
      console.error("fetch addresses error", error);
      return;
    }
    setAddresses(data ?? []);
    const def = data?.find((a) => a.is_default)?.id ?? null;
    setDefaultId(def);
  }

  async function notifyServersAddressUpdated(
    userId: string,
    title = "Address updated",
    message = "Your saved address was updated."
  ) {
    try {
      await fetch("/api/notifyServers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "address_updated",
          user_id: userId,
          title,
          message,
        }),
      });
    } catch (err) {
      console.error("notifyServers call failed", err);
    }
  }

  // open modal for adding a new address
  function openAddForm() {
    setEditingId(null);
    setFirstName("");
    setLastName("");
    setPhone("");
    setAddress("");
    setEmail(""); // NEW
    setIsDefaultChecked(false);
    setShowForm(true);
  }

  // open modal to edit existing address
  function openEditForm(a: Address) {
    setEditingId(a.id);
    setFirstName(a.first_name || "");
    setLastName(a.last_name || "");
    setPhone(a.phone || "");
    setAddress(a.address || "");
    setIsDefaultChecked(a.is_default);
    setEmail(a.email || ""); // add a useState for email
    setShowForm(true);
  }

  // unified save handler for add & edit - REMOVED BRANCH VALIDATION AND SAVE
  const handleSaveAddress = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!firstName || !lastName || !phone || !address) {
      alert("All fields are required!");
      return;
    }

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      alert("You must be signed in to manage addresses.");
      return;
    }

    const fullName = `${firstName} ${lastName}`;

    if (editingId) {
      // update existing address
      const { data, error } = await supabase
        .from("addresses")
        .update({
          first_name: firstName,
          last_name: lastName,
          full_name: fullName,
          phone,
          email,               // NEW
          address,
          is_default: isDefaultChecked,
        })
        .eq("id", editingId)
        .select()
        .single();

      if (error) {
        console.error("update address error", error);
        alert("Could not update address");
        return;
      }

      // if set as default, clear others
      if (isDefaultChecked) {
        const { error: clearErr } = await supabase
          .from("addresses")
          .update({ is_default: false })
          .eq("user_id", user.id)
          .neq("id", editingId);

        if (clearErr) console.error("clear defaults error", clearErr);
      }

      // notify server
      await notifyServersAddressUpdated(
        user.id,
        "Address updated",
        "An address in your account was updated."
      );
    } else {
      // insert new address
      const isDefault = isDefaultChecked || addresses.length === 0;

      const { data, error } = await supabase
        .from("addresses")
        .insert([{
          user_id: user.id,
          first_name: firstName,
          last_name: lastName,
          full_name: fullName,
          phone,
          email,               // NEW
          address,
          is_default: isDefault,
        }])
        .select()
        .single();

      if (error) {
        console.error(error);
        alert("Could not save address");
        return;
      }

      // If this was inserted as default, clear other defaults
      if (isDefault) {
        await supabase
          .from("addresses")
          .update({ is_default: false })
          .eq("user_id", user.id)
          .neq("id", data.id);
      }

      await notifyServersAddressUpdated(
        user.id,
        "Address added",
        "A new address was added to your account."
      );
    }

    // close modal + refresh
    setShowForm(false);
    setEditingId(null);
    setFirstName("");
    setLastName("");
    setPhone("");
    setAddress("");
    setEmail(""); // NEW
    setIsDefaultChecked(false);

    fetchAddresses();
  };

  const handleDelete = async (id: string) => {
    // Ask for confirmation before deleting
    const ok = window.confirm("Are you sure you want to delete this address?");
    if (!ok) return;

    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return;

    try {
      const res = await fetch(`/api/addresses`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, user_id: user.id }),
      });

      if (!res.ok) {
        const j = await res.json().catch(() => ({} as any));
        const msg = j?.error || (typeof j === 'string' ? j : '') || "Failed to delete address.";
        console.warn("delete error", j);
        alert(msg);
        return;
      }

      if (defaultId === id) setDefaultId(null);
      fetchAddresses();
    } catch (e) {
      console.warn("delete error", e);
      alert("Something went wrong deleting the address. Please try again.");
    }
  };

  const handleSetDefault = async (id: string) => {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return;

    // clear other defaults
    await supabase.from("addresses").update({ is_default: false }).eq("user_id", user.id);

    // set chosen one
    const { error } = await supabase
      .from("addresses")
      .update({ is_default: true })
      .match({ id, user_id: user.id });

    if (error) {
      console.error("set default error", error);
      return;
    }

    // notify server to create notification + send email (if enabled)
    await notifyServersAddressUpdated(
      user.id,
      "Default address changed",
      "Your default address was changed."
    );

    setDefaultId(id);
    fetchAddresses();
  };

  return (
    <div className="max-w-3xl mx-auto mt-10 p-6 bg-white rounded-xl shadow-lg">
      <h2 className="text-2xl font-bold mb-6 text-[#8B1C1C]">My Addresses</h2>

      {/* Add New Button */}
      <button
        onClick={openAddForm}
        className="bg-[#8B1C1C] text-white px-4 py-2 rounded font-semibold hover:bg-[#a83232] transition mb-6"
      >
        + Add New Address
      </button>

      {/* Address List */}
      <div className="space-y-4">
        {addresses.map((addr) => (
          <div
            key={addr.id}
            className="border rounded-lg p-4 flex justify-between items-start shadow-sm"
          >
            <div>
              <p className="font-bold text-gray-700">
                {addr.first_name} {addr.last_name}{" "}
                <span className="ml-2 text-gray-600">({addr.phone})</span>
                {addr.is_default && (
                  <span className="ml-2 text-sm text-green-600">Default</span>
                )}
              </p>
              <p className="text-gray-700">{addr.address}</p>
            </div>
            <div className="flex flex-col items-end gap-2 text-sm">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="radio"
                  name="defaultAddress"
                  checked={defaultId === addr.id}
                  onChange={() => handleSetDefault(addr.id)}
                  className="accent-[#8B1C1C]"
                />
                <span className="text-gray-700">Set as Default</span>
              </label>
              <div className="flex gap-3">
                <button
                  className="text-blue-600 hover:underline"
                  onClick={() => openEditForm(addr)}
                >
                  Edit
                </button>
                <button
                  className="text-red-600 hover:underline"
                  onClick={() => handleDelete(addr.id)}
                >
                  Delete
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Show Default Address */}
      {defaultId && (
        <div className="mt-6 p-4 bg-gray-100 rounded">
          <p className="font-semibold text-gray-700">
            Default Address:{" "}
            <span className="text-gray-700">
              {addresses.find((a) => a.id === defaultId)?.first_name}{" "}
              {addresses.find((a) => a.id === defaultId)?.last_name},{" "}
              {addresses.find((a) => a.id === defaultId)?.address}
            </span>
          </p>
        </div>
      )}

      {/* Modal Form (add/edit) - REMOVED BRANCH SECTION */}
      {showForm && (
        <div className="fixed inset-0 flex items-center justify-center bg-black/50 z-50">
          <div className="bg-white p-6 rounded-xl shadow-lg w-full max-w-md max-h-[90vh] overflow-y-auto">
            <h3 className="text-xl font-bold mb-4 text-[#8B1C1C]">
              {editingId ? "Edit Address" : "Add New Address"}
            </h3>
            <form className="grid gap-4" onSubmit={handleSaveAddress}>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-black">
                    First Name *
                  </label>
                  <input
                    type="text"
                    className="w-full border rounded px-3 py-2 text-black"
                    value={firstName}
                    onChange={(e) => setFirstName(e.target.value)}
                    required
                  />
                </div>
                <div>
                  <label className="block font-semibold text-black">
                    Last Name *
                  </label>
                  <input
                    type="text"
                    className="w-full border rounded px-3 py-2 text-black"
                    value={lastName}
                    onChange={(e) => setLastName(e.target.value)}
                    required
                  />
                </div>
              </div>

              <div>
                <label className="block font-semibold text-black">
                  Phone Number *
                </label>
                <input
                  type="text"
                  className="w-full border rounded px-3 py-2 text-black"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  required
                />
              </div>

              <div>
                <label className="block font-semibold text-black">
                  Email *
                </label>
                <input
                  type="email"
                  className="w-full border rounded px-3 py-2 text-black"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                />
              </div>

              <div>
                <label className="block font-semibold text-black">
                  Address *
                </label>
                <textarea
                  className="w-full border rounded px-3 py-2 text-black"
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                  rows={3}
                  required
                />
              </div>

              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={isDefaultChecked}
                  onChange={(e) => setIsDefaultChecked(e.target.checked)}
                  className="accent-[#8B1C1C]"
                />
                <span className="text-gray-700">Set as Default</span>
              </label>

              <div className="flex justify-end gap-3 mt-4">
                <button
                  type="button"
                  onClick={() => {
                    setShowForm(false);
                    setEditingId(null);
                  }}
                  className="px-4 py-2 border rounded hover:bg-gray-100 text-gray-700"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="bg-[#8B1C1C] text-white px-4 py-2 rounded font-semibold hover:bg-[#a83232] transition"
                >
                  {editingId ? "Save Changes" : "Save Address"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

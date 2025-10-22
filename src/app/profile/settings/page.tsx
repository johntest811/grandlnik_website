"use client";

import { useState } from "react";
import { supabase } from "@/app/Clients/Supabase/SupabaseClients";

export default function ProfileSettingsPage() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setMessage(null);

    setLoading(true);
    try {
      // Get current user email
      const { data: userData, error: userErr } = await supabase.auth.getUser();
      if (userErr || !userData?.user?.email) {
        throw new Error("Unable to get current user email. Please sign in again.");
      }
      const email = userData.user.email;

      // Send password reset email
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/forgotpass/reset`,
      });
      if (error) {
        if (error.message.includes("For security purposes, you can only request this after")) {
          throw new Error(
            "You recently requested a password reset. Please wait before trying again."
          );
        }
        throw error;
      }

      setMessage(
        "A confirmation email was sent to your account. Open the email and follow the link to confirm and set your new password."
      );
    } catch (err: any) {
      setMessage(err?.message || "Failed to request password change.");
      console.error("request-password-change:", err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="bg-white rounded-xl shadow-lg w-full max-w-xl p-8 mx-auto mt-12">
      <h2 className="text-2xl font-bold mb-6 text-[#8B1C1C]">Account Settings</h2>
      <form className="flex flex-col gap-4" onSubmit={handleSubmit}>
        <p className="text-sm text-gray-600">
          This will send a confirmation email to your account. After you click the link in the email, you will be able to set the new password.
        </p>
        <button
          type="submit"
          className="bg-[#8B1C1C] text-white px-4 py-2 rounded font-semibold mt-2 hover:bg-[#a83232] transition"
          disabled={loading}
        >
          {loading ? "Sending..." : "Send Confirmation Email"}
        </button>
        {message && <p className="text-sm mt-2">{message}</p>}
      </form>
    </div>
  );
}
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/app/Clients/Supabase/SupabaseClients";

export default function ResetPasswordPage() {
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const router = useRouter();

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setMessage("");
    setError("");

    if (password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }

    const { error: updateError } = await supabase.auth.updateUser({
      password,
    });

    if (updateError) {
      setError("Failed to reset password. Please try again.");
    } else {
      setMessage("Your password has been reset successfully. Redirecting to login...");
      setTimeout(() => {
        router.push("/login");
      }, 2000);
    }
  };

  return (
    <div className="min-h-screen flex flex-col bg-gray-100">
      <div className="flex flex-1 items-center justify-center">
        <form
          onSubmit={handleResetPassword}
          className="bg-white p-8 rounded shadow-md w-full max-w-sm"
        >
          <h2 className="text-2xl font-bold mb-6 text-center text-black">Reset Password</h2>
          <div className="mb-4">
            <label className="block mb-2 font-medium text-gray-700">
              New Password
            </label>
            <input
              type="password"
              className="w-full px-3 py-2 border rounded text-black"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </div>
          <div className="mb-4">
            <label className="block mb-2 font-medium text-gray-700">
              Confirm New Password
            </label>
            <input
              type="password"
              className="w-full px-3 py-2 border rounded text-black"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              required
            />
          </div>
          {error && <div className="text-red-600 mb-4">{error}</div>}
          {message && <div className="text-green-600 mb-4">{message}</div>}
          <button
            type="submit"
            className="w-full bg-[#8B1C1C] text-white py-2 rounded font-semibold hover:bg-[#a83232] transition"
          >
            Reset Password
          </button>
        </form>
      </div>
    </div>
  );
}
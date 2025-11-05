"use client";
import { useState } from "react";
import { FaEnvelope } from "react-icons/fa";
import { FaGoogle } from "react-icons/fa"; // Add this import
import Image from "next/image";
import { supabase } from "@/app/Clients/Supabase/SupabaseClients";
import UnifiedTopNavBar from "@/components/UnifiedTopNavBar";

export default function ResetPasswordPage() {
  const baseUrl =
    process.env.NEXT_PUBLIC_BASE_URL ||
    (typeof window !== "undefined" ? window.location.origin : "https://grandlnik-website.vercel.app");

  // Google OAuth login
  const handleGoogleLogin = async () => {
    await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: `${baseUrl}/home`,
      },
    });
  };
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  const handleForgotPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setMessage("");
    setError("");
    setIsLoading(true);

    // Remove manual check for user existence
    const { error: resetError } = await supabase.auth.resetPasswordForEmail(email, {
      // Use a stable base URL that works on both localhost and Vercel
      redirectTo: `${baseUrl}/forgotpass/reset`,
    });

    if (resetError) {
      setError("No account found with that email address.");
    } else {
      setMessage(
        "A password reset link has been sent to your inbox. Please check your email and follow the instructions to reset your password."
      );
    }
    setIsLoading(false);
  };

  return (
    <div className="relative min-h-screen font-sans bg-cover bg-center flex flex-col" style={{ backgroundImage: 'url("/sevices.avif")' }}>
      <UnifiedTopNavBar />


      {/* Main Content */}
      <main className="flex-1 flex items-center justify-center">
        <div className="bg-white/95 rounded-xl shadow-lg px-8 py-10 w-full max-w-md flex flex-col items-center relative z-10">
          <h1 className="text-3xl font-bold text-center mb-6 text-[#8B1C1C]">Forgot Password</h1>
          <form onSubmit={handleForgotPassword} className="w-full flex flex-col gap-4">
            <div>
              <label className="font-semibold text-sm mb-1 block text-black" htmlFor="email">Gmail</label>
              <div className="flex items-center border border-gray-400 rounded-lg px-3 py-2 bg-gray-100">
                <FaEnvelope className="text-gray-500 mr-2" /> {/* Changed to icon */}
                <input
                  id="email"
                  type="email"
                  placeholder="Please Enter your Gmail Address"
                  className="bg-transparent outline-none flex-1 text-gray-700 placeholder-gray-400"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  required
                />
              </div>
            </div>

            <button type="submit" className="bg-[#232d3b] text-white font-semibold rounded w-full py-2 mt-2 hover:bg-[#1a222e] transition" disabled={isLoading}>
              {isLoading ? "Sending..." : "CONFIRM"}
            </button>
            {error && <p className="mt-4 text-red-600 text-center">{error}</p>}
            {message && <p className="mt-4 text-green-600 text-center">{message}</p>}
          </form>
          <button
            type="button"
            onClick={handleGoogleLogin}
            className="flex items-center gap-2 bg-gray-100 border border-gray-300 rounded px-4 py-2 mt-4 w-full justify-center hover:bg-gray-200 transition"
          >
            <FaGoogle className="text-[#4285F4] text-xl" />
            <span className="font-medium text-gray-700">Sign in with Google</span>
          </button>
          <div className="text-xs text-center mt-4 text-gray-600">
            Already have an account? <a href="login" className="text-blue-600 hover:underline">Login</a>
          </div>
        </div>
      </main>
      {/* Optional: Overlay for background dimming */}
      <div className="absolute inset-0 bg-black/30 -z-0" aria-hidden="true"></div>
    </div>
  );
}

"use client";

import { useState } from "react";
import { FaEnvelope, FaLock, FaGoogle } from "react-icons/fa";
import Image from "next/image";
import UnifiedTopNavBar from "@/components/UnifiedTopNavBar";
import { useRouter } from "next/navigation";
import { supabase } from "../Clients/Supabase/SupabaseClients";
import LoadingSuccess from "./LoadingSuccess";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  const baseUrl =
    process.env.NEXT_PUBLIC_BASE_URL ||
    (typeof window !== "undefined" ? window.location.origin : "https://grandlnik-website.vercel.app");

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      // First, verify email and password with Supabase Auth
      const { data: signInData, error: signInError } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (signInError) {
        setError("Invalid email or password");
        setLoading(false);
        return;
      }

      // If sign-in successful, immediately sign out (we'll sign in again after MFA)
      await supabase.auth.signOut();

      // Send verification code via API
      const response = await fetch('/api/auth/send-verification-code', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });

      const result = await response.json();

      if (!response.ok) {
        setError(result.error || 'Failed to send verification code');
        setLoading(false);
        return;
      }

      // Store email and password temporarily in sessionStorage for verification page
      sessionStorage.setItem('login_email', email);
      sessionStorage.setItem('login_password', password);

      // Redirect to verification page
      router.push('/login/verify');
    } catch (err: any) {
      setError(err.message || 'An error occurred');
      setLoading(false);
    }
  };

  const handleGoogleLogin = async () => {
    await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: `${baseUrl}/home`,
      },
    });
  };

  return (
    <div className="relative min-h-screen font-sans bg-cover bg-center flex flex-col" style={{ backgroundImage: 'url("/sevices.avif")' }}>
      <UnifiedTopNavBar />
      {/* Main Content */}
      <main className="flex-1 flex items-center justify-center">
        <div className="bg-white/95 rounded-xl shadow-lg px-8 py-10 w-full max-w-md flex flex-col items-center relative z-10">
          <h1 className="text-3xl font-bold text-center mb-6 text-[#8B1C1C]">Login</h1>
          <form className="w-full flex flex-col gap-4" onSubmit={handleLogin}>
            <div>
              <label className="font-semibold text-sm mb-1 block text-black" htmlFor="email">Gmail</label>
              <div className="flex items-center border border-gray-400 rounded-lg px-3 py-2 bg-gray-100">
                <FaEnvelope className="text-black mr-2" />
                <input
                  id="email"
                  type="email"
                  placeholder="Please Enter your Gmail Address"
                  className="bg-transparent outline-none flex-1 text-black placeholder-black"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  required
                />
              </div>
            </div>
            <div>
              <label className="font-semibold text-sm mb-1 block text-black" htmlFor="password">Password</label>
              <div className="flex items-center border border-gray-400 rounded-lg px-3 py-2 bg-gray-100">
                <FaLock className="text-black mr-2" />
                <input
                  id="password"
                  type="password"
                  placeholder="Please Enter your password"
                  className="bg-transparent outline-none flex-1 text-black placeholder-black"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  required
                />
              </div>
            </div>
            <div className="flex justify-end text-xs">
              <a href="forgotpass" className="text-blue-600 hover:underline">Forgot Password</a>
            </div>
            <button
              type="submit"
              disabled={loading}
              aria-busy={loading}
              className={`relative bg-[#232d3b] text-white font-semibold rounded w-full py-2 mt-2 transition 
                ${loading ? 'opacity-70 cursor-not-allowed' : 'hover:bg-[#1a222e]'}
              `}
            >
              {loading ? (
                <span className="flex items-center justify-center gap-2">
                  <span className="h-5 w-5 border-2 border-white/60 border-t-white rounded-full animate-spin" />
                  <span>Loading…</span>
                </span>
              ) : (
                'LOGIN'
              )}
            </button>
            {error && (
              <div className="text-red-600 text-xs text-center mt-2">{error}</div>
            )}
          </form>
          <button
            type="button"
            onClick={handleGoogleLogin}
            className="flex items-center gap-2 bg-gray-100 border border-gray-300 rounded px-4 py-2 mt-4 w-full justify-center hover:bg-gray-200 transition"
          >
            <FaGoogle className="text-[#4285F4] text-xl" />
            <span className="font-medium text-black">Sign in with Google</span>
          </button>
          <div className="text-xs text-center mt-4 text-black">
            Don't have an account yet? <a href="register" className="text-blue-600 hover:underline">Sign Up</a>
          </div>
        </div>
      </main>
      {/* Optional: Overlay for background dimming */}
      <div className="absolute inset-0 bg-black/30 -z-0" aria-hidden="true"></div>
    </div>
  );
}
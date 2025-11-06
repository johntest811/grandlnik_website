"use client";
import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import LoadingSuccess from "../LoadingSuccess";
import { supabase } from "../../Clients/Supabase/SupabaseClients";

export default function ConfirmLoginPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [error, setError] = useState<string>("");
  const [working, setWorking] = useState<boolean>(true);

  useEffect(() => {
    const doExchange = async () => {
      try {
        // Supabase sends a "code" param for magic links and password recovery
        const code = searchParams.get("code");
        const type = searchParams.get("type");
        const errParam = searchParams.get("error");

        if (errParam) {
          setError(errParam);
          setWorking(false);
          return;
        }

        if (!code) {
          // No code in URL — nothing to exchange
          setError("Invalid or expired sign-in link. Please request a new one.");
          setWorking(false);
          return;
        }

        // Exchange the code for a session (works on Vercel client-side)
        const { data, error } = await supabase.auth.exchangeCodeForSession(code);
        if (error) {
          setError(error.message || "Failed to complete sign-in. Try again.");
          setWorking(false);
          return;
        }

        // If we successfully got a session, send the user to home
        router.replace("/home");
      } catch (e: any) {
        setError("Failed to complete sign-in. Try again.");
        setWorking(false);
      }
    };

    doExchange();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (working && !error) {
    return <LoadingSuccess />;
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-white p-6">
      <h2 className="text-2xl font-bold text-gray-800">Sign-in link error</h2>
      <p className="mt-2 text-gray-600 text-center max-w-md">
        {error || "We couldn’t verify your sign-in link. It may have expired. Please go back and request a new link."}
      </p>
      <button
        onClick={() => router.replace("/login")}
        className="mt-6 bg-[#232d3b] text-white font-semibold rounded px-4 py-2 hover:bg-[#1a222e] transition"
      >
        Back to Login
      </button>
    </div>
  );
}
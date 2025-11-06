"use client";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import LoadingSuccess from "../LoadingSuccess";
import { supabase } from "../../Clients/Supabase/SupabaseClients";

// Ensure this page is rendered dynamically (no prerender), fixing Vercel build errors
export const dynamic = "force-dynamic";

export default function ConfirmLoginPage() {
  const router = useRouter();
  const [error, setError] = useState<string>("");
  const [working, setWorking] = useState<boolean>(true);
  const exchangedRef = useRef(false); // guard against double-run

  useEffect(() => {
    const doExchange = async () => {
      if (exchangedRef.current) return; // ensure one attempt
      exchangedRef.current = true;
      try {
        // Supabase sends a "code" param for magic links and password recovery
        const url = new URL(window.location.href);
        const code = url.searchParams.get("code");
        const type = url.searchParams.get("type");
        const errParam = url.searchParams.get("error");
        const token_hash = url.searchParams.get("token_hash");

        if (errParam) {
          setError(errParam);
          setWorking(false);
          return;
        }

        if (code) {
          // New PKCE-style flow
          const { error } = await supabase.auth.exchangeCodeForSession(code);
          if (error) {
            setError(error.message || "Failed to complete sign-in. Try again.");
            setWorking(false);
            return;
          }
        } else if (token_hash && type) {
          // Legacy magiclink/recovery flow that uses token_hash + type.
          // Requires email; try to pull from sessionStorage saved on request.
          let email = "";
          try { email = sessionStorage.getItem("login_email") || ""; } catch {}
          if (!email) {
            setError("We couldn't verify this link on this device. Please open the link on the same browser you used to request it or request a new link.");
            setWorking(false);
            return;
          }

          const { error } = await supabase.auth.verifyOtp({
            email,
            token_hash,
            type: type as any,
          });
          if (error) {
            setError(error.message || "Failed to complete sign-in. Try again.");
            setWorking(false);
            return;
          }
        } else {
          // No recognized parameters
          setError("Invalid or expired sign-in link. Please request a new one.");
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
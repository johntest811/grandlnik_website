"use client";
import { useEffect } from "react";
import { FaCheckCircle } from "react-icons/fa";

export default function RegisterSuccessPage() {
  useEffect(() => {
    const timer = setTimeout(() => {
      window.location.href = "/login";
    }, 3500);
    return () => clearTimeout(timer);
  }, []);

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-white">
      <FaCheckCircle className="text-green-500 mb-6" size={100} />
      <h2 className="text-3xl font-bold text-[#232d3b] text-center mb-4">
        Success!
      </h2>
      <div className="max-w-xl mx-auto">
        <p className="text-lg text-gray-700 text-center mb-2">
          Please confirm your account creation.<br />
          A confirmation email has been sent to <span className="font-semibold text-[#8B1C1C]">johnezrabugao811@gmail.com</span>.<br />
          You must click the <span className="font-semibold">"Register Account"</span> link in your Gmail inbox to activate your account.<br />
          If you do not confirm within a certain time, the link will expire and become invalid.
        </p>
        <p className="mt-4 text-gray-500 text-center text-base">Redirecting to login...</p>
      </div>
    </div>
  );
}
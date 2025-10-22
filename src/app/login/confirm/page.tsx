"use client";
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import LoadingSuccess from "../LoadingSuccess";

export default function ConfirmLoginPage() {
  const router = useRouter();

  useEffect(() => {
    // Optionally, you can check if the user is authenticated here
    setTimeout(() => {
      router.push("/home"); // or your dashboard route
    }, 2000);
  }, [router]);

  return <LoadingSuccess />;
}
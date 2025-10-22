import { FaEnvelope, FaLock, FaUser } from "react-icons/fa";
import Image from "next/image";
import TopNavBar from "@/components/TopNavBar";
import Footer from "@/components/Footer";
import Link from "next/link";

export default function RegisterPage() {
  return (
    <div
      className="relative min-h-screen font-sans bg-cover bg-center flex flex-col"
      style={{ backgroundImage: 'url("/background-login.jpg")' }}
    >
      <TopNavBar/>
      
      <main className="flex-1 flex flex-col items-center justify-center bg-cover bg-center">
        
      
        <h1 className="mt-12 text-4xl font-bold text-white mb-4 drop-shadow-lg">
          Welcome to Grand East Glass and Aluminum
        </h1>
        <p className="text-lg text-white drop-shadow-lg mb-8 text-center max-w-xl">
          We provide top-quality glass and aluminum products and services for your
          home and business needs.
        </p>
  {/* Login Button */}
    <Link href="/login">
    <button className="bg-[#8B1C1C] text-whitee font-semibold rounded px-6 py-3 mb-12">Login Now</button>
     </Link>

      
      </main>
      <Footer />
    </div>
  );
}

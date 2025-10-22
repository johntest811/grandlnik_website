import Image from "next/image";
import { FaEnvelope, FaThumbsUp, FaPhone } from "react-icons/fa";

export default function TopNavBar() {
  return (
    <>
      {/* Header */}
      <header className="w-full bg-white flex flex-col sm:flex-row items-center justify-between px-4 py-2 shadow z-10">
        <div className="flex items-center gap-2 mb-3 mt-3">
          <Image src="/ge-logo.avif" alt="Grand East Logo" width={170} height={170}/>
        </div>
        <button className="bg-[#8B1C1C] text-white px-4 py-2 rounded font-semibold mt-2 sm:mt-0 hover:bg-[#a83232] transition">
          INQUIRE NOW
        </button>
      </header>
      {/* Contact Bar */}
      <div className="w-full bg-[#232d3b] text-white flex flex-col sm:flex-row items-center justify-center gap-4 py-2 px-2 text-xs sm:text-sm z-10">
        <div className="flex items-center gap-1">
          <FaEnvelope className="text-base" /> grandeast.org@gmail.com
        </div>
        <span className="hidden sm:inline">|</span>
        <div className="flex items-center gap-1">
          <FaThumbsUp className="text-base" /> Click here visit to our FB Page
        </div>
        <span className="hidden sm:inline">|</span>
        <div className="flex items-center gap-1">
          <FaPhone className="text-base" /> Smart | 09082810586 Globe (Viber) | 09277640475
        </div>
      </div>
    </>
  );
}
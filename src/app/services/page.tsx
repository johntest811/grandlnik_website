"use client";

import TopNavBarLoggedIn from "@/components/TopNavBarLoggedIn";
import Footer from "@/components/Footer";
import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { createClient } from "@supabase/supabase-js";
import * as FaIcons from "react-icons/fa";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

type Service = {
  id: number;
  name: string;
  short_description: string;
  long_description: string;
  icon?: string; // icon name from react-icons
};

export default function ServicesPage() {
  const [services, setServices] = useState<Service[]>([]);
  const [flippedIndex, setFlippedIndex] = useState<number | null>(null);

  useEffect(() => {
    fetchServices();
  }, []);

  const fetchServices = async () => {
    const { data, error } = await supabase.from("services").select("*");
    if (error) console.error(error);
    else setServices(data || []);
  };

  return (
    <div className="min-h-screen flex flex-col bg-white">
      <TopNavBarLoggedIn />
      <main className="flex-1">
        {/* Hero */}
        <div className="relative w-full">
          <div className="h-64 md:h-80 lg:h-96 relative">
            <img
              src="/sevices.avif"
              alt="services"
              className="w-full h-full object-cover"
            />
            {/* dark overlay */}
            <div className="absolute inset-0 bg-black/40 mix-blend-multiply pointer-events-none" />
            {/* optional stronger gradient top->transparent to focus center */}
            <div
              className="absolute inset-0 pointer-events-none"
              style={{
                background:
                  "linear-gradient(180deg, rgba(0,0,0,0.45) 0%, rgba(0,0,0,0.20) 40%, rgba(0,0,0,0) 70%)",
              }}
            />
          </div>

          {/* curved white overlay to match design */}
          <div className="absolute left-0 right-0 -bottom-8 pointer-events-none">
            <svg
              viewBox="0 0 1440 120"
              className="w-full h-20 md:h-28"
              preserveAspectRatio="none"
            >
              <path
                d="M0,40 C220,140 440,0 720,40 C1000,80 1220,20 1440,40 L1440 120 L0 120 Z"
                fill="#ffffff"
              />
            </svg>
          </div>

          <div className="absolute inset-0 flex items-center justify-center">
            <div className="text-center px-6">
              <h1 className="text-4xl md:text-5xl lg:text-6xl font-extrabold text-white drop-shadow-lg">
                Our Services
              </h1>
              <div className="h-1.5 w-28 bg-[#8B1C1C] mx-auto mt-6 rounded"></div>
            </div>
          </div>
        </div>

        {/* Intro (centered compressed paragraph under heading) */}
        <section className="max-w-4xl mx-auto px-6 py-12 -mt-6 bg-white">
          <p className="text-center text-gray-600 mb-10 text-lg leading-relaxed">
            Explore our full range of services, expertly designed to meet both
            residential and commercial needs. From precision-crafted aluminum
            windows and doors to custom glass installations, our expertise spans
            design, fabrication, and installation. Discover how we can transform
            your space with top-tier craftsmanship and innovative solutions built
            for style, durability, and performance.
          </p>
        </section>

        {/* Section */}
        <section className="max-w-6xl mx-auto px-6 py-12">
          <p className="text-center text-gray-700 mb-10 text-lg max-w-2xl mx-auto">
            Explore our full range of services, expertly designed to meet both
            residential and commercial needs.
          </p>

          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
            {services.map((s, idx) => {
              const IconComponent = s.icon
                ? (FaIcons as any)[s.icon] || FaIcons.FaCogs
                : FaIcons.FaCogs;

              return (
                <ServiceCard
                  key={s.id}
                  icon={<IconComponent size={40} />}
                  label={s.name}
                  info={s.short_description}
                  flipped={flippedIndex === idx}
                  onClick={() =>
                    setFlippedIndex(flippedIndex === idx ? null : idx)
                  }
                />
              );
            })}
          </div>
        </section>
      </main>
      <Footer />
    </div>
  );
}

function ServiceCard({
  icon,
  label,
  info,
  flipped,
  onClick,
}: {
  icon: React.ReactNode;
  label: string;
  info: string;
  flipped: boolean;
  onClick: () => void;
}) {
  return (
    <div className="perspective" onClick={onClick}>
      <motion.div
        className="relative w-full h-52 cursor-pointer"
        style={{ transformStyle: "preserve-3d" }}
        animate={{ rotateY: flipped ? 180 : 0 }}
        transition={{ duration: 0.6 }}
      >
        {/* Front */}
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-[#232d3b] text-white rounded-2xl shadow-xl backface-hidden hover:scale-105 transition-transform">
          <div className="p-3 bg-white/10 rounded-full mb-2">{icon}</div>
          <span className="mt-2 font-bold text-lg">{label}</span>
        </div>

        {/* Back */}
        <div
          className="absolute inset-0 flex flex-col items-center justify-center bg-white text-[#232d3b] rounded-2xl shadow-xl backface-hidden p-4"
          style={{ transform: "rotateY(180deg)" }}
        >
          <span className="font-semibold text-lg mb-2">{label}</span>
          <p className="text-sm text-gray-600 text-center flex-1">
            {info}
          </p>
          <button className="mt-4 bg-[#8B1C1C] text-white px-4 py-1 rounded-full font-medium hover:bg-[#a83232] transition text-sm">
            Learn More
          </button>
        </div>
      </motion.div>

      <style jsx>{`
        .perspective {
          perspective: 1200px;
        }
        .backface-hidden {
          backface-visibility: hidden;
        }
      `}</style>
    </div>
  );
}

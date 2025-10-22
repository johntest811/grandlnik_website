"use client";
//import { createClient } from "@supabase/supabase-js";
import { useEffect, useRef, useState } from "react";
import TopNavBarLoggedIn from "@/components/TopNavBarLoggedIn";
import Footer from "@/components/Footer";
import { supabase } from "../Clients/Supabase/SupabaseClients";

type Showroom = {
  id: number;
  title: string;
  address: string;
  description: string;
  image?: string;
};

function Expandable({ open, children }: { open: boolean; children: React.ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (ref.current) {
      if (open) {
        ref.current.style.height = ref.current.scrollHeight + "px";
      } else {
        ref.current.style.height = "0px";
      }
    }
  }, [open]);

  return (
    <div
      ref={ref}
      style={{ height: "0px" }}
      className="overflow-hidden transition-[height] duration-500 ease-in-out"
    >
      <div className="p-2">{children}</div>
    </div>
  );
}

export default function ShowroomPage() {
  const [showrooms, setShowrooms] = useState<Showroom[]>([]);
  const [openIndex, setOpenIndex] = useState<number | null>(null);

  useEffect(() => {
    fetchShowrooms();
  }, []);

  const fetchShowrooms = async () => {
    const { data, error } = await supabase.from("showrooms").select("*");
    if (error) console.error("Error fetching showrooms:", error.message);
    else setShowrooms(data || []);
  };

  const toggle = (id: number) => setOpenIndex(openIndex === id ? null : id);

  const chunked: Showroom[][] = [];
  for (let i = 0; i < showrooms.length; i += 3) chunked.push(showrooms.slice(i, i + 3));

  return (
    <div className="flex flex-col min-h-screen">
      <TopNavBarLoggedIn />
      <main className="flex-1">
        <div className="max-w-7xl mx-auto px-6 py-12">
          <h2 className="text-center text-3xl font-extrabold leading-tight">
            Visit us
            <br />
            <span className="inline-block mt-1">at our Showroom Locations</span>
          </h2>
          <div className="w-16 h-1 bg-red-600 mx-auto mt-3 mb-10 rounded-full" />

          {chunked.map((row, rowIdx) => (
            <div key={rowIdx} className="grid grid-cols-1 md:grid-cols-3 gap-6 items-stretch mb-10">
              {row.map((s) => {
                const preview = s.description;
                const isOpen = openIndex === s.id;
                return (
                  <article
                    key={s.id}
                    className="rounded-xl border border-gray-200 shadow-sm bg-white overflow-hidden flex flex-col h-[600px] max-w-[350px] mx-auto"
                  >
                    <div className="w-full h-[350px] flex items-center justify-center bg-gray-100">
                      {s.image && (
                        <img
                          src={s.image}
                          alt={s.title}
                          className="w-full h-full object-cover object-center"
                          style={{ aspectRatio: "4/3" }}
                        />
                      )}
                    </div>
                    <div className="p-4 flex-1 flex flex-col items-center justify-start">
                      <h3 className="text-center text-lg font-bold text-[#B11C1C] mb-2">{s.title}</h3>
                      <p className="text-center text-base text-black mb-2">{s.address}</p>
                      {!isOpen ? (
                        <div
                          className="mt-1 text-lg text-gray-700 min-h-[72px] line-clamp-4"
                          dangerouslySetInnerHTML={{ __html: s.description }}
                        />
                      ) : (
                        <div
                          className="mt-1 text-lg text-black min-h-[72px]"
                          dangerouslySetInnerHTML={{ __html: s.description }}
                        />
                      )}
                      <Expandable open={isOpen} children={undefined}>
                        {/* You can add more details here if needed */}
                      </Expandable>
                      <button
                        onClick={() => toggle(s.id)}
                        className="mt-2 text-red-600 font-semibold text-sm hover:underline"
                      >
                        {isOpen ? "Show Less" : "Show More"}
                      </button>
                    </div>
                  </article>
                );
              })}
            </div>
          ))}
        </div>
      </main>
      <Footer />
    </div>
  );
}

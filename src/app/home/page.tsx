"use client";

import Link from "next/link";
import Image from "next/image";
import useEmblaCarousel from "embla-carousel-react";
import { useEffect, useState } from "react";
import { createClient } from "@supabase/supabase-js";
import TopNavBarLoggedIn from "@/components/TopNavBarLoggedIn";
import Footer from "@/components/Footer";

type HomeContent = {
  carousel?: Array<{ image?: string; title?: string; buttonText?: string; buttonLink?: string }>;
  explore?: Array<{ image?: string; title?: string; buttonText?: string; buttonLink?: string }>;
  featured_projects?: Array<{ image?: string; title?: string; description?: string }>;
  services?: { images?: string[]; title?: string; description?: string; buttonText?: string; buttonLink?: string };
  about?: { logo?: string; title?: string; description?: string; buttonText?: string; buttonLink?: string };
  [k: string]: any;
};

// Supabase client (client-side; uses public anon key)
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
const SUPABASE_ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";
const supabaseClient = createClient(SUPABASE_URL, SUPABASE_ANON);

// singleton id used by the admin API/backend
const SINGLETON_ID = "00000000-0000-0000-0000-000000000000";

// helper to convert storage file key -> public url (or pass through full urls)
function getImageUrl(val?: string) {
  if (!val) return "";
  if (val.startsWith("http://") || val.startsWith("https://")) return val;
  // build Supabase storage public url: /storage/v1/object/public/<bucket>/<file>
  const base = SUPABASE_URL.replace(/\/$/, "");
  return `${base}/storage/v1/object/public/uploads/${encodeURIComponent(val)}`;
}

export default function HomePage() {
  const [content, setContent] = useState<HomeContent | null>(null);
  const [loading, setLoading] = useState(true);
  const [newestProducts, setNewestProducts] = useState<any[]>([]);
  
  // load 3 newest products from products table (by created_at) — ensure this runs and populates newestProducts
  useEffect(() => {
    const loadNewest = async () => {
      if (!SUPABASE_URL || !SUPABASE_ANON) {
        console.warn("[home] Supabase env missing, skipping newest products load");
        setNewestProducts([]);
        return;
      }

      try {
        // select columns that exist in your products table
        const { data, error } = await supabaseClient
          .from("products")
          .select("id, name, description, price, images, image1, image2, image3, image4, image5, created_at")
          .order("created_at", { ascending: false })
          .limit(3);

        if (error) {
          console.warn("[home] fetch newest products error:", error);
          setNewestProducts([]);
          return;
        }
        if (!data || !Array.isArray(data) || data.length === 0) {
          console.warn("[home] products query returned no rows.");
          setNewestProducts([]);
          return;
        }

        // normalize images: prefer images[] column, otherwise gather image1..image5
        const normalized = (data as any[]).map((p) => {
          const arrFromCols = [p.image1, p.image2, p.image3, p.image4, p.image5].filter(Boolean);
          const imagesArray = Array.isArray(p.images) && p.images.length ? p.images : arrFromCols;
          const firstImage = imagesArray && imagesArray.length ? imagesArray[0] : undefined;

          return {
            id: p.id,
            title: p.title ?? p.name, // keep backward compatibility
            name: p.name,
            description: p.description,
            price: p.price,
            images: imagesArray,
            image: firstImage,
            created_at: p.created_at,
          };
        });

        setNewestProducts(normalized);
      } catch (e) {
        console.error("[home] loadNewest error:", e);
        setNewestProducts([]);
      }
    };
    loadNewest();
  }, []);

  // fallback static slides (keeps same design if DB empty)
  const fallbackSlides = [
    { id: 1, title: "Welcome to Grand East", image_url: "/slider1.jpg", link_url: "/about-us" },
    { id: 2, title: "Quality Aluminum & Glass", image_url: "/slider2.jpg", link_url: "/products" },
    { id: 3, title: "Modern Designs", image_url: "/slider3.jpg", link_url: "/services" },
  ];

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      try {
        const { data, error } = await supabaseClient
          .from("home_content")
          .select("content")
          .eq("id", SINGLETON_ID)
          .single();

        if (error) {
          console.warn("fetch home_content:", error);
          setContent(null);
        } else {
          // content in DB may be stored as a JSON string or as an object.
          const raw = data?.content ?? {};
          let parsed: any = raw;
          if (typeof raw === "string") {
            try {
              parsed = JSON.parse(raw);
            } catch (e) {
              console.warn("home_content.content JSON parse failed, using raw value", e);
              parsed = raw;
            }
          }
          setContent((parsed ?? {}) as HomeContent);
        }
      } catch (err) {
        console.error("load home_content error:", err);
        setContent(null);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  const carousel = (content?.carousel && content.carousel.length ? content.carousel : fallbackSlides) as any[];

  return (
    <div className="min-h-screen flex flex-col">
      <TopNavBarLoggedIn />
      <main className="flex flex-col items-center justify-center flex-1 w-full">
        {/* Hero Section */}
        <HeroSlider slides={carousel} />

        {/* make background below the carousel white */}
        <div className="w-full bg-white">
          {/* Product Categories */}
          <section className="max-w-screen-xl mx-auto py-8">
            {/* Only show newest products (sourced directly from products table) */}
            <ProductCategory
              title="Newest Products"
              identifier="newest"
              items={newestProducts}
            />
          </section>

          {/* Explore Section */}
          <ExploreSection items={content?.explore} />

          {/* Featured Projects */}
          <FeaturedProjects projects={content?.featured_projects} />

          {/* Services + About (2x2 layout) */}
          <ServicesSection services={content?.services} about={content?.about} />
        </div>
      </main>
      <Footer />
    </div>
  );
}

// Slider Component
function HeroSlider({ slides }: { slides: any[] }) {
  const [emblaRef, emblaApi] = useEmblaCarousel({ loop: true });
  const [selectedIndex, setSelectedIndex] = useState(0);

  useEffect(() => {
    if (!emblaApi) return;
    emblaApi.on("select", () => {
      setSelectedIndex(emblaApi.selectedScrollSnap());
    });
  }, [emblaApi]);

  // Manual autoplay implementation
  useEffect(() => {
    if (!emblaApi) return;
    const interval = setInterval(() => {
      emblaApi.scrollNext();
    }, 4000); // Change slide every 4 seconds
    return () => clearInterval(interval);
  }, [emblaApi]);

  return (
    // smaller, responsive slider:
    // mobile ~140px, sm ~200px, md ~280px
    <div className="relative w-full h-[140px] sm:h-[200px] md:h-[280px] overflow-hidden">
      <div className="overflow-hidden h-full" ref={emblaRef}>
        <div className="flex h-full">
          {slides.map((slide: any, idx: number) => {
            const title = slide.title ?? slide.name ?? "";
            const link = slide.buttonLink ?? slide.link_url ?? slide.buttonLink;
            const img = slide.image ?? slide.image_url ?? slide.url ?? "";
            const src = getImageUrl(img);
            return (
              <div key={idx} className="flex-[0_0_100%] relative h-full">
                {/* Image fills the slide area */}
                {src ? (
                  <div className="absolute inset-0">
                    <Image src={src} alt={title} fill className="object-cover" priority />
                  </div>
                ) : (
                  <div className="absolute inset-0 bg-gray-300" />
                )}

                <div className="absolute inset-0 bg-black/35 flex flex-col items-center justify-center text-white text-center px-4">
                  <h2 className="text-lg sm:text-2xl md:text-3xl font-bold mb-2">{title}</h2>
                  {link && (
                    <Link href={link} className="bg-red-600 px-4 py-2 rounded text-sm sm:text-base font-semibold hover:bg-red-700 transition">
                      {slide.buttonText ?? "Learn More"}
                    </Link>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Dots */}
      <div className="absolute bottom-2 left-1/2 -translate-x-1/2 flex gap-2">
        {slides.map((_, idx) => (
          <button
            key={idx}
            onClick={() => emblaApi?.scrollTo(idx)}
            className={`w-2.5 h-2.5 rounded-full ${idx === selectedIndex ? "bg-white" : "bg-gray-400"}`}
          />
        ))}
      </div>
    </div>
  );
}

function ProductCategory({
  title,
  identifier,
  items,
}: {
  title: string;
  identifier: string;
  items: any[] | undefined;
}) {
  // ensure we only render the 3 newest items passed in
  const rawList = items && items.length ? items : [];
  const list = rawList.slice(0, 3);

  return (
    <div className="mb-8" id={identifier}>
      <h2 className="text-2xl font-bold mb-4 text-black">{title}</h2>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {list.length
          ? list.map((item: any, idx: number) => {
              // support plain string items
              if (typeof item === "string") {
                return (
                  <div key={item + idx} className="border shadow p-4">
                    <div className="h-40 bg-gray-200 flex items-center justify-center">
                      <span className="text-gray-500">Image</span>
                    </div>
                    <h3 className="mt-2 font-semibold text-center text-black">{item}</h3>
                    <button className="mt-2 bg-red-600 text-white px-3 py-1 rounded w-full">View Now</button>
                  </div>
                );
              }

              const key = item.id ?? item.title ?? item.name ?? idx;
              // prefer item.image, otherwise first of item.images
              const imgKey = item.image ?? (Array.isArray(item.images) && item.images.length ? item.images[0] : undefined);
              const img = imgKey ? getImageUrl(imgKey) : null;
              const dateLabel = item.created_at ? new Date(item.created_at).toLocaleDateString() : null;
              const shortDesc =
                item.description ?? item.summary ?? (typeof item.content === "string" ? item.content.slice(0, 120) : undefined);
              const displayTitle = item.title ?? item.name ?? "Untitled";

              return (
                <div key={key} className="border shadow p-4 flex flex-col">
                  <div className="h-40 bg-gray-200 flex items-center justify-center overflow-hidden">
                    {img ? <img src={img} alt={item.title || item.name || "Product"} className="h-full w-full object-cover" /> : <span className="text-gray-500">Image</span>}
                  </div>

                  <div className="flex-1 flex flex-col justify-between mt-2">
                    <div>
                      <h3 className="font-semibold text-center text-black">{displayTitle}</h3>
                      {shortDesc ? <p className="text-sm text-gray-600 mt-1 text-center">{shortDesc}</p> : null}
                      {dateLabel ? <div className="text-xs text-gray-500 text-center mt-2">{dateLabel}</div> : null}
                    </div>

                    <div className="mt-3">
                      {/* link to product page if id exists, otherwise no-op */}
                      {item.id ? (
                        // navigate to the details page and pass id as a query param so the details page can read it
                        <Link href={`/Product/details?id=${item.id}`} className="block text-center bg-red-600 text-white px-3 py-1 rounded">
                          View Now
                        </Link>
                      ) : (
                        // fallback: go to Product listing if no id available
                        <Link href="/Product" className="w-full block text-center bg-red-600 text-white px-3 py-1 rounded">
                          View Now
                        </Link>
                      )}
                    </div>
                  </div>
                </div>
              );
            })
          : // fallback placeholders
            ["GE 103", "GE 79", "GE 116"].map((t) => (
               <div key={t} className="border shadow p-4">
                 <div className="h-40 bg-gray-200 flex items-center justify-center">
                   <span className="text-gray-500">Image</span>
                 </div>
                <h3 className="mt-2 font-semibold text-center text-black">{t}</h3>
                 <button className="mt-2 bg-red-600 text-white px-3 py-1 rounded w-full">View Now</button>
               </div>
             ))}
      </div>
    </div>
  );
}

function ExploreSection({ items }: { items?: Array<any> }) {
  // fallback categories if none provided
  const categories = items && items.length ? items : [
    { title: "Doors", buttonText: "View More Products", image: "/doors.jpg" },
    { title: "Enclosures", buttonText: "View More Products", image: "/enclosures.jpg" },
    { title: "Windows", buttonText: "View More Products", image: "/windows.jpg" },
    { title: "Railings", buttonText: "View More Products", image: "/railings.jpg" },
  ];

  return (
    <section className="w-full bg-white py-12">
      <div className="max-w-screen-xl mx-auto">
        <h2 className="text-5xl font-bold text-center text-[#444] mb-2">Explore Our Products</h2>
        <div className="h-1 w-20 bg-[#8B1C1C] mx-auto mb-6" />
        <p className="text-center text-xl italic text-[#444] mb-10">
          Explore innovative designs and durable materials<br />
          that redefine elegance in every space.
        </p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {categories.map((cat, i) => {
            const img = getImageUrl(cat.image);
            return (
              <div
                key={i}
                className="relative group h-[320px] md:h-[340px] rounded overflow-hidden flex items-center justify-center"
                style={{ minHeight: "320px" }}
              >
                {/* Background image */}
                {img ? (
                  <img
                    src={img}
                    alt={cat.title || ""}
                    className="absolute inset-0 w-full h-full object-cover"
                  />
                ) : (
                  <div className="absolute inset-0 bg-gray-200" />
                )}
                {/* Overlay */}
                <div className="absolute inset-0 bg-black/30 group-hover:bg-black/40 transition" />
                {/* Centered content */}
                <div className="relative z-10 flex flex-col items-center justify-center w-full h-full">
                  <h3 className="font-bold text-3xl md:text-4xl text-white mb-6 text-center drop-shadow">
                    {cat.title}
                  </h3>
                  <a
                    href={cat.buttonLink ?? "#"}
                    className="px-6 py-2 border-2 border-white text-white text-lg rounded bg-transparent hover:bg-white hover:text-[#8B1C1C] transition font-normal"
                  >
                    {cat.buttonText ?? "View More Products"}
                  </a>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}

function FeaturedProjects({ projects }: { projects?: Array<any> }) {
  const list = projects && projects.length ? projects : [
    { title: "Project 1", image: "/project1.jpg", description: "Description for Project 1" },
    { title: "Project 2", image: "/project2.jpg", description: "Description for Project 2" },
    { title: "Project 3", image: "/project3.jpg", description: "Description for Project 3" },
  ];

  // Track which card is flipped
  const [flipped, setFlipped] = useState<number | null>(null);

  return (
    <section className="w-full bg-[#232d3b] py-12">
      <div className="max-w-screen-xl mx-auto">
        {/* Header row */}
        <div className="flex flex-col md:flex-row items-center justify-between mb-8">
          <div>
            <h2 className="text-5xl font-bold text-white mb-2">Featured Projects</h2>
            <div className="h-2 w-56 bg-[#8B1C1C] mt-2" />
          </div>
          <a
            href="/Featured"
            className="bg-[#8B1C1C] text-white font-bold px-10 py-5 rounded text-lg mt-6 md:mt-0 shadow-lg hover:bg-[#a82c2c] transition"
          >
            VIEW MORE PROJECTS
          </a>
        </div>
        {/* Projects grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8 px-4">
          {list.map((p, i) => {
            const img = getImageUrl(p.image);
            const isFlipped = flipped === i;
            return (
              <div
                key={i}
                className="relative group h-[420px] cursor-pointer perspective"
                onClick={() => setFlipped(flipped === i ? null : i)}
              >
                <div className={`transition-transform duration-500 h-full w-full [transform-style:preserve-3d] ${isFlipped ? "[transform:rotateY(180deg)]" : ""}`}>
                  {/* Front Side */}
                  <div className="absolute inset-0 h-full w-full rounded overflow-hidden [backface-visibility:hidden] shadow-2xl">
                    {img ? (
                      <img src={img} alt={p.title || ""} className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full bg-gray-300" />
                    )}
                    {/* Shadow overlay in front */}
                    <div className="absolute inset-0 bg-black/20 pointer-events-none" />
                  </div>
                  {/* Back Side */}
                  <div className="absolute inset-0 h-full w-full rounded bg-white flex flex-col items-center justify-center px-6 [transform:rotateY(180deg)] [backface-visibility:hidden] shadow-2xl">
                    <h3 className="text-2xl font-bold mb-4 text-[#8B1C1C] text-center">{p.title}</h3>
                    <p className="text-gray-700 text-center text-base">{p.description}</p>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
      <style>{`
        .perspective {
          perspective: 1200px;
        }
      `}</style>
    </section>
  );
}

function ServicesSection({ services, about }: { services?: any; about?: any }) {
  const serv = services || {};
  const images: string[] = Array.isArray(serv.images) ? serv.images : [];
  const a = about || {};
  const logoUrl = a?.logo ? (a.logo.startsWith("http") ? a.logo : getImageUrl(a.logo)) : null;

  // selected index for main image (defaults to 0)
  const [selectedIndex, setSelectedIndex] = useState<number>(0);

  // reset selected when images change
  useEffect(() => {
    setSelectedIndex(0);
  }, [images]);

  const mainImage = images[selectedIndex] || images[0] || null;

  return (
    <section className="w-full py-10 bg-white border-t relative">
      <div className="max-w-screen-xl mx-auto grid grid-cols-1 md:grid-cols-2 gap-6 px-4 relative">
        {/* vertical + horizontal divider for desktop */}
        <div className="hidden md:block absolute top-0 bottom-0 left-1/2 w-1 bg-gray-300 z-10" />
        <div className="absolute left-0 right-0 top-1/2 h-1 bg-gray-300 z-10" />

        {/* Top-left: Service text (centered) */}
        <div className="order-1 md:order-1 flex items-center justify-center relative z-20 pr-4 pb-4">
          <div className="max-w-md text-center">
            <h2 className="text-2xl md:text-3xl font-bold mb-3 text-black">{serv.title ?? "Service We Offer"}</h2>
            <p className="text-gray-700 mb-5 leading-relaxed text-sm md:text-base">
              {serv.description ??
                "Grand East brings you top-tier aluminum and glass solutions, expertly crafted for both residential and commercial spaces. From sleek windows and doors to stunning facades, our services are designed to enhance both style and durability."}
            </p>
            <div className="mx-auto w-fit">
              {serv.buttonLink ? (
                <a href={serv.buttonLink} className="inline-block border border-black px-4 py-2 text-sm md:text-base font-medium text-black hover:bg-gray-100 transition">
                  {serv.buttonText ?? "Know More about Our Service"}
                </a>
              ) : (
                <button className="border border-black px-4 py-2 text-sm md:text-base font-medium text-black hover:bg-gray-100 transition">
                  {serv.buttonText ?? "Know More about Our Service"}
                </button>
              )}
            </div>
            {/* small accent line like the design */}
            <div className="mt-5 h-1 w-16 bg-red-600 mx-auto" />
          </div>
        </div>

        {/* Top-right: Images grid (click thumbnails to change main image) */}
        <div className="order-2 md:order-2 relative z-20 pr-4 pb-4">
          <div className="grid grid-cols-1 gap-3">
            {/* main image (smaller) */}
            <div className="w-full h-40 md:h-48 bg-gray-200 overflow-hidden flex items-center justify-center rounded">
              {mainImage ? (
                <img
                  src={mainImage.startsWith("http") ? mainImage : getImageUrl(mainImage)}
                  alt="Service main"
                  className="w-full h-full object-cover"
                />
              ) : (
                <span className="text-gray-500 text-sm">Main Image</span>
              )}
            </div>

            {/* thumbnails row */}
            <div className="flex gap-2">
              {images.slice(0, 5).map((im: string, idx: number) => {
                const isSelected = idx === selectedIndex;
                return (
                  <button
                    key={idx}
                    onClick={() => setSelectedIndex(idx)}
                    className={`flex-1 h-14 md:h-16 overflow-hidden rounded focus:outline-none transition ${isSelected ? "ring-2 ring-red-600" : ""}`}
                    aria-pressed={isSelected}
                    type="button"
                  >
                    {im ? (
                      <img src={im.startsWith("http") ? im : getImageUrl(im)} alt={`thumb-${idx}`} className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full bg-gray-100" />
                    )}
                  </button>
                );
              })}
              {/* fill empty slots if less than 5 thumbnails */}
              {Array.from({ length: Math.max(0, 5 - images.slice(0, 5).length) }).map((_, i) => (
                <div key={`empty-${i}`} className="flex-1 h-14 md:h-16 bg-gray-100 rounded" />
              ))}
            </div>
          </div>
        </div>

        {/* Bottom-left: Logo (kept size moderate) */}
        <div className="order-3 md:order-3 flex items-center justify-center relative z-20 pl-4 pt-4">
          <div className="w-full h-40 md:h-48 flex items-center justify-center bg-gray-100 border overflow-hidden rounded">
            {logoUrl ? <img src={logoUrl} alt="Logo" className="max-h-full object-contain" /> : <span className="text-gray-400 text-lg">LOGO IMAGE</span>}
          </div>
        </div>

        {/* Bottom-right: About card (dark) */}
        <div className="order-4 md:order-4 relative z-20 pr-4 pt-4">
          <div className="bg-[#0f2a44] text-white p-5 min-h-[160px] flex flex-col justify-between rounded">
            <div>
              <h3 className="text-xl md:text-2xl font-bold mb-2">{a.title ?? "ABOUT GRAND EAST"}</h3>
              <div className="h-1 w-12 bg-red-600 mb-3" />
              <p className="text-sm mb-4 leading-relaxed">
                {a.description ??
                  serv.aboutDescription ??
                  "At Grand East, we specialize in creating modern, durable, and stylish solutions that redefine residential and commercial spaces. With a passion for precision and a commitment to quality, our expert team delivers exceptional aluminum and glass installations that stand the test of time. Whether you're upgrading your home or transforming your business, we provide innovative designs that combine functionality with aesthetic appeal, ensuring your vision becomes a reality."}
              </p>
            </div>
            <div>
              {a.buttonLink ? (
                <a href={a.buttonLink} className="inline-block bg-red-600 text-white px-4 py-2 text-sm font-semibold hover:bg-red-700 transition">
                  {a.buttonText ?? "VIEW MORE"}
                </a>
              ) : (
                <button className="inline-block bg-red-600 text-white px-4 py-2 text-sm font-semibold hover:bg-red-700 transition">
                  {a.buttonText ?? "VIEW MORE"}
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function AboutSection({ about }: { about?: any }) {
  const logo = about?.logo ? getImageUrl(about.logo) : null;
  return (
    <section className="w-full bg-[#0f2a44] py-8 text-white">
      <div className="max-w-screen-xl mx-auto px-4">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-6">
          <div className="flex-shrink-0 flex flex-col items-center md:items-end">
            <div className="relative">
              <a href="/contact" className="inline-flex items-center justify-center bg-[#8b1e1e] hover:bg-[#7a1a18] text-white px-8 py-3 rounded shadow-md font-semibold gap-3" aria-label="Inquire Now">
                <span>INQUIRE NOW</span>
                <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M22 16.92v3a2 2 0 0 1-2.18 2 19.86 19.86 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.86 19.86 0 0 1-3.07-8.63A2 2 0 0 1 4.11 2h3A2 2 0 0 1 9.2 3.08c.12.54.28 1.08.48 1.6a2 2 0 0 1-.45 2.11L8.7 8.7a16 16 0 0 0 6 6l1.91-1.04a2 2 0 0 1 2.11-.45c.52.2 1.06.36 1.6.48A2 2 0 0 1 22 16.92z" />
                </svg>
              </a>

              <a href="tel:+630000000000" className="absolute left-1/2 transform -translate-x-1/2 top-full mt-2 text-white underline text-sm">Call us</a>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}



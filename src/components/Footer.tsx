import { FaFacebookF } from "react-icons/fa";
import { FiPhone } from "react-icons/fi";

export default function Footer() {
  return (
    <footer className="bg-[#f5f5f5] pt-8">
      <div className="max-w-6xl mx-auto px-4">
        <h2 className="text-lg font-semibold mb-6 text-black">Quick Links</h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-8 pb-8">
          <div>
            <h3 className="font-bold mb-2 text-black">About Us</h3>
            <ul>
              <li>
                <a
                  href="/showroom"
                  className="text-gray-400 font-semibold hover:text-[#232d3b] transition-colors cursor-pointer"
                >
                  Showroom
                </a>
              </li>
              <li>
                <a
                  href="/locations"
                  className="text-gray-400 font-semibold hover:text-[#232d3b] transition-colors cursor-pointer"
                >
                  Locations
                </a>
              </li>
            </ul>
          </div>
          <div>
            <h3 className="font-bold mb-2 text-black">Services We Offer</h3>
            <ul>
              <li>
                <a
                  href="/services"
                  className="text-gray-400 font-semibold hover:text-[#232d3b] transition-colors cursor-pointer"
                >
                  List of Services
                </a>
              </li>
              <li>
                <a
                  href="/Featured"
                  className="text-gray-400 font-semibold hover:text-[#232d3b] transition-colors cursor-pointer"
                >
                  Featured Projects
                </a>
              </li>
              <li>
                <a
                  href="/order-process"
                  className="text-gray-400 font-semibold hover:text-[#232d3b] transition-colors cursor-pointer"
                >
                  Delivery & Order Process
                </a>
              </li>
            </ul>
          </div>
          <div>
            <h3 className="font-bold mb-2 text-black">Products</h3>
            <ul>
              <li>
                <a
                  href="/Product"
                  className="text-gray-400 font-semibold hover:text-[#232d3b] transition-colors cursor-pointer"
                >
                  All Products
                </a>
              </li>
              <li>
                <a
                  href="/Product?category=Doors"
                  className="text-gray-400 font-semibold hover:text-[#232d3b] transition-colors cursor-pointer"
                >
                  Doors
                </a>
              </li>
              <li>
                <a
                  href="/Product?category=Windows"
                  className="text-gray-400 font-semibold hover:text-[#232d3b] transition-colors cursor-pointer"
                >
                  Windows
                </a>
              </li>
              <li>
                <a
                  href="/Product?category=Enclosure"
                  className="text-gray-400 font-semibold hover:text-[#232d3b] transition-colors cursor-pointer"
                >
                  Enclosure
                </a>
              </li>
              <li>
                <a
                  href="/Product?category=Casement"
                  className="text-gray-400 font-semibold hover:text-[#232d3b] transition-colors cursor-pointer"
                >
                  Casement
                </a>
              </li>
              <li>
                <a
                  href="/Product?category=Sliding"
                  className="text-gray-400 font-semibold hover:text-[#232d3b] transition-colors cursor-pointer"
                >
                  Sliding
                </a>
              </li>
              <li>
                <a
                  href="/Product?category=Railings"
                  className="text-gray-400 font-semibold hover:text-[#232d3b] transition-colors cursor-pointer"
                >
                  Railings
                </a>
              </li>
              <li>
                <a
                  href="/Product?category=Canopy"
                  className="text-gray-400 font-semibold hover:text-[#232d3b] transition-colors cursor-pointer"
                >
                  Canopy
                </a>
              </li>
              <li>
                <a
                  href="/Product?category=Curtain Wall"
                  className="text-gray-400 font-semibold hover:text-[#232d3b] transition-colors cursor-pointer"
                >
                  Curtain Wall
                </a>
              </li>
            <ul>
              <li>
                <a
                  href="/FAQs"
                  className="text-gray-400 font-semibold hover:text-[#232d3b] transition-colors cursor-pointer"
                >
                  FAQs
                </a>
              </li>
                </ul>
            </ul>
          </div>
          <div>
             <div>
          <ul>
              <h3 className="font-bold mb-2 text-black">FAQs</h3>
              <li>
                <a
                  href="/FAQs"
                  className="text-gray-400 font-semibold hover:text-[#232d3b] transition-colors cursor-pointer"
                >
                  FAQs
                </a>
              </li>
                </ul>
                </div>
          </div>
        </div>
      </div>
      <div className="bg-[#232d3b] py-4 px-4 flex flex-col md:flex-row items-center justify-between">
        <div className="flex-1 flex justify-center">
          <div className="flex items-center gap-6">
            <FaFacebookF className="text-white text-2xl bg-[#4267B2] rounded p-1 w-8 h-8 flex items-center justify-center" />
            <span className="inline-flex items-center justify-center w-8 h-8 rounded-full bg-white">
              <FiPhone className="text-[#232d3b] text-2xl" />
            </span>
            <span className="text-white text-lg">
              Smart || 09082810586 Globe (Viber) || 09277640475
            </span>
          </div>
        </div>
        <div className="mt-4 md:mt-0">
          <button className="bg-[#8B1C1C] text-white px-8 py-2 rounded font-semibold hover:bg-[#a83232] transition text-sm">
            INQUIRE NOW
          </button>
        </div>
      </div>
    </footer>
  );
}
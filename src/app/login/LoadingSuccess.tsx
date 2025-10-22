import { FaCheckCircle } from "react-icons/fa";

export default function LoadingSuccess() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-white">
      <FaCheckCircle className="text-green-500 mb-4" size={80} />
      <h2 className="text-2xl font-bold text-gray-800">Check your Gmail to confirm login!</h2>
      <p className="mt-2 text-gray-600">Click the link in your email to complete login.</p>
    </div>
  );
}
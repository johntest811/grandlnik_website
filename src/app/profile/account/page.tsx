"use client";

import { useState } from "react";

export default function ProfilePage() {
  const [name, setName] = useState("John Mark Fernandez");
  const [email, setEmail] = useState("john@example.com");
  const [phone, setPhone] = useState("+639XXXXXXXXX");
  const [gender, setGender] = useState("male");
  const [dob, setDob] = useState("1988-01-01");
  const [profileImage, setProfileImage] = useState<File | null>(null);

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setProfileImage(e.target.files[0]);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    alert("Profile updated!");
  };

  return (
    <div className="bg-white rounded-2xl shadow-xl w-full max-w-4xl p-8 mx-auto mt-12 border border-gray-100">
      <h2 className="text-2xl font-bold mb-6 text-[#8B1C1C]">My Profile</h2>
      <form className="grid grid-cols-1 md:grid-cols-2 gap-6" onSubmit={handleSubmit}>
        
        {/* Left Side */}
        <div className="flex flex-col gap-4">
          <div>
            <label className="font-semibold block mb-1">Name</label>
            <input
              type="text"
              value={name}
              onChange={e => setName(e.target.value)}
              className="border rounded px-3 py-2 w-full"
              required
            />
          </div>

          <div>
            <label className="font-semibold block mb-1">Email</label>
            <input
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              className="border rounded px-3 py-2 w-full"
              required
            />
          </div>

          <div>
            <label className="font-semibold block mb-1">Phone Number</label>
            <input
              type="tel"
              value={phone}
              onChange={e => setPhone(e.target.value)}
              className="border rounded px-3 py-2 w-full"
              required
            />
          </div>

          <div>
            <label className="font-semibold block mb-2">Gender</label>
            <div className="flex gap-6">
              <label className="flex items-center gap-2">
                <input
                  type="radio"
                  value="male"
                  checked={gender === "male"}
                  onChange={() => setGender("male")}
                />
                Male
              </label>
              <label className="flex items-center gap-2">
                <input
                  type="radio"
                  value="female"
                  checked={gender === "female"}
                  onChange={() => setGender("female")}
                />
                Female
              </label>
              <label className="flex items-center gap-2">
                <input
                  type="radio"
                  value="other"
                  checked={gender === "other"}
                  onChange={() => setGender("other")}
                />
                Other
              </label>
            </div>
          </div>

          <div>
            <label className="font-semibold block mb-1">Date of Birth</label>
            <input
              type="date"
              value={dob}
              onChange={e => setDob(e.target.value)}
              className="border rounded px-3 py-2 w-full"
            />
          </div>
        </div>

        {/* Right Side - Profile Image */}
        <div className="flex flex-col items-center justify-center gap-4">
          <div className="w-32 h-32 rounded-full bg-gray-100 flex items-center justify-center overflow-hidden">
            {profileImage ? (
              <img
                src={URL.createObjectURL(profileImage)}
                alt="Profile"
                className="object-cover w-full h-full"
              />
            ) : (
              <span className="text-gray-400 text-sm">No Image</span>
            )}
          </div>
          <input
            type="file"
            accept="image/*"
            onChange={handleImageUpload}
            className="text-sm"
          />
          <p className="text-xs text-gray-500">Max size: 1MB | Formats: JPEG, PNG</p>
        </div>

        {/* Save Button */}
        <div className="md:col-span-2 flex justify-end">
          <button
            type="submit"
            className="bg-[#8B1C1C] text-white px-6 py-3 rounded-xl font-semibold hover:bg-[#a83232] transition shadow"
          >
            Save Changes
          </button>
        </div>
      </form>
    </div>
  );
}

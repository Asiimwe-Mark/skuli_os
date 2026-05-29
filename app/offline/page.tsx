import { GraduationCap, WifiOff } from "lucide-react";

export default function OfflinePage() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-[#0f1729] px-4 text-center">
      <GraduationCap className="mb-4 h-16 w-16 text-amber-500" />
      <h1 className="mb-2 text-2xl font-bold text-white">SKULI</h1>
      <WifiOff className="mb-4 h-12 w-12 text-gray-400" />
      <h2 className="mb-2 text-xl font-semibold text-white">You are offline</h2>
      <p className="max-w-sm text-gray-400">
        Please check your internet connection and try again. Some features may
        be unavailable while offline.
      </p>
    </div>
  );
}

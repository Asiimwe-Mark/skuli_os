"use client";

import { useEffect } from "react";
import { AlertTriangle } from "lucide-react";
import Link from "next/link";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="min-h-screen bg-[var(--background)] flex items-center justify-center p-4">
      <div className="relative w-full max-w-md">
        <div className="absolute -top-32 -left-32 w-64 h-64 bg-rose-500/10 rounded-full blur-3xl" />
        <div className="absolute -bottom-32 -right-32 w-64 h-64 bg-amber-500/10 rounded-full blur-3xl" />

        <div className="relative text-center space-y-6">
          <div className="mx-auto w-20 h-20 rounded-2xl bg-rose-500/10 flex items-center justify-center">
            <AlertTriangle className="w-10 h-10 text-rose-400" />
          </div>

          <div>
            <h1 className="text-2xl font-bold text-white">Something went wrong</h1>
            <p className="text-white/60 mt-2">
              An unexpected error occurred. Please try again.
            </p>
          </div>

          <div className="bg-white/5 border border-white/10 rounded-xl p-4">
            <code className="text-sm text-white/50 break-all">
              {error.message || "Unknown error"}
            </code>
          </div>

          <div className="flex items-center justify-center gap-3">
            <button
              onClick={reset}
              className="px-6 py-2.5 bg-amber-400 text-navy-900 rounded-xl font-medium hover:bg-amber-300 transition-colors"
            >
              Try Again
            </button>
            <Link
              href="/dashboard"
              className="px-6 py-2.5 border border-white/20 text-white rounded-xl hover:bg-white/5 transition-colors"
            >
              Go to Dashboard
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}

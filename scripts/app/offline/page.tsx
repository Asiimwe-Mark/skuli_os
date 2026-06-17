"use client";

import { WifiOff, GraduationCap, Sparkles, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function OfflinePage() {
  return (
    <div className="relative min-h-screen flex flex-col items-center justify-center px-4 text-center overflow-hidden">
      <div className="relative z-10 max-w-md">
        <div className="flex items-center justify-center gap-2 mb-6">
          <div className="relative w-12 h-12 rounded-xl flex items-center justify-center shadow-card">
            <GraduationCap className="h-6 w-6 text-white" />
            <div className="absolute -inset-0.5 rounded-xl opacity-30 blur-md -z-10" />
          </div>
          <span className="font-display text-2xl font-bold">SKULI</span>
        </div>

        <div className="relative mx-auto mb-6 w-20 h-20">
          <div className="absolute inset-0 rounded-full bg-warning-50 blur-2xl" />
          <div className="relative w-20 h-20 rounded-3xl bg-warning-50 ring-1 ring-warning-50 flex items-center justify-center">
            <WifiOff className="h-10 w-10 text-secondary" />
          </div>
        </div>

        <h1 className="font-display text-3xl font-bold tracking-tight mb-2">You're offline</h1>
        <p className="text-muted mb-6 leading-relaxed">
          Please check your internet connection and try again. Some features may be unavailable while offline.
        </p>

        <Button
          variant="default"
          size="lg"
          onClick={() => typeof window !== "undefined" && window.location.reload()}
        >
          <RefreshCw className="h-4 w-4 mr-2" />
          Try Again
        </Button>

        <p className="mt-8 text-xs text-muted flex items-center justify-center gap-1.5">
          <Sparkles className="h-3 w-3 text-primary" />
          Skuli syncs your work automatically when you reconnect.
        </p>
      </div>
    </div>
  );
}

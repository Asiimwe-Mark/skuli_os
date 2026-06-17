"use client";

import { useEffect } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { AlertTriangle, RefreshCw, LayoutDashboard, Sparkles } from "lucide-react";
import { captureException } from "@/lib/error-report";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("Global error:", error);
    // Hand the error to Sentry. The capture helper attaches the digest
    // as a tag so duplicate reports from the same render collapse in
    // the Sentry UI.
    captureException(error, {
      level: "error",
      tags: { digest: error.digest ?? "none", surface: "app-error" },
    });
  }, [error]);

  return (
    <div className="relative min-h-screen flex items-center justify-center p-4 overflow-hidden">
      <div className="pointer-events-none absolute -top-32 -left-32 h-96 w-96 rounded-full bg-danger-50 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-32 -right-32 h-96 w-96 rounded-full opacity-15 blur-3xl" style={{ animationDelay: "-7s" }} />

      <div className="relative z-10 text-center max-w-md">
        <div className="relative w-20 h-20 mx-auto mb-6">
          <div className="absolute inset-0 rounded-3xl bg-danger-50 blur-2xl" />
          <div className="relative w-20 h-20 rounded-3xl bg-danger-50 ring-1 ring-danger-50 flex items-center justify-center">
            <AlertTriangle className="h-10 w-10 text-secondary" />
          </div>
        </div>

        <h1 className="font-display text-3xl sm:text-4xl font-bold tracking-tight mb-3">
          Something went wrong
        </h1>
        <p className="text-muted mb-2">
          An unexpected error occurred. Our team has been notified.
        </p>

        {error.digest && (
          <p className="text-xs text-muted bg-bg-tertiary border border-border rounded-xl p-3 mb-6 font-mono break-all">
            Reference: {error.digest}
          </p>
        )}

        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          <Button onClick={reset} variant="default" size="lg">
            <RefreshCw className="w-4 h-4 mr-2" />
            Try Again
          </Button>
          <Link href="/dashboard">
            <Button variant="outline" size="lg" className="w-full sm:w-auto">
              <LayoutDashboard className="w-4 h-4 mr-2" />
              Go to Dashboard
            </Button>
          </Link>
        </div>

        <p className="mt-8 text-xs text-muted flex items-center justify-center gap-1.5">
          <Sparkles className="h-3 w-3 text-primary" />
          SKULI
        </p>
      </div>
    </div>
  );
}

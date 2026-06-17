"use client";

import { useEffect } from "react";
import { Button } from "@/components/ui/button";
import { AlertTriangle, RefreshCcw, Home } from "lucide-react";
import Link from "next/link";
import { captureException } from "@/lib/error-report";

/**
 * Shared section error boundary used by every top-level section
 * (dashboard, teacher, portal, group, admin, ...) and the nested
 * sub-section error.tsx files. They were byte-identical duplicates;
 * consolidating them cuts a 200-line class of "I forgot to add
 * Sentry capture in the concierge one" bugs.
 *
 * The `surface` prop tags the Sentry report so we can tell at a
 * glance which section broke.
 */
export function SectionError({
  error,
  reset,
  surface,
}: {
  error: Error & { digest?: string };
  reset: () => void;
  surface: string;
}) {
  useEffect(() => {
    console.error(error);
    captureException(error, {
      level: "error",
      tags: { digest: error.digest ?? "none", surface },
    });
  }, [error, surface]);

  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] gap-5 p-6">
      <div className="w-16 h-16 bg-danger-50 rounded-full flex items-center justify-center">
        <AlertTriangle className="w-8 h-8 text-danger-600" />
      </div>
      <div className="text-center max-w-sm">
        <h2 className="text-xl font-semibold text-heading mb-2">
          Something went wrong
        </h2>
        <p className="text-muted text-sm">
          {error.message || "An unexpected error occurred. Please try again."}
        </p>
        {error.digest && (
          <p className="text-xs text-muted mt-2 font-mono">
            Error ID: {error.digest}
          </p>
        )}
      </div>
      <div className="flex gap-3">
        <Button onClick={reset} variant="outline" size="sm">
          <RefreshCcw className="w-4 h-4 mr-2" />
          Try again
        </Button>
        <Button asChild size="sm">
          <Link href="/">
            <Home className="w-4 h-4 mr-2" />
            Home
          </Link>
        </Button>
      </div>
    </div>
  );
}

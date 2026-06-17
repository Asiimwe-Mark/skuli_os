"use client";

import { useEffect } from "react";
import { Button } from "@/components/ui/button";
import { AlertTriangle, RefreshCw, Sparkles } from "lucide-react";
import { captureException } from "@/lib/error-report";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // The global-error boundary runs in the root <html>, so no
    // providers are mounted yet. We can't rely on the SDK being
    // initialised via sentry.client.config.ts here — that file is
    // imported by the app bundle, which has been replaced by the
    // global-error boundary. Use the dynamic import path that
    // Sentry's Next SDK guarantees works at this point in the
    // render lifecycle.
    console.error(error);
    void (async () => {
      try {
        const Sentry = await import("@sentry/nextjs");
        Sentry.captureException(error, {
          tags: {
            digest: error.digest ?? "none",
            surface: "global-error",
          },
        });
      } catch {
        // Sentry not configured — swallow.
      }
    })();
  }, [error]);

  return (
    <html lang="en" className="h-full antialiased">
      <body className="h-full text-heading font-sans">
        <div className="relative min-h-screen flex items-center justify-center p-4 overflow-hidden">
          <div className="pointer-events-none absolute -top-32 -left-32 h-96 w-96 rounded-full bg-danger-50 blur-3xl" />
          <div className="pointer-events-none absolute -bottom-32 -right-32 h-96 w-96 rounded-full opacity-15 blur-3xl" />

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
            <p className="text-muted mb-6">
              An unexpected error occurred. Please try again.
            </p>

            <Button onClick={reset} variant="default" size="lg">
              <RefreshCw className="w-4 h-4 mr-2" />
              Try Again
            </Button>

            <p className="mt-8 text-xs text-muted flex items-center justify-center gap-1.5">
              <Sparkles className="h-3 w-3 text-primary" />
              SKULI
            </p>
          </div>
        </div>
      </body>
    </html>
  );
}

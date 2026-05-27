'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { AlertTriangle, RefreshCw, LayoutDashboard } from 'lucide-react';

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('Global error:', error);
  }, [error]);

  return (
    <div className="min-h-screen bg-navy flex items-center justify-center p-4">
      <div className="fixed inset-0 bg-gradient-to-br from-navy via-navy-300 to-navy opacity-50" />
      <div className="fixed top-1/4 left-1/4 w-96 h-96 bg-rose/5 rounded-full blur-3xl" />

      <div className="relative z-10 text-center max-w-md">
        <div className="w-20 h-20 bg-rose/10 rounded-full flex items-center justify-center mx-auto mb-6">
          <AlertTriangle className="w-10 h-10 text-rose" />
        </div>

        <h1 className="text-3xl font-bold text-foreground mb-3">
          Something went wrong
        </h1>

        <p className="text-muted-foreground mb-2">
          An unexpected error occurred. Our team has been notified.
        </p>

        {error.message && (
          <p className="text-sm text-foreground/40 bg-navy-50/50 rounded-lg p-3 mb-6 font-mono break-all">
            {error.message}
          </p>
        )}

        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          <Button onClick={reset} size="lg">
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

        <p className="text-foreground/20 text-xs mt-8">
          SK<span className="text-amber">U</span>LI
        </p>
      </div>
    </div>
  );
}

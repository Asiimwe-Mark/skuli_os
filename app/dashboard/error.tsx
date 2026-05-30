"use client";

import { useEffect } from "react";
import { Button } from "@/components/ui/button";
import { AlertTriangle } from "lucide-react";

export default function DashboardError({
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
    <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4">
      <div className="w-16 h-16 bg-rose/10 rounded-full flex items-center justify-center">
        <AlertTriangle className="w-8 h-8 text-rose" />
      </div>
      <h2 className="text-xl font-semibold">Something went wrong</h2>
      <p className="text-muted-foreground text-sm">{error.message}</p>
      <Button onClick={reset} variant="outline">Try again</Button>
    </div>
  );
}

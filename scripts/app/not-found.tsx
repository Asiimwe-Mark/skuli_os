import Link from "next/link";
import { Button } from "@/components/ui/button";
import { FileQuestion, Home, LogIn, Sparkles } from "lucide-react";

export default function NotFound() {
  return (
    <div className="relative min-h-screen flex items-center justify-center p-4 overflow-hidden">
      <div className="relative z-10 text-center max-w-md">
        <div className="relative w-24 h-24 mx-auto mb-6">
          <div className="absolute inset-0 rounded-3xl opacity-30 blur-2xl" />
          <div className="relative w-24 h-24 rounded-3xl flex items-center justify-center shadow-pop">
            <FileQuestion className="w-12 h-12 text-white" />
          </div>
        </div>

        <h1 className="font-display text-7xl sm:text-8xl font-bold tracking-tight mb-2">404</h1>
        <h2 className="text-xl font-semibold mb-3">Page not found</h2>
        <p className="text-muted mb-8 leading-relaxed">
          The page you're looking for doesn't exist or has been moved.
        </p>

        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          <Link href="/">
            <Button variant="default" size="lg" className="w-full sm:w-auto">
              <Home className="w-4 h-4 mr-2" />
              Go Home
            </Button>
          </Link>
          <Link href="/login">
            <Button variant="outline" size="lg" className="w-full sm:w-auto">
              <LogIn className="w-4 h-4 mr-2" />
              Sign In
            </Button>
          </Link>
        </div>

        <p className="mt-10 text-xs text-muted flex items-center justify-center gap-1.5">
          <Sparkles className="h-3 w-3 text-primary" />
          SKULI
        </p>
      </div>
    </div>
  );
}

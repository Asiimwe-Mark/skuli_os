import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { FileQuestion, LayoutDashboard, Home } from 'lucide-react';

export default function NotFound() {
  return (
    <div className="min-h-screen bg-navy flex items-center justify-center p-4">
      <div className="fixed inset-0 bg-gradient-to-br from-navy via-navy-300 to-navy opacity-50" />
      <div className="fixed top-1/3 right-1/3 w-96 h-96 bg-amber/5 rounded-full blur-3xl" />

      <div className="relative z-10 text-center max-w-md">
        <div className="w-20 h-20 bg-amber/10 rounded-full flex items-center justify-center mx-auto mb-6">
          <FileQuestion className="w-10 h-10 text-amber" />
        </div>

        <h1 className="text-6xl font-bold text-foreground mb-2">404</h1>
        <h2 className="text-xl font-semibold text-foreground mb-3">
          Page not found
        </h2>
        <p className="text-muted-foreground mb-8">
          The page you&apos;re looking for doesn&apos;t exist or has been moved.
        </p>

        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          <Link href="/dashboard">
            <Button size="lg" className="w-full sm:w-auto">
              <LayoutDashboard className="w-4 h-4 mr-2" />
              Go to Dashboard
            </Button>
          </Link>
          <Link href="/">
            <Button variant="outline" size="lg" className="w-full sm:w-auto">
              <Home className="w-4 h-4 mr-2" />
              Go to Home
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

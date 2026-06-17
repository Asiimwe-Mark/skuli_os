import { updateSession } from '@/lib/supabase/middleware';
import { type NextRequest } from 'next/server';

// IMPORTANT: Next.js looks for this file at exactly `middleware.ts` (root) and
// for an exported function named `middleware`. Renaming either breaks every
// route protection in the app — the previous filename was `proxy.ts`, which
// meant the middleware never ran and only client-side layout guards stood
// between unauthenticated/wrong-role users and protected pages.
export async function middleware(request: NextRequest) {
  return await updateSession(request);
}

export const config = {
  matcher: [
    /*
     * Match all request paths except:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - public folder files
     */
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
};

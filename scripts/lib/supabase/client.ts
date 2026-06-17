'use client';

import { createBrowserClient } from '@supabase/ssr';
import type { Database } from '@/types/database';
import { useEffect, useState } from 'react';

type BrowserSupabase = ReturnType<typeof createBrowserClient<Database>>;

/**
 * Returns a Supabase browser client.
 *
 * @supabase/ssr's createBrowserClient already manages its own internal
 * singleton keyed by URL+key, so calling this multiple times in the same
 * render tree is safe and cheap. However, calling it on every render and
 * then using the resulting object as a `useEffect` dependency makes the
 * effect refire on every render (the object identity changes each call
 * even though the underlying client is cached). Components should either:
 *   1. Memoise with `useState(() => createClient())` (preferred), or
 *   2. Use the `useSupabaseBrowser()` hook below which returns a stable ref.
 */
export function createClient(): BrowserSupabase {
  return createBrowserClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}

// Alias for compatibility
export { createClient as createBrowserClient };

/**
 * Hook that returns a stable Supabase browser client for the lifetime of
 * the component. The client is created once on first render via the
 * useState initialiser — it is never re-created, and never accessed via
 * ref during render (which would trip React 19's refs lint rule).
 */
export function useSupabaseBrowser(): BrowserSupabase {
  const [supabase] = useState<BrowserSupabase>(() => createClient());
  return supabase;
}

/**
 * Subscribes to Supabase auth state changes. Returns an unsubscribe
 * function. Use inside a `useEffect` with `[]` deps.
 */
export function useAuthStateChange(
  handler: (event: string, session: import('@supabase/supabase-js').Session | null) => void,
) {
  const supabase = useSupabaseBrowser();
  useEffect(() => {
    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      handler(event, session);
    });
    return () => {
      sub.subscription.unsubscribe();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [supabase]);
}

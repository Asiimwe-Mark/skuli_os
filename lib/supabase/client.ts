'use client';

import { createBrowserClient } from '@supabase/ssr';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let client: any = null;

export function createClient() {
  if (client) return client;

  client = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );

  return client;
}

// Alias for compatibility
export { createClient as createBrowserClient };

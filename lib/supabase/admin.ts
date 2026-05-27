import { createClient } from '@supabase/supabase-js';

/**
 * Supabase admin client with service role key.
 * ONLY use on the server for admin operations that bypass RLS.
 * Uses `any` typing to avoid Supabase generic inference issues with manually-defined types.
 */
export function createAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    }
  ) as any;
}

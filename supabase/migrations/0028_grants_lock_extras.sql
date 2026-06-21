-- =============================================================================
-- SKULI SaaS: Lock EXECUTE on encrypt_secret / decrypt_secret (Audit §8.7 / §14.2)
-- Migration 0028 (part 9)
--
-- 0026_grants.sql granted EXECUTE on every function in public to
-- `anon, authenticated` and never revoked `encrypt_secret` /
-- `decrypt_secret` specifically. The functions take the vault key
-- as an argument, so any logged-in user who can reach the key
-- (bundle leak, log, one SQLi sink) can decrypt every school's
-- stored AT / Resend / Pesapal credentials.
--
-- This migration REVOKEs EXECUTE from anon + authenticated and
-- grants it to service_role only. The only call sites
-- (lib/africas-talking/client.ts and any other admin-only path)
-- now go through createAdminClient().
-- ---------------------------------------------------------------------------

REVOKE EXECUTE ON FUNCTION public.encrypt_secret(text, text) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.decrypt_secret(text, text) FROM anon, authenticated;
GRANT   EXECUTE ON FUNCTION public.encrypt_secret(text, text) TO service_role;
GRANT   EXECUTE ON FUNCTION public.decrypt_secret(text, text) TO service_role;

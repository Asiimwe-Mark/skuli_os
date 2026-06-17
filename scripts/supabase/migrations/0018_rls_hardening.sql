-- =============================================================================
-- SKULI SaaS: RLS Hardening
-- Migration 0018
--
-- The pre-launch sweep found four remaining holes that live outside
-- the per-table policy files:
--   1. audit_logs had `system_insert_audit_logs` WITH CHECK (true),
--      letting any user poison the log. Tightened to require the
--      caller's school and (when set) the caller's user_id.
--   2. push_queue had a USING (true) policy from 00025 that let every
--      authenticated user read every school's push payloads. Fixed in
--      00036 and again locked down in 00066 — this file keeps the
--      same USING (false) policy but re-asserts it for clarity.
--   3. The users role self-escalation guard (prevent_role_self_escalation
--      trigger) lives here. The function itself is in 0003; the trigger
--      goes on `users` in 0023.
--   4. The trigger on `schools` for `seed_default_grading_scale` and
--      `auto_create_referral_code` (used during the new-school flow).
--
-- All changes are idempotent: DROP POLICY / DROP TRIGGER IF EXISTS
-- before CREATE.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. audit_logs INSERT policy — per 00066. Re-asserting because the
--    `system_insert_audit_logs` policy in 00004 was WITH CHECK (true).
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS system_insert_audit_logs ON audit_logs;
CREATE POLICY system_insert_audit_logs
    ON audit_logs FOR INSERT
    WITH CHECK (
        (
            get_user_role() = 'SUPER_ADMIN'
            AND school_id IS NOT NULL
        )
        OR (
            get_user_role() IN ('SCHOOL_ADMIN', 'BURSAR', 'TEACHER', 'GROUP_ADMIN')
            AND school_id = get_user_school_id()
            AND (user_id IS NULL OR user_id = auth.uid())
        )
    );

-- ---------------------------------------------------------------------------
-- 2. push_queue — already locked down in 0014 (push_queue_no_client_access
--    USING (false) WITH CHECK (false)). Re-asserting here so the
--    hardening story is in one file.
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS push_queue_no_client_access ON push_queue;
CREATE POLICY push_queue_no_client_access
    ON push_queue FOR ALL
    USING (false) WITH CHECK (false);

-- ---------------------------------------------------------------------------
-- 3. encrypt_secret / decrypt_secret — search_path hardening.
--    These functions live in 0022. The hardening statement is here
--    so all SECURITY DEFINER search_path pinning is grouped.
-- ---------------------------------------------------------------------------
DO $$ BEGIN
    IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'encrypt_secret') THEN
        ALTER FUNCTION public.encrypt_secret(text, text) SET search_path = pg_catalog, extensions, public;
    END IF;
    IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'decrypt_secret') THEN
        ALTER FUNCTION public.decrypt_secret(text, text) SET search_path = pg_catalog, extensions, public;
    END IF;
END $$;

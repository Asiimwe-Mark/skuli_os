-- =============================================================================
-- SKULI SaaS: audit_logs append-only
-- Migration 0038 (originally 0028)
--
-- Audit Â§8.6: audit_logs is a soft-delete table today (it has an
-- is_deleted column and the set_updated_at trigger on it from
-- 0023_triggers.sql). That gives any caller with the existing
-- update policy two ways to rewrite history:
--   1. UPDATE ... SET is_deleted = true
--   2. UPDATE ... SET new_value = '{}' to scrub what was recorded
--
-- There is no business reason to mutate an audit entry. Forensic
-- value comes from the row being written exactly once and never
-- touched again. Append-only is enforced three ways here:
--
--   1. A BEFORE UPDATE trigger that raises an exception for any
--      non-service-role caller.
--   2. A BEFORE DELETE trigger (statement-level) that raises the
--      same way. (Row-level keeps the error tied to a specific
--      row for debugging.)
--   3. The service role bypasses the trigger so reaper / archival
--      jobs in the future can prune if the user opts in to that
--      policy. The default posture is still "no edits".
--
-- The triggers are idempotent: DROP TRIGGER IF EXISTS is used.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION trg_audit_logs_block_mutation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
    -- service_role bypass â€” used by future archival / reaper jobs
    -- and by the migrations themselves.
    IF auth.uid() IS NULL THEN
        RETURN NULL;
    END IF;

    RAISE EXCEPTION
        'audit_logs is append-only; % on an existing row is not permitted',
        TG_OP
        USING ERRCODE = '42501';
END;
$$;

DROP TRIGGER IF EXISTS trg_audit_logs_no_update ON public.audit_logs;
CREATE TRIGGER trg_audit_logs_no_update
    BEFORE UPDATE ON public.audit_logs
    FOR EACH ROW EXECUTE FUNCTION trg_audit_logs_block_mutation();

DROP TRIGGER IF EXISTS trg_audit_logs_no_delete ON public.audit_logs;
CREATE TRIGGER trg_audit_logs_no_delete
    BEFORE DELETE ON public.audit_logs
    FOR EACH ROW EXECUTE FUNCTION trg_audit_logs_block_mutation();

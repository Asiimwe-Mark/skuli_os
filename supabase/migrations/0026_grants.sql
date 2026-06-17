-- =============================================================================
-- SKULI SaaS: Grants
-- Migration 0026
--
-- Per 00053 + 00066 final state:
--   * anon, authenticated get the standard table privileges
--   * service_role gets EXECUTE on every function
--   * cross-tenant-leakage functions (get_student_*, fee-mutating) are
--     EXPLICITLY REVOKED from anon/authenticated and granted to
--     service_role only.
-- ---------------------------------------------------------------------------

-- ---------------------------------------------------------------------------
-- 1. Schema usage
-- ---------------------------------------------------------------------------
GRANT USAGE ON SCHEMA public TO anon, authenticated;

-- ---------------------------------------------------------------------------
-- 2. Table privileges — current + future tables
-- ---------------------------------------------------------------------------
GRANT SELECT, INSERT, UPDATE, DELETE
    ON ALL TABLES IN SCHEMA public
    TO anon, authenticated;

GRANT USAGE, SELECT, UPDATE
    ON ALL SEQUENCES IN SCHEMA public
    TO anon, authenticated;

GRANT EXECUTE
    ON ALL FUNCTIONS IN SCHEMA public
    TO anon, authenticated;

ALTER DEFAULT PRIVILEGES IN SCHEMA public
    GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO anon, authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
    GRANT USAGE, SELECT, UPDATE ON SEQUENCES TO anon, authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
    GRANT EXECUTE ON FUNCTIONS TO anon, authenticated;

-- ---------------------------------------------------------------------------
-- 3. Functions explicitly locked down to service_role only
--    (per 00066 — they leak cross-tenant data when callable by anon)
-- ---------------------------------------------------------------------------
REVOKE EXECUTE ON FUNCTION public.get_student_fee_summary(uuid, text)        FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.get_student_fee_breakdown(uuid, text)      FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.get_student_current_results(uuid, text)    FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.get_student_attendance_summary(uuid, text) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.recalculate_fee_account(uuid)              FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.confirm_tuition_payment(text, text, text, numeric) FROM anon, authenticated;

GRANT EXECUTE ON FUNCTION public.get_student_fee_summary(uuid, text)        TO service_role;
GRANT EXECUTE ON FUNCTION public.get_student_fee_breakdown(uuid, text)      TO service_role;
GRANT EXECUTE ON FUNCTION public.get_student_current_results(uuid, text)    TO service_role;
GRANT EXECUTE ON FUNCTION public.get_student_attendance_summary(uuid, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.recalculate_fee_account(uuid)              TO service_role;
GRANT EXECUTE ON FUNCTION public.confirm_tuition_payment(text, text, text, numeric) TO service_role;

-- ---------------------------------------------------------------------------
-- 4. Library issue/return — explicitly granted to authenticated (RLS
--    still applies inside the function body).
-- ---------------------------------------------------------------------------
GRANT EXECUTE ON FUNCTION public.issue_library_book(UUID, UUID, UUID, DATE, UUID)        TO authenticated;
GRANT EXECUTE ON FUNCTION public.return_library_book(UUID, UUID, NUMERIC, BOOLEAN)        TO authenticated;

-- ---------------------------------------------------------------------------
-- 5. Dashboard aggregates — granted to authenticated (SECURITY INVOKER,
--    RLS on attendance_records + fee_payments applies).
-- ---------------------------------------------------------------------------
GRANT EXECUTE ON FUNCTION public.dashboard_attendance_today(UUID, DATE)   TO authenticated;
GRANT EXECUTE ON FUNCTION public.dashboard_attendance_by_class(UUID, DATE) TO authenticated;
GRANT EXECUTE ON FUNCTION public.dashboard_payment_trend(UUID, UUID)     TO authenticated;
GRANT EXECUTE ON FUNCTION public.dashboard_payment_methods(UUID, UUID)   TO authenticated;

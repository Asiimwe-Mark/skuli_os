-- =============================================================================
-- SKULI SaaS: Dashboard MV privilege lock-down (Audit §12.2)
-- Migration 0028 (part 8)
--
-- The four `mv_dashboard_*` materialised views aggregate ALL schools
-- (one row per school_id, ...). They are not RLS-aware — materialised
-- views do not honour RLS. Granting SELECT to `authenticated` lets any
-- logged-in user query the views directly via PostgREST and read every
-- school's revenue / payment-method mix / attendance totals,
-- bypassing the SECURITY INVOKER wrapper function that the route uses.
--
-- This migration revokes SELECT from `authenticated` and keeps the
-- grant on `service_role` only. The route layer continues to call
-- the wrapper functions (which are SECURITY INVOKER and apply RLS on
-- the underlying attendance_records / fee_payments selects).
-- ---------------------------------------------------------------------------

REVOKE SELECT ON mv_dashboard_attendance_today     FROM authenticated;
REVOKE SELECT ON mv_dashboard_attendance_by_class  FROM authenticated;
REVOKE SELECT ON mv_dashboard_payment_trend        FROM authenticated;
REVOKE SELECT ON mv_dashboard_payment_methods      FROM authenticated;

REVOKE SELECT ON mv_dashboard_attendance_today     FROM anon;
REVOKE SELECT ON mv_dashboard_attendance_by_class  FROM anon;
REVOKE SELECT ON mv_dashboard_payment_trend        FROM anon;
REVOKE SELECT ON mv_dashboard_payment_methods      FROM anon;

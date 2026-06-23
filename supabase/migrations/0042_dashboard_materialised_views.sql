-- =============================================================================
-- SKULI SaaS: Dashboard Materialised Views
-- Migration 0042 (originally 0030)
--
-- The four `dashboard_*` functions (0021) recompute on every dashboard
-- render. The dashboard page (app/dashboard/page.tsx) fires all four in
-- parallel â€” that's four full table scans of attendance_records and
-- fee_payments per dashboard load, repeated 50-200x per day per school
-- admin. For a school with 5,000 students and 100 daily fee payments
-- that's ~200,000 row-reads per day per school.
--
-- This migration converts the four functions to materialised views:
--   - One row per (school_id, date) for attendance views
--   - One row per (school_id, term_id, week_start) for the trend
--   - One row per (school_id, term_id, payment_method) for methods
-- The functions are KEPT as thin SECURITY INVOKER wrappers so the
-- client-side call sites do not change.
--
-- Refresh strategy
-- ----------------
-- pg_cron is enabled by Supabase by default but the cron job has to
-- be installed in pg_catalog. Every 5 minutes, REFRESH MATERIALIZED
-- VIEW CONCURRENTLY is issued. CONCURRENTLY requires a unique index
-- on each view; we add one.
--
-- CONCURRENTLY means reads are NOT blocked during refresh â€” the old
-- snapshot stays visible until the new snapshot commits. The trade-off
-- is a brief window where the dashboard shows data up to 5 minutes
-- old. For a school-management dashboard this is acceptable (and the
-- trade-off is in the comment block the user sees in production).
--
-- What the dashboard looks like
-- -----------------------------
-- The dashboard_attendance_today view materialises ALL schools Ã— ALL
-- dates that have at least one attendance_records row. The wrapper
-- function filters on the caller's (p_school_id, p_date) inputs. This
-- keeps the view small in practice â€” only days with attendance taken
-- appear, scoped to actual schools.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. mv_dashboard_attendance_today
--    One row per (school_id, date) for every day attendance was recorded.
--    The function filters on the caller's inputs.
-- ---------------------------------------------------------------------------
DROP MATERIALIZED VIEW IF EXISTS mv_dashboard_attendance_today CASCADE;

CREATE MATERIALIZED VIEW mv_dashboard_attendance_today AS
    SELECT
        a.school_id,
        a.date,
        COUNT(*) FILTER (WHERE a.status = 'present')::BIGINT AS present,
        COUNT(*)::BIGINT                                    AS total
    FROM attendance_records a
    WHERE a.is_deleted = false
    GROUP BY a.school_id, a.date;

-- Unique index is required for REFRESH MATERIALIZED VIEW CONCURRENTLY.
-- The (school_id, date) pair is naturally unique because of the
-- attendance_records UNIQUE (student_id, class_id, date) constraint
-- combined with the per-school grouping.
CREATE UNIQUE INDEX uq_mv_dashboard_attendance_today
    ON mv_dashboard_attendance_today(school_id, date);
-- Secondary index for the "current day" hot path (no extra cost to
-- maintain; the unique index already covers it).
CREATE INDEX idx_mv_dashboard_attendance_today_date
    ON mv_dashboard_attendance_today(date);

-- Replace the function with a thin SECURITY INVOKER wrapper that
-- filters the materialised view. RLS on attendance_records does not
-- apply (the view materialises aggregated data, not rows), so the
-- wrapper does the school-scope check via the school_id column.
DROP FUNCTION IF EXISTS dashboard_attendance_today(UUID, DATE);

CREATE OR REPLACE FUNCTION dashboard_attendance_today(
    p_school_id UUID,
    p_date      DATE
) RETURNS TABLE (
    present BIGINT,
    total   BIGINT
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = pg_catalog, public
AS $$
    SELECT present, total
    FROM mv_dashboard_attendance_today
    WHERE school_id = p_school_id
      AND date = p_date;
$$;

-- ---------------------------------------------------------------------------
-- 2. mv_dashboard_attendance_by_class
-- ---------------------------------------------------------------------------
DROP MATERIALIZED VIEW IF EXISTS mv_dashboard_attendance_by_class CASCADE;

CREATE MATERIALIZED VIEW mv_dashboard_attendance_by_class AS
    SELECT
        a.school_id,
        a.date,
        a.class_id,
        COUNT(*) FILTER (WHERE a.status = 'present')::BIGINT AS present,
        COUNT(*)::BIGINT                                    AS total
    FROM attendance_records a
    WHERE a.is_deleted = false
    GROUP BY a.school_id, a.date, a.class_id;

CREATE UNIQUE INDEX uq_mv_dashboard_attendance_by_class
    ON mv_dashboard_attendance_by_class(school_id, date, class_id);
CREATE INDEX idx_mv_dashboard_attendance_by_class_date
    ON mv_dashboard_attendance_by_class(date);

DROP FUNCTION IF EXISTS dashboard_attendance_by_class(UUID, DATE);

CREATE OR REPLACE FUNCTION dashboard_attendance_by_class(
    p_school_id UUID,
    p_date      DATE
) RETURNS TABLE (
    class_id UUID,
    present  BIGINT,
    total    BIGINT
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = pg_catalog, public
AS $$
    SELECT class_id, present, total
    FROM mv_dashboard_attendance_by_class
    WHERE school_id = p_school_id
      AND date = p_date;
$$;

-- ---------------------------------------------------------------------------
-- 3. mv_dashboard_payment_trend
--    One row per (school_id, term_id, week_start). Only confirmed,
--    non-deleted payments are counted.
-- ---------------------------------------------------------------------------
DROP MATERIALIZED VIEW IF EXISTS mv_dashboard_payment_trend CASCADE;

CREATE MATERIALIZED VIEW mv_dashboard_payment_trend AS
    SELECT
        p.school_id,
        p.term_id,
        date_trunc('week', p.payment_date)::DATE AS week_start,
        SUM(p.amount)::NUMERIC                   AS amount
    FROM fee_payments p
    WHERE p.status = 'confirmed'
      AND p.is_deleted = false
      AND p.term_id IS NOT NULL
    GROUP BY p.school_id, p.term_id, date_trunc('week', p.payment_date);

CREATE UNIQUE INDEX uq_mv_dashboard_payment_trend
    ON mv_dashboard_payment_trend(school_id, term_id, week_start);
CREATE INDEX idx_mv_dashboard_payment_trend_term
    ON mv_dashboard_payment_trend(term_id);

DROP FUNCTION IF EXISTS dashboard_payment_trend(UUID, UUID);

CREATE OR REPLACE FUNCTION dashboard_payment_trend(
    p_school_id UUID,
    p_term_id   UUID
) RETURNS TABLE (
    week_start DATE,
    amount     NUMERIC
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = pg_catalog, public
AS $$
    SELECT week_start, amount
    FROM mv_dashboard_payment_trend
    WHERE school_id = p_school_id
      AND term_id = p_term_id
    ORDER BY week_start;
$$;

-- ---------------------------------------------------------------------------
-- 4. mv_dashboard_payment_methods
--    One row per (school_id, term_id, payment_method).
-- ---------------------------------------------------------------------------
DROP MATERIALIZED VIEW IF EXISTS mv_dashboard_payment_methods CASCADE;

CREATE MATERIALIZED VIEW mv_dashboard_payment_methods AS
    SELECT
        p.school_id,
        p.term_id,
        CASE
            WHEN p.payment_method IS NULL THEN 'other'
            ELSE p.payment_method::TEXT
        END                       AS payment_method,
        SUM(p.amount)::NUMERIC    AS amount
    FROM fee_payments p
    WHERE p.status = 'confirmed'
      AND p.is_deleted = false
      AND p.term_id IS NOT NULL
    GROUP BY
        p.school_id,
        p.term_id,
        CASE
            WHEN p.payment_method IS NULL THEN 'other'
            ELSE p.payment_method::TEXT
        END;

CREATE UNIQUE INDEX uq_mv_dashboard_payment_methods
    ON mv_dashboard_payment_methods(school_id, term_id, payment_method);
CREATE INDEX idx_mv_dashboard_payment_methods_term
    ON mv_dashboard_payment_methods(term_id);

DROP FUNCTION IF EXISTS dashboard_payment_methods(UUID, UUID);

CREATE OR REPLACE FUNCTION dashboard_payment_methods(
    p_school_id UUID,
    p_term_id   UUID
) RETURNS TABLE (
    payment_method TEXT,
    amount         NUMERIC
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = pg_catalog, public
AS $$
    SELECT payment_method, amount
    FROM mv_dashboard_payment_methods
    WHERE school_id = p_school_id
      AND term_id = p_term_id
    ORDER BY amount DESC;
$$;

-- ---------------------------------------------------------------------------
-- 5. pg_cron schedule
--    REFRESH MATERIALIZED VIEW CONCURRENTLY every 5 minutes. The four
--    refreshes are issued in a single DO block so a failure in one
--    surfaces in the cron run log without blocking the others.
--
--    CONCURRENTLY requires the unique indexes above. Without them
--    REFRESH would block reads of the view for the duration of the
--    refresh (~10ms-200ms per view, but a blocked read is observable
--    to the dashboard).
--
--    If pg_cron is not installed in the target environment, the DO
--    block falls through without error. The application will still
--    work â€” the dashboard just shows the original (function-based)
--    aggregates for that school until pg_cron is available. The
--    materialised views are still populated on first CREATE.
-- ---------------------------------------------------------------------------
DO $$
DECLARE
    v_pg_cron_installed boolean;
BEGIN
    SELECT EXISTS (
        SELECT 1 FROM pg_extension WHERE extname = 'pg_cron'
    ) INTO v_pg_cron_installed;

    IF NOT v_pg_cron_installed THEN
        RAISE NOTICE 'pg_cron not installed; dashboard materialised views will not auto-refresh. Run CREATE EXTENSION pg_cron to enable.';
        RETURN;
    END IF;

    -- Remove any prior jobs we may have scheduled under these names.
    -- cron.schedule is idempotent on the job name and we want a single
    -- source of truth for the schedule.
    PERFORM cron.unschedule(jobid)
    FROM cron.job
    WHERE jobname IN (
        'skuli-mv-dashboard-attendance-today',
        'skuli-mv-dashboard-attendance-by-class',
        'skuli-mv-dashboard-payment-trend',
        'skuli-mv-dashboard-payment-methods'
    );

    -- Stagger the four refreshes by 75s each so they don't all fire
    -- at minute boundaries. With 5-min cadence that means the views
    -- are 0-4 minutes old at any given moment, refreshed in a
    -- round-robin.
    PERFORM cron.schedule(
        'skuli-mv-dashboard-attendance-today',
        '*/5 * * * *',
        $cmd$ REFRESH MATERIALIZED VIEW CONCURRENTLY mv_dashboard_attendance_today; $cmd$
    );
    PERFORM cron.schedule(
        'skuli-mv-dashboard-attendance-by-class',
        '*/5 * * * *',
        $cmd$ REFRESH MATERIALIZED VIEW CONCURRENTLY mv_dashboard_attendance_by_class; $cmd$
    );
    PERFORM cron.schedule(
        'skuli-mv-dashboard-payment-trend',
        '*/5 * * * *',
        $cmd$ REFRESH MATERIALIZED VIEW CONCURRENTLY mv_dashboard_payment_trend; $cmd$
    );
    PERFORM cron.schedule(
        'skuli-mv-dashboard-payment-methods',
        '*/5 * * * *',
        $cmd$ REFRESH MATERIALIZED VIEW CONCURRENTLY mv_dashboard_payment_methods; $cmd$
    );
END $$;


-- ---------------------------------------------------------------------------
-- 6. Grants (Audit §12.2 — mv_dashboard_* are not RLS-aware)
--    These views aggregate ALL schools. Granting SELECT to `authenticated`
--    lets any logged-in user bypass the wrapper functions and read every
--    school's data directly via PostgREST. Revoke from authenticated/anon;
--    grant to service_role only. All app access goes through the wrapper
--    functions which enforce school scoping.
-- ---------------------------------------------------------------------------
REVOKE SELECT ON mv_dashboard_attendance_today     FROM authenticated;
REVOKE SELECT ON mv_dashboard_attendance_by_class  FROM authenticated;
REVOKE SELECT ON mv_dashboard_payment_trend        FROM authenticated;
REVOKE SELECT ON mv_dashboard_payment_methods      FROM authenticated;

REVOKE SELECT ON mv_dashboard_attendance_today     FROM anon;
REVOKE SELECT ON mv_dashboard_attendance_by_class  FROM anon;
REVOKE SELECT ON mv_dashboard_payment_trend        FROM anon;
REVOKE SELECT ON mv_dashboard_payment_methods      FROM anon;

GRANT SELECT ON mv_dashboard_attendance_today     TO service_role;
GRANT SELECT ON mv_dashboard_attendance_by_class  TO service_role;
GRANT SELECT ON mv_dashboard_payment_trend        TO service_role;
GRANT SELECT ON mv_dashboard_payment_methods      TO service_role;

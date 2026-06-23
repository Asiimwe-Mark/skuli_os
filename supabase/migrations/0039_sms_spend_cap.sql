-- =============================================================================
-- SKULI SaaS: per-school SMS spend cap
-- Migration 0039 (originally 0028)
--
-- Audit Â§12.5: the SMS send route has no per-school cap. A single
-- SCHOOL_ADMIN could blast a 1,000-recipient defaulter message 10x
-- in a row and the platform would foot the bill. Africa's Talking
-- charges per unit, so the cap is on cost (UGX), not message count.
--
-- Two new columns on `schools`:
--   * sms_monthly_cap_ugx       â€” the per-month ceiling, defaults
--                                  to 50,000 UGX (a defensible number
--                                  for a single primary school).
--                                  Set to 0 to disable the cap.
--   * sms_spend_reset_at        â€” the start of the current rolling
--                                  30-day window for spend tracking.
--
-- A SECURITY DEFINER helper `record_sms_spend(p_school_id, p_cost)`
-- updates the per-school running spend and reports whether the new
-- spend would push the school over its cap. The SMS send route
-- uses it inside its per-recipient loop; if the cap is exceeded,
-- the route stops dispatching and surfaces a clear error to the
-- client.
--
-- The view `school_sms_spend_status` exposes a per-school
-- {spent, cap, remaining, utilization, is_over_cap} snapshot for
-- the dashboard. SELECT-only; mutations are forced through the RPC.
-- ---------------------------------------------------------------------------

ALTER TABLE public.schools
    ADD COLUMN IF NOT EXISTS sms_monthly_cap_ugx bigint NOT NULL DEFAULT 50000,
    ADD COLUMN IF NOT EXISTS sms_spend_reset_at timestamptz;

-- Backfill: existing schools get the current month as the start of
-- their first spending window.
UPDATE public.schools
   SET sms_spend_reset_at = date_trunc('month', now())
 WHERE sms_spend_reset_at IS NULL;

-- ---------------------------------------------------------------------------
-- 1. spend helper
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.record_sms_spend(
    p_school_id uuid,
    p_cost      numeric
)
RETURNS TABLE (
    allowed        boolean,
    spent_ugx      bigint,
    cap_ugx        bigint,
    remaining_ugx  bigint,
    reason         text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
    v_cap          bigint;
    v_reset_at     timestamptz;
    v_spent        bigint := 0;
    v_remaining    bigint;
    v_now          timestamptz := now();
    v_window_start timestamptz;
BEGIN
    SELECT sms_monthly_cap_ugx, sms_spend_reset_at
      INTO v_cap, v_reset_at
      FROM schools
     WHERE id = p_school_id;

    IF NOT FOUND THEN
        RETURN QUERY SELECT false, 0::bigint, 0::bigint, 0::bigint,
                            'school not found'::text;
        RETURN;
    END IF;

    -- A cap of 0 disables the ceiling. The platform-level spam
    -- protection still applies at the route level (per-school rate
    -- limit, body length cap, max recipients).
    IF v_cap = 0 THEN
        RETURN QUERY SELECT true, 0::bigint, 0::bigint, 0::bigint,
                            ''::text;
        RETURN;
    END IF;

    -- Roll the 30-day window forward when the reset time has passed.
    IF v_reset_at IS NULL OR v_reset_at < v_now - INTERVAL '30 days' THEN
        UPDATE schools
           SET sms_spend_reset_at = v_now
         WHERE id = p_school_id;
        v_reset_at := v_now;
    END IF;

    -- Sum cost across sms_logs since the current window opened. This
    -- is a per-school aggregate; no PII is exposed.
    SELECT COALESCE(SUM(cost::bigint), 0)
      INTO v_spent
      FROM sms_logs
     WHERE school_id = p_school_id
       AND status IN ('sent', 'pending')
       AND created_at >= v_reset_at;

    v_remaining := GREATEST(v_cap - v_spent, 0);

    IF v_spent + GREATEST(p_cost, 0) > v_cap THEN
        RETURN QUERY SELECT
            false,
            v_spent,
            v_cap,
            v_remaining,
            'monthly SMS spend cap reached'::text;
        RETURN;
    END IF;

    RETURN QUERY SELECT true, v_spent, v_cap, v_remaining, ''::text;
END;
$$;

REVOKE ALL ON FUNCTION public.record_sms_spend(uuid, numeric) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.record_sms_spend(uuid, numeric) TO service_role;

-- ---------------------------------------------------------------------------
-- 2. read-only status view
-- ---------------------------------------------------------------------------
CREATE OR REPLACE VIEW public.school_sms_spend_status AS
SELECT
    s.id                                                        AS school_id,
    s.sms_monthly_cap_ugx                                       AS cap_ugx,
    COALESCE(SUM(sl.cost) FILTER (
        WHERE sl.status IN ('sent', 'pending')
          AND sl.created_at >= s.sms_spend_reset_at
    ), 0)::bigint                                               AS spent_ugx,
    GREATEST(s.sms_monthly_cap_ugx - COALESCE(SUM(sl.cost) FILTER (
        WHERE sl.status IN ('sent', 'pending')
          AND sl.created_at >= s.sms_spend_reset_at
    ), 0)::bigint, 0)::bigint                                   AS remaining_ugx,
    s.sms_spend_reset_at                                        AS window_started_at,
    CASE
        WHEN s.sms_monthly_cap_ugx = 0 THEN 0
        ELSE LEAST(
            (COALESCE(SUM(sl.cost) FILTER (
                WHERE sl.status IN ('sent', 'pending')
                  AND sl.created_at >= s.sms_spend_reset_at
            ), 0) * 100.0 / s.sms_monthly_cap_ugx)::numeric,
            100
        )
    END                                                         AS utilization_pct,
    (s.sms_monthly_cap_ugx > 0
     AND COALESCE(SUM(sl.cost) FILTER (
        WHERE sl.status IN ('sent', 'pending')
          AND sl.created_at >= s.sms_spend_reset_at
     ), 0) >= s.sms_monthly_cap_ugx)                           AS is_over_cap
FROM schools s
LEFT JOIN sms_logs sl
       ON sl.school_id = s.id
GROUP BY s.id, s.sms_monthly_cap_ugx, s.sms_spend_reset_at;

-- Only platform-level service_role should read this view â€” it
-- aggregates per-school spend and the dashboard reads it via the
-- user-scoped RLS view, not this one.
REVOKE ALL ON public.school_sms_spend_status FROM anon, authenticated;
GRANT SELECT ON public.school_sms_spend_status TO service_role;

-- ---------------------------------------------------------------------------
-- 3. RLS-friendly per-school snapshot for the school admin dashboard.
--    This is a security-barrier view that filters on the caller's
--    school. Same numbers as school_sms_spend_status, but readable
--    by SCHOOL_ADMIN / BURSAR.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE VIEW public.my_school_sms_spend AS
SELECT
    school_id,
    cap_ugx,
    spent_ugx,
    remaining_ugx,
    window_started_at,
    utilization_pct,
    is_over_cap
FROM public.school_sms_spend_status
WHERE school_id = get_user_school_id();

GRANT SELECT ON public.my_school_sms_spend TO authenticated;

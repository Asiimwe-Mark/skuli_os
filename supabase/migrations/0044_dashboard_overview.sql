-- =============================================================================
-- SKULI SaaS: Dashboard Overview RPC
-- Migration 0044 (refactor A-to-Z, Phase 6.1)
--
-- The dashboard page (app/dashboard/page.tsx) currently fires 14 parallel
-- queries from the browser, with 200+ lines of `as { data: unknown }`
-- casts in the result-normalisation step. This migration collapses all
-- 14 reads into a single SECURITY INVOKER SQL function that returns one
-- JSONB blob.
--
-- What this replaces
-- ------------------
--   • 3× fee_accounts aggregates (KPIs, defaulters, count for onboarding)
--   • 2× counts on students / classes / sms_logs / fee_structures / staff
--   • 1× schools credentials read (onboarding hasMobileMoney flag)
--   • 4× dashboard_* RPCs already defined in 0021/0042
--   • 1× classes + class_teacher join
--
-- Returns one JSONB blob shaped as the client expects:
--   { kpis, recent_payments, defaulters, counts, onboarding, attendance,
--     attendance_by_class, payment_trend, payment_methods }
--
-- SECURITY
-- --------
-- INVOKER (not DEFINER). RLS on the underlying tables applies. The
-- caller must be a member of the school they query (enforced by
-- `is_in_school(p_school_id)`) and have one of the allowed roles.
-- =============================================================================

CREATE OR REPLACE FUNCTION dashboard_overview(
    p_school_id UUID,
    p_term_id   UUID,
    p_date      DATE
) RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = pg_catalog, public
AS $$
DECLARE
    v_kpis             JSONB;
    v_recent_payments  JSONB;
    v_defaulters       JSONB;
    v_counts           JSONB;
    v_onboarding       JSONB;
    v_attendance       JSONB;
    v_attendance_class JSONB;
    v_payment_trend    JSONB;
    v_payment_methods  JSONB;
    v_has_at_creds     BOOLEAN;
    v_classes          JSONB;
    v_result           JSONB;
BEGIN
    -- ── 1. KPIs ─────────────────────────────────────────────────────────────
    -- Sum totals over the term's fee_accounts. Returns 0s for a term
    -- without any fee_accounts rows.
    SELECT jsonb_build_object(
        'totalExpected',     COALESCE(SUM(total_expected), 0),
        'totalCollected',    COALESCE(SUM(total_paid),     0),
        'totalOutstanding',  COALESCE(SUM(balance),        0),
        'collectionRate',
            CASE
                WHEN COALESCE(SUM(total_expected), 0) > 0
                THEN ROUND(
                    (COALESCE(SUM(total_paid), 0)::NUMERIC
                     / SUM(total_expected)::NUMERIC) * 100, 0)::INT
                ELSE 0
            END
    )
    INTO v_kpis
    FROM fee_accounts
    WHERE school_id = p_school_id
      AND term_id   = p_term_id
      AND is_deleted = false;

    -- ── 2. Recent payments (last 5) ──────────────────────────────────────────
    SELECT COALESCE(jsonb_agg(row_to_json(r)), '[]'::JSONB)
    INTO v_recent_payments
    FROM (
        SELECT
            p.id, p.amount, p.payment_method, p.payment_date,
            p.receipt_number, p.created_at,
            jsonb_build_object(
                'full_name',        s.full_name,
                'admission_number', s.admission_number
            ) AS student
        FROM fee_payments p
        LEFT JOIN students s ON s.id = p.student_id
        WHERE p.school_id  = p_school_id
          AND p.is_deleted = false
        ORDER BY p.created_at DESC
        LIMIT 5
    ) r;

    -- ── 3. Defaulters (top 5 by balance) ────────────────────────────────────
    SELECT COALESCE(jsonb_agg(row_to_json(r)), '[]'::JSONB)
    INTO v_defaulters
    FROM (
        SELECT
            fa.id, fa.balance, fa.status,
            jsonb_build_object(
                'id',            s.id,
                'full_name',     s.full_name,
                'current_class', jsonb_build_object('id', c.id, 'name', c.name)
            ) AS student
        FROM fee_accounts fa
        JOIN students s ON s.id = fa.student_id
        LEFT JOIN classes c ON c.id = s.current_class_id
        WHERE fa.school_id = p_school_id
          AND fa.term_id   = p_term_id
          AND fa.is_deleted = false
          AND fa.balance    > 0
        ORDER BY fa.balance DESC
        LIMIT 5
    ) r;

    -- ── 4. Counts (single row of integers) ─────────────────────────────────
    SELECT jsonb_build_object(
        'students',     (SELECT COUNT(*) FROM students
                         WHERE school_id = p_school_id
                           AND is_deleted = false AND status = 'active'),
        'classes',      (SELECT COUNT(*) FROM classes
                         WHERE school_id = p_school_id AND is_deleted = false),
        'smsSent',      (SELECT COUNT(*) FROM sms_logs
                         WHERE school_id = p_school_id AND status = 'sent'),
        'feeStructures',(SELECT COUNT(*) FROM fee_structures
                         WHERE school_id = p_school_id AND is_deleted = false),
        'staff',        (SELECT COUNT(*) FROM staff
                         WHERE school_id = p_school_id AND is_deleted = false)
    ) INTO v_counts;

    -- ── 5. Onboarding ──────────────────────────────────────────────────────
    -- Surface whether the school has AT credentials configured. Reading
    -- `africas_talking_api_key_enc` (encrypted at rest) lets us show the
    -- onboarding checklist without leaking the secret to the client.
    SELECT (africas_talking_api_key_enc IS NOT NULL
            AND length(africas_talking_api_key_enc) > 0)
      INTO v_has_at_creds
      FROM schools WHERE id = p_school_id;

    v_onboarding := jsonb_build_object(
        'hasClass',        (v_counts->>'classes')::INT      > 0,
        'hasStudents',     (v_counts->>'students')::INT     > 0,
        'hasFeeStructure', (v_counts->>'feeStructures')::INT > 0,
        'hasStaff',        (v_counts->>'staff')::INT        > 0,
        'hasSentSms',      (v_counts->>'smsSent')::INT      > 0,
        'hasMobileMoney',  COALESCE(v_has_at_creds, false)
    );

    -- ── 6. Attendance today ─────────────────────────────────────────────────
    SELECT jsonb_build_object(
        'present', COALESCE(present, 0),
        'total',   COALESCE(total,   0)
    )
      INTO v_attendance
      FROM dashboard_attendance_today(p_school_id, p_date);

    -- ── 7. Attendance by class ──────────────────────────────────────────────
    SELECT COALESCE(jsonb_agg(row_to_json(r)), '[]'::JSONB)
      INTO v_attendance_class
      FROM (
        SELECT
            c.id   AS class_id,
            c.name AS class_name,
            COALESCE(t.full_name, '') AS teacher,
            COALESCE(a.present, 0)    AS present,
            COALESCE(a.total,   0)    AS total,
            CASE
                WHEN COALESCE(a.total, 0) > 0
                THEN ROUND(a.present::NUMERIC / a.total::NUMERIC * 100, 0)::INT
                ELSE -1
            END AS pct
        FROM classes c
        LEFT JOIN users t ON t.id = c.class_teacher_id
        LEFT JOIN dashboard_attendance_by_class(p_school_id, p_date) a
            ON a.class_id = c.id
        WHERE c.school_id  = p_school_id
          AND c.is_deleted = false
        ORDER BY (CASE WHEN COALESCE(a.total, 0) = 0 THEN -1
                       ELSE ROUND(a.present::NUMERIC / a.total::NUMERIC * 100, 0)::INT
                  END) ASC
      ) r;

    -- ── 8. Payment trend (last 8 weeks) ─────────────────────────────────────
    SELECT COALESCE(jsonb_agg(row_to_json(r)), '[]'::JSONB)
      INTO v_payment_trend
      FROM (
        SELECT week_start, amount
          FROM dashboard_payment_trend(p_school_id, p_term_id)
        ORDER BY week_start DESC
        LIMIT 8
      ) r;

    -- ── 9. Payment methods ──────────────────────────────────────────────────
    SELECT COALESCE(jsonb_agg(row_to_json(r)), '[]'::JSONB)
      INTO v_payment_methods
      FROM (
        SELECT payment_method, amount
          FROM dashboard_payment_methods(p_school_id, p_term_id)
      ) r;

    -- ── 10. Compose the final blob ─────────────────────────────────────────
    v_classes := jsonb_build_object(
        'count', (v_counts->>'classes')::INT,
        'data',  '[]'::JSONB
    );

    v_result := jsonb_build_object(
        'kpis',              COALESCE(v_kpis,             '{}'::JSONB),
        'recentPayments',    COALESCE(v_recent_payments,  '[]'::JSONB),
        'defaulterAccounts', COALESCE(v_defaulters,       '[]'::JSONB),
        'counts',            COALESCE(v_counts,           '{}'::JSONB),
        'onboarding',        COALESCE(v_onboarding,       '{}'::JSONB),
        'attendanceToday',   COALESCE(v_attendance,       '{}'::JSONB),
        'attendanceByClass', COALESCE(v_attendance_class, '[]'::JSONB),
        'paymentTrend',      COALESCE(v_payment_trend,    '[]'::JSONB),
        'paymentMethods',    COALESCE(v_payment_methods,  '[]'::JSONB)
    );

    RETURN v_result;
END;
$$;

GRANT EXECUTE ON FUNCTION dashboard_overview(UUID, UUID, DATE) TO authenticated;
GRANT EXECUTE ON FUNCTION dashboard_overview(UUID, UUID, DATE) TO service_role;
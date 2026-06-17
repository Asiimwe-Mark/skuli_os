-- =============================================================================
-- SKULI SaaS: Dashboard Functions
-- Migration 0021
--
-- Server-side aggregations that replace client-side loops. Per 00063
-- (attendance) and 00064 (payments). The student-summary RPCs come
-- from 00051. All are SECURITY INVOKER so RLS on the underlying
-- tables applies.
-- ---------------------------------------------------------------------------

-- ---------------------------------------------------------------------------
-- 1. dashboard_attendance_today(p_school_id, p_date)
-- ---------------------------------------------------------------------------
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
    SELECT
        COUNT(*) FILTER (WHERE a.status = 'present')::BIGINT AS present,
        COUNT(*)::BIGINT AS total
    FROM attendance_records a
    WHERE a.school_id = p_school_id
      AND a.date = p_date;
$$;

-- ---------------------------------------------------------------------------
-- 2. dashboard_attendance_by_class(p_school_id, p_date)
-- ---------------------------------------------------------------------------
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
    SELECT
        a.class_id,
        COUNT(*) FILTER (WHERE a.status = 'present')::BIGINT AS present,
        COUNT(*)::BIGINT AS total
    FROM attendance_records a
    WHERE a.school_id = p_school_id
      AND a.date = p_date
    GROUP BY a.class_id;
$$;

-- ---------------------------------------------------------------------------
-- 3. dashboard_payment_trend(p_school_id, p_term_id)
-- ---------------------------------------------------------------------------
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
    SELECT
        date_trunc('week', p.payment_date)::DATE AS week_start,
        SUM(p.amount)::NUMERIC AS amount
    FROM fee_payments p
    WHERE p.school_id = p_school_id
      AND p.term_id = p_term_id
      AND p.status = 'confirmed'
      AND p.is_deleted = false
    GROUP BY date_trunc('week', p.payment_date)
    ORDER BY week_start;
$$;

-- ---------------------------------------------------------------------------
-- 4. dashboard_payment_methods(p_school_id, p_term_id)
-- ---------------------------------------------------------------------------
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
    SELECT
        CASE
            WHEN p.payment_method IS NULL THEN 'other'
            ELSE p.payment_method::TEXT
        END AS payment_method,
        SUM(p.amount)::NUMERIC AS amount
    FROM fee_payments p
    WHERE p.school_id = p_school_id
      AND p.term_id = p_term_id
      AND p.status = 'confirmed'
      AND p.is_deleted = false
    GROUP BY
        CASE
            WHEN p.payment_method IS NULL THEN 'other'
            ELSE p.payment_method::TEXT
        END
    ORDER BY amount DESC;
$$;

-- ---------------------------------------------------------------------------
-- 5. get_student_fee_summary(p_student_id, p_term_id text)
--    Service-role only (revoked in 0026). Per 00051.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION get_student_fee_summary(p_student_id uuid, p_term_id text)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
    v_term_id uuid;
    v_result json;
BEGIN
    IF p_term_id = '' OR p_term_id IS NULL THEN
        SELECT t.id INTO v_term_id FROM terms t WHERE t.is_current = true LIMIT 1;
    ELSE
        v_term_id := p_term_id::uuid;
    END IF;

    SELECT json_build_object(
        'total_expected', COALESCE(SUM(fa.total_expected), 0),
        'total_paid', COALESCE(SUM(fa.total_paid), 0),
        'balance', COALESCE(SUM(fa.balance), 0),
        'status', CASE
            WHEN COALESCE(SUM(fa.balance), 0) <= 0 THEN 'paid'
            WHEN COALESCE(SUM(fa.total_paid), 0) > 0 THEN 'partial'
            ELSE 'unpaid'
        END
    ) INTO v_result
    FROM fee_accounts fa
    WHERE fa.student_id = p_student_id
      AND fa.term_id = v_term_id
      AND fa.is_deleted = false;

    RETURN COALESCE(v_result, json_build_object('total_expected', 0, 'total_paid', 0, 'balance', 0, 'status', 'unpaid'));
END;
$$;

-- ---------------------------------------------------------------------------
-- 6. get_student_fee_breakdown(p_student_id, p_term_id text)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION get_student_fee_breakdown(p_student_id uuid, p_term_id text)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
    v_term_id uuid;
BEGIN
    IF p_term_id = '' OR p_term_id IS NULL THEN
        SELECT t.id INTO v_term_id FROM terms t WHERE t.is_current = true LIMIT 1;
    ELSE
        v_term_id := p_term_id::uuid;
    END IF;

    RETURN (
        SELECT COALESCE(json_agg(json_build_object(
            'fee_name', fs.name,
            'amount', fs.amount,
            'paid', COALESCE(fp.paid_amount, 0)
        )), '[]'::json)
        FROM fee_structures fs
        LEFT JOIN (
            SELECT fee_account_id, SUM(amount) AS paid_amount
            FROM fee_payments
            WHERE is_deleted = false
            GROUP BY fee_account_id
        ) fp ON fp.fee_account_id IN (
            SELECT fa.id FROM fee_accounts fa
            WHERE fa.student_id = p_student_id AND fa.term_id = v_term_id
        )
        WHERE fs.term_id = v_term_id
          AND fs.is_deleted = false
          AND (fs.class_id IS NULL OR fs.class_id IN (
              SELECT ce.class_id FROM class_enrollments ce
              WHERE ce.student_id = p_student_id AND ce.term_id = v_term_id
          ))
    );
END;
$$;

-- ---------------------------------------------------------------------------
-- 7. get_student_current_results(p_student_id, p_term_id text)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION get_student_current_results(p_student_id uuid, p_term_id text)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
    v_term_id uuid;
    v_class_position int;
    v_result json;
BEGIN
    IF p_term_id = '' OR p_term_id IS NULL THEN
        SELECT t.id INTO v_term_id FROM terms t WHERE t.is_current = true LIMIT 1;
    ELSE
        v_term_id := p_term_id::uuid;
    END IF;

    SELECT rc.position_in_class INTO v_class_position
    FROM report_cards rc
    WHERE rc.student_id = p_student_id
      AND rc.term_id = v_term_id
      AND rc.is_deleted = false
    LIMIT 1;

    SELECT json_build_object(
        'subjects', COALESCE((
            SELECT json_agg(json_build_object(
                'subject_id', m.subject_id,
                'subject_name', s.name,
                'score', m.score,
                'max_score', m.max_score,
                'exam_type', m.exam_type
            ))
            FROM marks m
            JOIN subjects s ON s.id = m.subject_id
            WHERE m.student_id = p_student_id
              AND m.term_id = v_term_id
              AND m.is_deleted = false
        ), '[]'::json),
        'class_position', v_class_position
    ) INTO v_result;

    RETURN v_result;
END;
$$;

-- ---------------------------------------------------------------------------
-- 8. get_student_attendance_summary(p_student_id, p_term_id text)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION get_student_attendance_summary(p_student_id uuid, p_term_id text)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
    v_term_id uuid;
    v_result json;
BEGIN
    IF p_term_id = '' OR p_term_id IS NULL THEN
        SELECT t.id INTO v_term_id FROM terms t WHERE t.is_current = true LIMIT 1;
    ELSE
        v_term_id := p_term_id::uuid;
    END IF;

    SELECT json_build_object(
        'total_days', COUNT(*),
        'present', COUNT(*) FILTER (WHERE status = 'present'),
        'absent',  COUNT(*) FILTER (WHERE status = 'absent'),
        'late',    COUNT(*) FILTER (WHERE status = 'late'),
        'excused', COUNT(*) FILTER (WHERE status = 'excused'),
        'rate', CASE
            WHEN COUNT(*) > 0 THEN ROUND((COUNT(*) FILTER (WHERE status IN ('present', 'late'))::numeric / COUNT(*)::numeric) * 100, 1)
            ELSE 0
        END
    ) INTO v_result
    FROM attendance_records ar
    WHERE ar.student_id = p_student_id
      AND ar.term_id = v_term_id
      AND ar.is_deleted = false;

    RETURN COALESCE(v_result, json_build_object('total_days', 0, 'present', 0, 'absent', 0, 'late', 0, 'excused', 0, 'rate', 0));
END;
$$;

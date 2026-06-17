-- =============================================================================
-- SKULI SaaS: Views
-- Migration 0024
--
-- All views created with `WITH (security_invoker = true)` so the
-- view runs with the caller's privileges and RLS on the underlying
-- tables applies. Per 00035 + 00061.
-- ---------------------------------------------------------------------------

-- ---------------------------------------------------------------------------
-- 1. attendance_weekly_summary
--    Per-class per-week attendance with holiday-adjusted denominator.
-- ---------------------------------------------------------------------------
CREATE VIEW attendance_weekly_summary
WITH (security_invoker = true)
AS
WITH weekly AS (
    SELECT
        ar.school_id,
        c.id   AS class_id,
        c.name AS class_name,
        date_trunc('week', ar.date)::date AS week_start,
        COUNT(*) FILTER (WHERE ar.status = 'present')  AS present_count,
        COUNT(*) FILTER (WHERE ar.status = 'absent')   AS absent_count,
        COUNT(*) FILTER (WHERE ar.status = 'late')     AS late_count,
        COUNT(*) FILTER (WHERE ar.status = 'excused')  AS excused_count,
        COUNT(*) AS total_records
    FROM attendance_records ar
    JOIN classes c ON c.id = ar.class_id
    GROUP BY ar.school_id, c.id, c.name, date_trunc('week', ar.date)
)
SELECT
    w.*,
    (5 - COALESCE((
        SELECT COUNT(*)
        FROM calendar_events ce
        WHERE ce.school_id = w.school_id
          AND ce.event_type = 'holiday'
          AND ce.affects_attendance = true
          AND ce.is_deleted = false
          AND ce.event_date >= w.week_start
          AND ce.event_date < (w.week_start + interval '5 days')::date
    ), 0)) AS expected_school_days,
    ROUND(
        w.present_count * 100.0 / NULLIF(w.total_records, 0),
        1
    ) AS attendance_rate
FROM weekly w;

-- ---------------------------------------------------------------------------
-- 2. class_fee_summary
-- ---------------------------------------------------------------------------
CREATE VIEW class_fee_summary
WITH (security_invoker = true)
AS
SELECT
    fa.school_id,
    s.current_class_id AS class_id,
    c.name             AS class_name,
    COUNT(DISTINCT fa.student_id) AS student_count,
    SUM(fa.total_expected) AS total_expected,
    SUM(fa.total_paid)     AS total_paid,
    SUM(fa.balance)        AS total_balance,
    ROUND((SUM(fa.total_paid) / NULLIF(SUM(fa.total_expected), 0)) * 100, 1) AS collection_rate_pct
FROM fee_accounts fa
JOIN students s ON s.id = fa.student_id
JOIN classes c ON c.id = s.current_class_id
WHERE fa.is_deleted = false
  AND s.is_deleted = false
  AND s.status = 'active'
GROUP BY fa.school_id, s.current_class_id, c.name;

-- ---------------------------------------------------------------------------
-- 3. subject_performance_summary
-- ---------------------------------------------------------------------------
CREATE VIEW subject_performance_summary
WITH (security_invoker = true)
AS
SELECT
    m.school_id,
    m.class_id,
    c.name    AS class_name,
    m.subject_id,
    sub.name  AS subject_name,
    m.term_id,
    COUNT(DISTINCT m.student_id) AS student_count,
    ROUND(AVG(m.score / NULLIF(m.max_score, 0) * 100), 1) AS avg_pct,
    MAX(m.score) AS max_score,
    MIN(m.score) AS min_score
FROM marks m
JOIN classes  c   ON c.id   = m.class_id
JOIN subjects sub ON sub.id = m.subject_id
WHERE m.is_deleted = false
  AND m.review_status IN ('approved', 'submitted')
GROUP BY m.school_id, m.class_id, c.name, m.subject_id, sub.name, m.term_id;

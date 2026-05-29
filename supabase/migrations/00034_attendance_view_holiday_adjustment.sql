-- Migration: Update attendance_weekly_summary to subtract holidays
-- Holidays with affects_attendance=true are excluded from the attendance denominator

CREATE OR REPLACE VIEW attendance_weekly_summary AS
WITH holiday_dates AS (
  SELECT
    ce.school_id,
    d::date AS holiday_date
  FROM calendar_events ce,
    LATERAL generate_series(
      ce.event_date::date,
      COALESCE(ce.end_date::date, ce.event_date::date),
      '1 day'::interval
    ) d
  WHERE ce.affects_attendance = true
    AND ce.is_deleted = false
)
SELECT
  ar.school_id,
  ar.class_id,
  c.name AS class_name,
  DATE_TRUNC('week', ar.date::date) AS week_start,
  COUNT(*) AS total_records,
  COUNT(*) FILTER (WHERE ar.status = 'present') AS present_count,
  ROUND(
    COUNT(*) FILTER (WHERE ar.status = 'present')::numeric
    / NULLIF(COUNT(*) - COUNT(DISTINCT CASE WHEN hd.holiday_date IS NOT NULL THEN ar.date::date END), 0)
    * 100,
    1
  ) AS attendance_pct
FROM attendance_records ar
JOIN classes c ON c.id = ar.class_id
LEFT JOIN holiday_dates hd ON hd.school_id = ar.school_id AND hd.holiday_date = ar.date::date
WHERE ar.is_deleted = false
GROUP BY ar.school_id, ar.class_id, c.name, DATE_TRUNC('week', ar.date::date);

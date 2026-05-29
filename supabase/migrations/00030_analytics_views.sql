-- Migration: Analytics helper views for Advanced Analytics Dashboard (Step 18)

-- View: class_fee_summary — per-class fee collection stats for current term
CREATE OR REPLACE VIEW class_fee_summary AS
SELECT
  fa.school_id,
  s.current_class_id AS class_id,
  c.name AS class_name,
  COUNT(DISTINCT fa.student_id) AS student_count,
  SUM(fa.total_expected) AS total_expected,
  SUM(fa.total_paid) AS total_paid,
  SUM(fa.balance) AS total_balance,
  ROUND((SUM(fa.total_paid) / NULLIF(SUM(fa.total_expected), 0)) * 100, 1) AS collection_rate_pct
FROM fee_accounts fa
JOIN students s ON s.id = fa.student_id
JOIN classes c ON c.id = s.current_class_id
WHERE fa.is_deleted = false AND s.is_deleted = false AND s.status = 'active'
GROUP BY fa.school_id, s.current_class_id, c.name;

-- View: subject_performance_summary — per-class per-subject marks stats
CREATE OR REPLACE VIEW subject_performance_summary AS
SELECT
  m.school_id,
  m.class_id,
  c.name AS class_name,
  m.subject_id,
  sub.name AS subject_name,
  m.term_id,
  COUNT(DISTINCT m.student_id) AS student_count,
  ROUND(AVG(m.score / NULLIF(m.max_score, 0) * 100), 1) AS avg_pct,
  MAX(m.score) AS max_score,
  MIN(m.score) AS min_score
FROM marks m
JOIN classes c ON c.id = m.class_id
JOIN subjects sub ON sub.id = m.subject_id
WHERE m.is_deleted = false AND m.review_status IN ('approved', 'submitted')
GROUP BY m.school_id, m.class_id, c.name, m.subject_id, sub.name, m.term_id;

-- View: attendance_weekly_summary — weekly attendance rates by class
CREATE OR REPLACE VIEW attendance_weekly_summary AS
SELECT
  ar.school_id,
  ar.class_id,
  c.name AS class_name,
  DATE_TRUNC('week', ar.date::date) AS week_start,
  COUNT(*) AS total_records,
  COUNT(*) FILTER (WHERE ar.status = 'present') AS present_count,
  ROUND(
    COUNT(*) FILTER (WHERE ar.status = 'present')::numeric / NULLIF(COUNT(*), 0) * 100,
    1
  ) AS attendance_pct
FROM attendance_records ar
JOIN classes c ON c.id = ar.class_id
WHERE ar.is_deleted = false
GROUP BY ar.school_id, ar.class_id, c.name, DATE_TRUNC('week', ar.date::date);

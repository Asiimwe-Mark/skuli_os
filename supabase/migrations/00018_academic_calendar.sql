-- Migration 00018: Academic Calendar with Holidays
-- Creates calendar_events table for managing school holidays, exams, events, and closures

CREATE TABLE calendar_events (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id   uuid NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  title       text NOT NULL,
  description text,
  event_date  date NOT NULL,
  end_date    date,
  event_type  text NOT NULL DEFAULT 'event'
              CHECK (event_type IN ('holiday', 'exam', 'event', 'closure', 'meeting')),
  affects_attendance boolean NOT NULL DEFAULT true,
  class_id    uuid REFERENCES classes(id) ON DELETE SET NULL,
  is_public   boolean NOT NULL DEFAULT true,
  created_by  uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  is_deleted  boolean NOT NULL DEFAULT false
);

ALTER TABLE calendar_events ENABLE ROW LEVEL SECURITY;

-- School admins can manage all calendar events
CREATE POLICY "school_admin_manage_calendar" ON calendar_events FOR ALL
  USING (school_id = get_user_school_id() AND get_user_role() IN ('SCHOOL_ADMIN', 'ADMIN'));

-- Teachers can view and create events for their classes
CREATE POLICY "teacher_manage_class_calendar" ON calendar_events FOR ALL
  USING (
    school_id = get_user_school_id()
    AND get_user_role() = 'TEACHER'
    AND (
      class_id IS NULL
      OR EXISTS (
        SELECT 1 FROM teacher_class_assignments tca
        WHERE tca.teacher_id = auth.uid()
          AND tca.class_id = calendar_events.class_id
          AND tca.is_deleted = false
      )
    )
  );

-- Parents can view public events for their children's school/class
CREATE POLICY "portal_view_public_calendar" ON calendar_events FOR SELECT
  USING (
    is_public = true
    AND school_id IN (
      SELECT s.school_id
      FROM students s
      JOIN parent_students ps ON ps.student_id = s.id
      WHERE ps.parent_id = auth.uid()
    )
    AND (
      class_id IS NULL
      OR class_id IN (
        SELECT student.class_id
        FROM students student
        JOIN parent_students ps ON ps.student_id = student.id
        WHERE ps.parent_id = auth.uid()
      )
    )
  );

-- Index for efficient date-based queries
CREATE INDEX idx_calendar_events_date ON calendar_events(school_id, event_date)
  WHERE is_deleted = false;

-- Index for class-specific events
CREATE INDEX idx_calendar_events_class ON calendar_events(class_id)
  WHERE is_deleted = false;

-- Comment on table
COMMENT ON TABLE calendar_events IS 'Stores school calendar events including holidays, exams, meetings, and closures. affects_attendance=true events are excluded from attendance percentage calculations.';

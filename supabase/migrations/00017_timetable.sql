-- Migration 00017: Timetable Builder
-- Adds support for school periods and class timetables

CREATE TABLE IF NOT EXISTS timetable_periods (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id   uuid NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  name        text NOT NULL,       -- e.g. "Period 1"
  start_time  time NOT NULL,       -- e.g. 08:00
  end_time    time NOT NULL,
  sort_order  int NOT NULL DEFAULT 0,
  is_break    boolean NOT NULL DEFAULT false, -- lunch, recess
  is_deleted  boolean NOT NULL DEFAULT false,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS timetable_slots (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id   uuid NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  class_id    uuid NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
  period_id   uuid NOT NULL REFERENCES timetable_periods(id) ON DELETE CASCADE,
  day_of_week int NOT NULL CHECK (day_of_week BETWEEN 1 AND 5), -- 1=Mon, 5=Fri
  subject_id  uuid REFERENCES subjects(id),
  teacher_id  uuid REFERENCES users(id),
  room        text,
  academic_year_id uuid REFERENCES academic_years(id),
  is_deleted  boolean NOT NULL DEFAULT false,
  created_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (school_id, class_id, period_id, day_of_week, academic_year_id)
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_timetable_periods_school ON timetable_periods(school_id, is_deleted);
CREATE INDEX IF NOT EXISTS idx_timetable_slots_class ON timetable_slots(class_id, day_of_week, is_deleted);
CREATE INDEX IF NOT EXISTS idx_timetable_slots_teacher ON timetable_slots(teacher_id, day_of_week, period_id, is_deleted);

-- RLS
ALTER TABLE timetable_periods ENABLE ROW LEVEL SECURITY;
ALTER TABLE timetable_slots ENABLE ROW LEVEL SECURITY;

-- Policies
CREATE POLICY "school_admin_manage_periods" ON timetable_periods FOR ALL
  USING (school_id = get_user_school_id());

CREATE POLICY "school_admin_manage_slots" ON timetable_slots FOR ALL
  USING (school_id = get_user_school_id());

-- Teachers can view slots for their assigned classes
CREATE POLICY "teacher_view_slots" ON timetable_slots FOR SELECT
  USING (
    school_id = get_user_school_id() 
    AND EXISTS (
      SELECT 1 FROM teacher_class_assignments tca
      WHERE tca.teacher_id = auth.uid()
        AND tca.class_id = timetable_slots.class_id
        AND tca.is_deleted = false
    )
  );

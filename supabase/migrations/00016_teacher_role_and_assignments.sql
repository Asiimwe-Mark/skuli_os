-- ============================================
-- Migration: 00016_teacher_role_and_assignments.sql
-- ============================================

-- Add TEACHER role to user_role enum
ALTER TYPE user_role ADD VALUE IF NOT EXISTS 'TEACHER';

-- teacher_class_assignments: which teacher owns which classes/subjects
CREATE TABLE IF NOT EXISTS teacher_class_assignments (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id   uuid NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  teacher_id  uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  class_id    uuid NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
  subject_id  uuid REFERENCES subjects(id) ON DELETE CASCADE, -- null = class teacher (homeroom)
  is_class_teacher boolean NOT NULL DEFAULT false,
  created_at  timestamptz NOT NULL DEFAULT now(),
  is_deleted  boolean NOT NULL DEFAULT false,
  UNIQUE (school_id, teacher_id, class_id, subject_id)
);

ALTER TABLE teacher_class_assignments ENABLE ROW LEVEL SECURITY;

-- School admins can manage all assignments
CREATE POLICY "school_admin_manage_assignments"
  ON teacher_class_assignments FOR ALL
  USING (school_id = get_user_school_id() AND get_user_role() IN ('SCHOOL_ADMIN'))
  WITH CHECK (school_id = get_user_school_id() AND get_user_role() IN ('SCHOOL_ADMIN'));

-- Teachers can view their own assignments
CREATE POLICY "teacher_view_own_assignments"
  ON teacher_class_assignments FOR SELECT
  USING (teacher_id = auth.uid() AND school_id = get_user_school_id());

-- Teachers can insert/update marks only for their assigned class+subject
CREATE POLICY "teacher_write_own_marks"
  ON marks FOR INSERT
  WITH CHECK (
    school_id = get_user_school_id()
    AND get_user_role() = 'TEACHER'
    AND EXISTS (
      SELECT 1 FROM teacher_class_assignments tca
      WHERE tca.teacher_id = auth.uid()
        AND tca.class_id = marks.class_id
        AND tca.subject_id = marks.subject_id
        AND tca.is_deleted = false
    )
  );

-- Allow teachers to update marks they created
CREATE POLICY "teacher_update_own_marks"
  ON marks FOR UPDATE
  USING (
    school_id = get_user_school_id()
    AND get_user_role() = 'TEACHER'
    AND EXISTS (
      SELECT 1 FROM teacher_class_assignments tca
      WHERE tca.teacher_id = auth.uid()
        AND tca.class_id = marks.class_id
        AND tca.subject_id = marks.subject_id
        AND tca.is_deleted = false
    )
  );

-- Teachers can only write attendance for their homeroom class
CREATE POLICY "teacher_write_own_attendance"
  ON attendance_records FOR INSERT
  WITH CHECK (
    school_id = get_user_school_id()
    AND get_user_role() = 'TEACHER'
    AND EXISTS (
      SELECT 1 FROM teacher_class_assignments tca
      WHERE tca.teacher_id = auth.uid()
        AND tca.class_id = attendance_records.class_id
        AND tca.is_class_teacher = true
        AND tca.is_deleted = false
    )
  );

-- Allow teachers to update attendance they created
CREATE POLICY "teacher_update_own_attendance"
  ON attendance_records FOR UPDATE
  USING (
    school_id = get_user_school_id()
    AND get_user_role() = 'TEACHER'
    AND EXISTS (
      SELECT 1 FROM teacher_class_assignments tca
      WHERE tca.teacher_id = auth.uid()
        AND tca.class_id = attendance_records.class_id
        AND tca.is_class_teacher = true
        AND tca.is_deleted = false
    )
  );

-- Index for fast lookups of teacher assignments
CREATE INDEX idx_teacher_class_assignments_teacher
  ON teacher_class_assignments(teacher_id, school_id, is_deleted)
  WHERE is_deleted = false;

CREATE INDEX idx_teacher_class_assignments_class
  ON teacher_class_assignments(class_id, school_id, is_deleted)
  WHERE is_deleted = false;

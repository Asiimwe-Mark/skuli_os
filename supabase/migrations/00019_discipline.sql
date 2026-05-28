-- Migration 00019: Student Discipline Log
-- Creates discipline_records table with RLS policies

-- Add incident_type to check constraint
CREATE TYPE IF NOT EXISTS discipline_incident_type AS ENUM (
  'verbal_warning',
  'written_warning',
  'detention',
  'suspension',
  'parent_called',
  'referred_to_head',
  'other'
);

CREATE TABLE IF NOT EXISTS discipline_records (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id       uuid NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  student_id      uuid NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  incident_date   date NOT NULL,
  incident_type   discipline_incident_type NOT NULL,
  description     text NOT NULL,
  action_taken    text,
  recorded_by     uuid REFERENCES users(id),
  parent_notified boolean NOT NULL DEFAULT false,
  parent_notified_at timestamptz,
  created_at      timestamptz NOT NULL DEFAULT now(),
  is_deleted      boolean NOT NULL DEFAULT false
);

-- Enable Row Level Security
ALTER TABLE discipline_records ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist to avoid conflicts
DROP POLICY IF EXISTS "school_manage_discipline" ON discipline_records;
DROP POLICY IF EXISTS "super_admin_discipline" ON discipline_records;

-- School admins and teachers can manage discipline records for their school
CREATE POLICY "school_manage_discipline"
  ON discipline_records FOR ALL
  USING (
    school_id = get_user_school_id()
    AND get_user_role() IN ('SCHOOL_ADMIN', 'TEACHER')
  );

-- Super admins have full access
CREATE POLICY "super_admin_discipline"
  ON discipline_records FOR ALL
  USING (get_user_role() = 'SUPER_ADMIN');

-- Index for fast lookups by student and date
CREATE INDEX IF NOT EXISTS idx_discipline_student
  ON discipline_records(school_id, student_id, incident_date DESC)
  WHERE is_deleted = false;

-- Comment on table
COMMENT ON TABLE discipline_records IS 'Stores student disciplinary incidents and actions taken';

-- Migration: Alumni table

CREATE TABLE IF NOT EXISTS alumni (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    school_id       uuid NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
    student_id      uuid REFERENCES students(id) ON DELETE SET NULL,
    first_name      text NOT NULL,
    last_name       text NOT NULL,
    admission_number text,
    graduation_year integer NOT NULL,
    last_class      text,
    current_school  text,
    phone           text,
    email           text,
    profession      text,
    notes           text,
    created_at      timestamptz NOT NULL DEFAULT now(),
    is_deleted      boolean NOT NULL DEFAULT false
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_alumni_school ON alumni(school_id) WHERE is_deleted = false;
CREATE INDEX IF NOT EXISTS idx_alumni_year ON alumni(school_id, graduation_year);

-- RLS
ALTER TABLE alumni ENABLE ROW LEVEL SECURITY;

CREATE POLICY "alumni_school_access" ON alumni
    FOR ALL USING (
        school_id IN (
            SELECT school_id FROM users WHERE id = auth.uid()
        )
        OR EXISTS (
            SELECT 1 FROM users WHERE id = auth.uid() AND role = 'SUPER_ADMIN'
        )
    );

-- Updated at trigger
CREATE TRIGGER set_alumni_updated_at
    BEFORE UPDATE ON alumni
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Migration: SMS templates table

CREATE TABLE IF NOT EXISTS sms_templates (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    school_id       uuid NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
    name            text NOT NULL,
    body            text NOT NULL,
    variables       text[] DEFAULT '{}',
    is_default      boolean NOT NULL DEFAULT false,
    created_at      timestamptz NOT NULL DEFAULT now(),
    updated_at      timestamptz NOT NULL DEFAULT now(),
    is_deleted      boolean NOT NULL DEFAULT false
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_sms_templates_school ON sms_templates(school_id) WHERE is_deleted = false;

-- RLS
ALTER TABLE sms_templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "sms_templates_school_access" ON sms_templates
    FOR ALL USING (
        school_id IN (
            SELECT school_id FROM users WHERE id = auth.uid()
        )
        OR EXISTS (
            SELECT 1 FROM users WHERE id = auth.uid() AND role = 'SUPER_ADMIN'
        )
    );

-- Updated at trigger
CREATE TRIGGER set_sms_templates_updated_at
    BEFORE UPDATE ON sms_templates
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Insert default templates for existing schools
INSERT INTO sms_templates (school_id, name, body, variables, is_default)
SELECT
    s.id,
    t.name,
    t.body,
    t.variables::text[],
    true
FROM schools s
CROSS JOIN (
    VALUES
        ('Fee Reminder', 'Dear {parent_name}, this is a reminder that {student_name}''s fee balance is {balance}. Please make payment before {due_date}.', ARRAY['parent_name', 'student_name', 'balance', 'due_date']),
        ('Payment Receipt', 'Dear {parent_name}, we have received your payment of {amount} for {student_name}. Receipt No: {receipt_number}. Thank you.', ARRAY['parent_name', 'amount', 'student_name', 'receipt_number']),
        ('Exam Results Ready', 'Dear {parent_name}, {student_name}''s exam results for {term} are now available. Average: {average}%. Please check the portal.', ARRAY['parent_name', 'student_name', 'term', 'average']),
        ('Absence Alert', 'Dear {parent_name}, {student_name} was absent from school today ({date}). Please contact the school if this is an error.', ARRAY['parent_name', 'student_name', 'date']),
        ('School Closure', 'Dear parents, {school_name} will be closed on {date} due to {reason}. Normal operations resume on {resume_date}.', ARRAY['school_name', 'date', 'reason', 'resume_date']),
        ('Event Reminder', 'Reminder: {event_name} at {school_name} on {date} at {time}. We look forward to seeing you.', ARRAY['event_name', 'school_name', 'date', 'time']),
        ('Term Opening', 'Dear {parent_name}, {school_name} opens for {term} on {date}. Please ensure {student_name} reports by {time} with all requirements.', ARRAY['parent_name', 'school_name', 'term', 'date', 'student_name', 'time'])
) AS t(name, body, variables)
WHERE NOT EXISTS (
    SELECT 1 FROM sms_templates WHERE school_id = s.id AND is_default = true
);

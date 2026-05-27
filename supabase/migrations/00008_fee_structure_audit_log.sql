CREATE TABLE fee_structure_audit_log (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    school_id       uuid NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
    fee_structure_id uuid NOT NULL REFERENCES fee_structures(id) ON DELETE CASCADE,
    changed_by      uuid REFERENCES users(id),
    action          text NOT NULL CHECK (action IN ('created', 'updated', 'deleted')),
    old_value       jsonb,
    new_value       jsonb,
    created_at      timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE fee_structure_audit_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "school_members_read_fee_audit"
    ON fee_structure_audit_log FOR SELECT
    USING (school_id = get_user_school_id());

CREATE POLICY "system_insert_fee_audit"
    ON fee_structure_audit_log FOR INSERT
    WITH CHECK (school_id = get_user_school_id());

CREATE POLICY "super_admin_fee_audit"
    ON fee_structure_audit_log FOR ALL
    USING (get_user_role() = 'SUPER_ADMIN');

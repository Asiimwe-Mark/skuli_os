-- =============================================================================
-- Multi-School Group (Chain Admin)
-- Migration 00026
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. school_groups
-- ---------------------------------------------------------------------------
CREATE TABLE school_groups (
    id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    name        text NOT NULL,
    code        text UNIQUE NOT NULL,
    created_at  timestamptz NOT NULL DEFAULT now(),
    is_deleted  boolean NOT NULL DEFAULT false
);

-- ---------------------------------------------------------------------------
-- 2. Link schools to groups
-- ---------------------------------------------------------------------------
ALTER TABLE schools ADD COLUMN group_id uuid REFERENCES school_groups(id);

-- ---------------------------------------------------------------------------
-- 3. group_admins
-- ---------------------------------------------------------------------------
CREATE TABLE group_admins (
    id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    group_id    uuid NOT NULL REFERENCES school_groups(id) ON DELETE CASCADE,
    user_id     uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at  timestamptz NOT NULL DEFAULT now(),
    UNIQUE(group_id, user_id)
);

-- ---------------------------------------------------------------------------
-- 4. Add GROUP_ADMIN role
-- ---------------------------------------------------------------------------
ALTER TYPE user_role ADD VALUE IF NOT EXISTS 'GROUP_ADMIN';

-- ---------------------------------------------------------------------------
-- 5. Enable RLS
-- ---------------------------------------------------------------------------
ALTER TABLE school_groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE group_admins ENABLE ROW LEVEL SECURITY;

-- ---------------------------------------------------------------------------
-- 6. Helper function: school IDs for current user's group
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION get_user_group_school_ids()
RETURNS setof uuid
LANGUAGE sql STABLE SECURITY DEFINER AS $$
    SELECT s.id FROM schools s
    JOIN group_admins ga ON ga.group_id = s.group_id
    WHERE ga.user_id = auth.uid() AND s.is_deleted = false;
$$;

-- ---------------------------------------------------------------------------
-- 7. RLS Policies: school_groups
-- ---------------------------------------------------------------------------

CREATE POLICY "super_admin_all_school_groups"
    ON school_groups FOR ALL
    USING (get_user_role() = 'SUPER_ADMIN');

CREATE POLICY "group_admin_view_own_group"
    ON school_groups FOR SELECT
    USING (
        id IN (SELECT group_id FROM group_admins WHERE user_id = auth.uid())
    );

CREATE POLICY "group_admin_update_own_group"
    ON school_groups FOR UPDATE
    USING (
        id IN (SELECT group_id FROM group_admins WHERE user_id = auth.uid())
    );

-- ---------------------------------------------------------------------------
-- 8. RLS Policies: group_admins
-- ---------------------------------------------------------------------------

CREATE POLICY "super_admin_all_group_admins"
    ON group_admins FOR ALL
    USING (get_user_role() = 'SUPER_ADMIN');

CREATE POLICY "group_admin_manage_group_admins"
    ON group_admins FOR ALL
    USING (
        group_id IN (SELECT group_id FROM group_admins WHERE user_id = auth.uid())
    );

-- ---------------------------------------------------------------------------
-- 9. RLS Policies: GROUP_ADMIN read access to operational tables
-- ---------------------------------------------------------------------------

CREATE POLICY "group_admin_read_students" ON students FOR SELECT
    USING (
        get_user_role() = 'GROUP_ADMIN'
        AND school_id IN (SELECT get_user_group_school_ids())
    );

CREATE POLICY "group_admin_read_fee_accounts" ON fee_accounts FOR SELECT
    USING (
        get_user_role() = 'GROUP_ADMIN'
        AND school_id IN (SELECT get_user_group_school_ids())
    );

CREATE POLICY "group_admin_read_fee_payments" ON fee_payments FOR SELECT
    USING (
        get_user_role() = 'GROUP_ADMIN'
        AND school_id IN (SELECT get_user_group_school_ids())
    );

CREATE POLICY "group_admin_read_attendance" ON attendance_records FOR SELECT
    USING (
        get_user_role() = 'GROUP_ADMIN'
        AND school_id IN (SELECT get_user_group_school_ids())
    );

CREATE POLICY "group_admin_read_marks" ON marks FOR SELECT
    USING (
        get_user_role() = 'GROUP_ADMIN'
        AND school_id IN (SELECT get_user_group_school_ids())
    );

CREATE POLICY "group_admin_read_report_cards" ON report_cards FOR SELECT
    USING (
        get_user_role() = 'GROUP_ADMIN'
        AND school_id IN (SELECT get_user_group_school_ids())
    );

CREATE POLICY "group_admin_read_classes" ON classes FOR SELECT
    USING (
        get_user_role() = 'GROUP_ADMIN'
        AND school_id IN (SELECT get_user_group_school_ids())
    );

CREATE POLICY "group_admin_read_terms" ON terms FOR SELECT
    USING (
        get_user_role() = 'GROUP_ADMIN'
        AND school_id IN (SELECT get_user_group_school_ids())
    );

CREATE POLICY "group_admin_read_academic_years" ON academic_years FOR SELECT
    USING (
        get_user_role() = 'GROUP_ADMIN'
        AND school_id IN (SELECT get_user_group_school_ids())
    );

CREATE POLICY "group_admin_read_staff" ON staff FOR SELECT
    USING (
        get_user_role() = 'GROUP_ADMIN'
        AND school_id IN (SELECT get_user_group_school_ids())
    );

CREATE POLICY "group_admin_read_subjects" ON subjects FOR SELECT
    USING (
        get_user_role() = 'GROUP_ADMIN'
        AND school_id IN (SELECT get_user_group_school_ids())
    );

CREATE POLICY "group_admin_read_sms_logs" ON sms_logs FOR SELECT
    USING (
        get_user_role() = 'GROUP_ADMIN'
        AND school_id IN (SELECT get_user_group_school_ids())
    );

-- ---------------------------------------------------------------------------
-- 10. RLS Policies: GROUP_ADMIN write access to schools
-- ---------------------------------------------------------------------------

CREATE POLICY "group_admin_insert_schools" ON schools FOR INSERT
    WITH CHECK (
        get_user_role() = 'GROUP_ADMIN'
        AND group_id IN (SELECT group_id FROM group_admins WHERE user_id = auth.uid())
    );

CREATE POLICY "group_admin_update_group_schools" ON schools FOR UPDATE
    USING (
        get_user_role() = 'GROUP_ADMIN'
        AND id IN (SELECT get_user_group_school_ids())
    );

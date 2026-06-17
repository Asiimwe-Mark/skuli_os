-- =============================================================================
-- SKULI SaaS: RLS Policies — Admin / Library / Discipline / Calendar /
--                                       Timetable / Marketplace / Referrals
-- Migration 0017
--
-- Tables in this file are managed by school admins or are platform-level.
-- All policies use is_in_school() / is_school_admin() helpers.
-- ---------------------------------------------------------------------------

-- ---------------------------------------------------------------------------
-- assets / asset_maintenance
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS school_manage_assets           ON assets;
DROP POLICY IF EXISTS super_admin_all_assets         ON assets;
DROP POLICY IF EXISTS school_manage_asset_maintenance ON asset_maintenance;
DROP POLICY IF EXISTS super_admin_all_asset_maintenance ON asset_maintenance;

CREATE POLICY school_manage_assets ON assets FOR ALL
    USING (school_id = get_user_school_id());

CREATE POLICY super_admin_all_assets ON assets FOR ALL
    USING (get_user_role() = 'SUPER_ADMIN');

CREATE POLICY school_manage_asset_maintenance ON asset_maintenance FOR ALL
    USING (school_id = get_user_school_id());

CREATE POLICY super_admin_all_asset_maintenance ON asset_maintenance FOR ALL
    USING (get_user_role() = 'SUPER_ADMIN');

-- ---------------------------------------------------------------------------
-- library_books / library_issues
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS school_manage_library_books    ON library_books;
DROP POLICY IF EXISTS super_admin_all_library_books  ON library_books;
DROP POLICY IF EXISTS school_manage_library_issues   ON library_issues;
DROP POLICY IF EXISTS super_admin_all_library_issues ON library_issues;

CREATE POLICY school_manage_library_books ON library_books FOR ALL
    USING (school_id = get_user_school_id());

CREATE POLICY super_admin_all_library_books ON library_books FOR ALL
    USING (get_user_role() = 'SUPER_ADMIN');

CREATE POLICY school_manage_library_issues ON library_issues FOR ALL
    USING (school_id = get_user_school_id());

CREATE POLICY super_admin_all_library_issues ON library_issues FOR ALL
    USING (get_user_role() = 'SUPER_ADMIN');

-- ---------------------------------------------------------------------------
-- discipline_records
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS school_manage_discipline ON discipline_records;
DROP POLICY IF EXISTS super_admin_discipline   ON discipline_records;

CREATE POLICY school_manage_discipline ON discipline_records FOR ALL
    USING (school_id = get_user_school_id() AND get_user_role() IN ('SCHOOL_ADMIN', 'TEACHER'));

CREATE POLICY super_admin_discipline ON discipline_records FOR ALL
    USING (get_user_role() = 'SUPER_ADMIN');

-- ---------------------------------------------------------------------------
-- calendar_events
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS school_admin_manage_calendar  ON calendar_events;
DROP POLICY IF EXISTS teacher_manage_class_calendar ON calendar_events;
DROP POLICY IF EXISTS portal_view_public_calendar   ON calendar_events;

CREATE POLICY school_admin_manage_calendar ON calendar_events FOR ALL
    USING (school_id = get_user_school_id() AND get_user_role() IN ('SCHOOL_ADMIN', 'BURSAR'));

CREATE POLICY teacher_manage_class_calendar ON calendar_events FOR ALL
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

CREATE POLICY portal_view_public_calendar ON calendar_events FOR SELECT
    USING (
        is_public = true
        AND school_id IN (
            SELECT s.school_id FROM students s
            JOIN parent_students ps ON ps.student_id = s.id
            WHERE ps.parent_id = auth.uid() AND s.is_deleted = false
        )
    );

-- ---------------------------------------------------------------------------
-- timetable_periods / timetable_slots
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS school_admin_manage_periods ON timetable_periods;
DROP POLICY IF EXISTS school_admin_manage_slots   ON timetable_slots;
DROP POLICY IF EXISTS teacher_view_slots          ON timetable_slots;

CREATE POLICY school_admin_manage_periods ON timetable_periods FOR ALL
    USING (school_id = get_user_school_id());

CREATE POLICY school_admin_manage_slots ON timetable_slots FOR ALL
    USING (school_id = get_user_school_id());

CREATE POLICY teacher_view_slots ON timetable_slots FOR SELECT
    USING (
        school_id = get_user_school_id()
        AND EXISTS (
            SELECT 1 FROM teacher_class_assignments tca
            WHERE tca.teacher_id = auth.uid()
              AND tca.class_id = timetable_slots.class_id
              AND tca.is_deleted = false
        )
    );

-- ---------------------------------------------------------------------------
-- teacher_class_assignments
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS school_admin_manage_assignments    ON teacher_class_assignments;
DROP POLICY IF EXISTS teacher_view_own_assignments        ON teacher_class_assignments;

CREATE POLICY school_admin_manage_assignments ON teacher_class_assignments FOR ALL
    USING (school_id = get_user_school_id() AND get_user_role() = 'SCHOOL_ADMIN')
    WITH CHECK (school_id = get_user_school_id() AND get_user_role() = 'SCHOOL_ADMIN');

CREATE POLICY teacher_view_own_assignments ON teacher_class_assignments FOR SELECT
    USING (teacher_id = auth.uid() AND school_id = get_user_school_id());

-- ---------------------------------------------------------------------------
-- expense_categories / expenses
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS super_admin_all_expense_categories  ON expense_categories;
DROP POLICY IF EXISTS school_manage_expense_categories    ON expense_categories;
DROP POLICY IF EXISTS super_admin_all_expenses            ON expenses;
DROP POLICY IF EXISTS school_manage_expenses              ON expenses;

CREATE POLICY super_admin_all_expense_categories ON expense_categories FOR ALL
    USING (get_user_role() = 'SUPER_ADMIN');

CREATE POLICY school_manage_expense_categories ON expense_categories FOR ALL
    USING (school_id = get_user_school_id());

CREATE POLICY super_admin_all_expenses ON expenses FOR ALL
    USING (get_user_role() = 'SUPER_ADMIN');

CREATE POLICY school_manage_expenses ON expenses FOR ALL
    USING (school_id = get_user_school_id() AND get_user_role() IN ('SCHOOL_ADMIN', 'BURSAR'));

-- ---------------------------------------------------------------------------
-- sms_templates
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS sms_templates_school_access ON sms_templates;
CREATE POLICY sms_templates_school_access ON sms_templates FOR ALL
    USING (
        school_id = get_user_school_id()
        OR get_user_role() = 'SUPER_ADMIN'
    );

-- ---------------------------------------------------------------------------
-- concierge_leads — super admin only
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS super_admin_all_leads ON concierge_leads;
CREATE POLICY super_admin_all_leads ON concierge_leads FOR ALL
    USING (get_user_role() = 'SUPER_ADMIN');

-- ---------------------------------------------------------------------------
-- emis_report_logs
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS school_admin_emis_logs ON emis_report_logs;
CREATE POLICY school_admin_emis_logs ON emis_report_logs FOR ALL
    USING (
        school_id = get_user_school_id()
        OR get_user_role() = 'SUPER_ADMIN'
    );

-- ---------------------------------------------------------------------------
-- school_groups / group_admins + GROUP_ADMIN read policies on operational
-- tables
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS super_admin_all_school_groups  ON school_groups;
DROP POLICY IF EXISTS group_admin_view_own_group     ON school_groups;
DROP POLICY IF EXISTS group_admin_update_own_group   ON school_groups;
DROP POLICY IF EXISTS super_admin_all_group_admins   ON group_admins;
DROP POLICY IF EXISTS group_admin_manage_group_admins ON group_admins;

CREATE POLICY super_admin_all_school_groups ON school_groups FOR ALL
    USING (get_user_role() = 'SUPER_ADMIN');

CREATE POLICY group_admin_view_own_group ON school_groups FOR SELECT
    USING (id IN (SELECT group_id FROM group_admins WHERE user_id = auth.uid()));

CREATE POLICY group_admin_update_own_group ON school_groups FOR UPDATE
    USING (id IN (SELECT group_id FROM group_admins WHERE user_id = auth.uid()));

CREATE POLICY super_admin_all_group_admins ON group_admins FOR ALL
    USING (get_user_role() = 'SUPER_ADMIN');

CREATE POLICY group_admin_manage_group_admins ON group_admins FOR ALL
    USING (group_id IN (SELECT group_id FROM group_admins WHERE user_id = auth.uid()));

-- GROUP_ADMIN read access on the operational tables
CREATE POLICY group_admin_read_students       ON students        FOR SELECT USING (get_user_role() = 'GROUP_ADMIN' AND school_id IN (SELECT get_user_group_school_ids()));
CREATE POLICY group_admin_read_fee_accounts   ON fee_accounts    FOR SELECT USING (get_user_role() = 'GROUP_ADMIN' AND school_id IN (SELECT get_user_group_school_ids()));
CREATE POLICY group_admin_read_fee_payments   ON fee_payments    FOR SELECT USING (get_user_role() = 'GROUP_ADMIN' AND school_id IN (SELECT get_user_group_school_ids()));
CREATE POLICY group_admin_read_attendance     ON attendance_records FOR SELECT USING (get_user_role() = 'GROUP_ADMIN' AND school_id IN (SELECT get_user_group_school_ids()));
CREATE POLICY group_admin_read_marks          ON marks           FOR SELECT USING (get_user_role() = 'GROUP_ADMIN' AND school_id IN (SELECT get_user_group_school_ids()));
CREATE POLICY group_admin_read_report_cards   ON report_cards    FOR SELECT USING (get_user_role() = 'GROUP_ADMIN' AND school_id IN (SELECT get_user_group_school_ids()));
CREATE POLICY group_admin_read_classes        ON classes         FOR SELECT USING (get_user_role() = 'GROUP_ADMIN' AND school_id IN (SELECT get_user_group_school_ids()));
CREATE POLICY group_admin_read_terms          ON terms           FOR SELECT USING (get_user_role() = 'GROUP_ADMIN' AND school_id IN (SELECT get_user_group_school_ids()));
CREATE POLICY group_admin_read_academic_years ON academic_years  FOR SELECT USING (get_user_role() = 'GROUP_ADMIN' AND school_id IN (SELECT get_user_group_school_ids()));
CREATE POLICY group_admin_read_staff          ON staff           FOR SELECT USING (get_user_role() = 'GROUP_ADMIN' AND school_id IN (SELECT get_user_group_school_ids()));
CREATE POLICY group_admin_read_subjects       ON subjects        FOR SELECT USING (get_user_role() = 'GROUP_ADMIN' AND school_id IN (SELECT get_user_group_school_ids()));
CREATE POLICY group_admin_read_sms_logs       ON sms_logs        FOR SELECT USING (get_user_role() = 'GROUP_ADMIN' AND school_id IN (SELECT get_user_group_school_ids()));

-- ---------------------------------------------------------------------------
-- referral_codes / referrals / billing_credits
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS school_admin_own_referral_code ON referral_codes;
DROP POLICY IF EXISTS super_admin_all_referral_codes ON referral_codes;
DROP POLICY IF EXISTS school_admin_view_referrals    ON referrals;
DROP POLICY IF EXISTS super_admin_all_referrals      ON referrals;
DROP POLICY IF EXISTS school_admin_view_credits      ON billing_credits;
DROP POLICY IF EXISTS super_admin_all_credits        ON billing_credits;

CREATE POLICY school_admin_own_referral_code ON referral_codes FOR ALL
    USING (owner_school_id = get_user_school_id());

CREATE POLICY super_admin_all_referral_codes ON referral_codes FOR ALL
    USING (get_user_role() = 'SUPER_ADMIN');

CREATE POLICY school_admin_view_referrals ON referrals FOR SELECT
    USING (referral_code_id IN (
        SELECT id FROM referral_codes WHERE owner_school_id = get_user_school_id()
    ));

CREATE POLICY super_admin_all_referrals ON referrals FOR ALL
    USING (get_user_role() = 'SUPER_ADMIN');

CREATE POLICY school_admin_view_credits ON billing_credits FOR SELECT
    USING (school_id = get_user_school_id());

CREATE POLICY super_admin_all_credits ON billing_credits FOR ALL
    USING (get_user_role() = 'SUPER_ADMIN');

-- ---------------------------------------------------------------------------
-- alumni
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS school_manage_alumni       ON alumni;
DROP POLICY IF EXISTS super_admin_all_alumni     ON alumni;

CREATE POLICY school_manage_alumni ON alumni FOR ALL
    USING (is_in_school(school_id));

CREATE POLICY super_admin_all_alumni ON alumni FOR ALL
    USING (get_user_role() = 'SUPER_ADMIN');

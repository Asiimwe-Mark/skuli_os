-- =============================================================================
-- SKULI SaaS: Row Level Security
-- Migration 00004
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Helper functions
-- ---------------------------------------------------------------------------

-- Returns the school_id for the current authenticated user
CREATE OR REPLACE FUNCTION get_user_school_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
    SELECT school_id FROM users WHERE id = auth.uid();
$$;

-- Returns the role for the current authenticated user
CREATE OR REPLACE FUNCTION get_user_role()
RETURNS user_role
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
    SELECT role FROM users WHERE id = auth.uid();
$$;

-- ---------------------------------------------------------------------------
-- Enable RLS on ALL tables
-- ---------------------------------------------------------------------------
ALTER TABLE schools ENABLE ROW LEVEL SECURITY;
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE academic_years ENABLE ROW LEVEL SECURITY;
ALTER TABLE terms ENABLE ROW LEVEL SECURITY;
ALTER TABLE classes ENABLE ROW LEVEL SECURITY;
ALTER TABLE subjects ENABLE ROW LEVEL SECURITY;
ALTER TABLE class_subjects ENABLE ROW LEVEL SECURITY;
ALTER TABLE students ENABLE ROW LEVEL SECURITY;
ALTER TABLE class_enrollments ENABLE ROW LEVEL SECURITY;
ALTER TABLE fee_structures ENABLE ROW LEVEL SECURITY;
ALTER TABLE fee_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE fee_payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE marks ENABLE ROW LEVEL SECURITY;
ALTER TABLE report_cards ENABLE ROW LEVEL SECURITY;
ALTER TABLE attendance_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE announcements ENABLE ROW LEVEL SECURITY;
ALTER TABLE sms_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE staff ENABLE ROW LEVEL SECURITY;
ALTER TABLE payroll_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE subscription_invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;

-- ===========================================================================
-- SCHOOLS
-- ===========================================================================

-- SUPER_ADMIN sees all schools
CREATE POLICY "super_admin_all_schools"
    ON schools FOR ALL
    USING (get_user_role() = 'SUPER_ADMIN');

-- School staff see their own school
CREATE POLICY "school_members_own_school"
    ON schools FOR SELECT
    USING (
        id = get_user_school_id()
        AND get_user_role() IN ('SCHOOL_ADMIN', 'BURSAR', 'TEACHER')
    );

-- School admins can update their own school
CREATE POLICY "school_admin_update_own_school"
    ON schools FOR UPDATE
    USING (
        id = get_user_school_id()
        AND get_user_role() = 'SCHOOL_ADMIN'
    );

-- ===========================================================================
-- USERS
-- ===========================================================================

-- SUPER_ADMIN sees all users
CREATE POLICY "super_admin_all_users"
    ON users FOR ALL
    USING (get_user_role() = 'SUPER_ADMIN');

-- School members can see users in their school
CREATE POLICY "school_members_see_school_users"
    ON users FOR SELECT
    USING (
        school_id = get_user_school_id()
        AND get_user_role() IN ('SCHOOL_ADMIN', 'BURSAR', 'TEACHER')
    );

-- Users can see their own record
CREATE POLICY "users_see_own_record"
    ON users FOR SELECT
    USING (id = auth.uid());

-- School admins can manage users in their school
CREATE POLICY "school_admin_manage_users"
    ON users FOR ALL
    USING (
        school_id = get_user_school_id()
        AND get_user_role() = 'SCHOOL_ADMIN'
    );

-- ===========================================================================
-- ACADEMIC YEARS
-- ===========================================================================

CREATE POLICY "super_admin_all_academic_years"
    ON academic_years FOR ALL
    USING (get_user_role() = 'SUPER_ADMIN');

CREATE POLICY "school_members_academic_years"
    ON academic_years FOR ALL
    USING (
        school_id = get_user_school_id()
        AND get_user_role() IN ('SCHOOL_ADMIN', 'BURSAR', 'TEACHER')
    );

-- ===========================================================================
-- TERMS
-- ===========================================================================

CREATE POLICY "super_admin_all_terms"
    ON terms FOR ALL
    USING (get_user_role() = 'SUPER_ADMIN');

CREATE POLICY "school_members_terms"
    ON terms FOR ALL
    USING (
        school_id = get_user_school_id()
        AND get_user_role() IN ('SCHOOL_ADMIN', 'BURSAR', 'TEACHER')
    );

-- ===========================================================================
-- CLASSES
-- ===========================================================================

CREATE POLICY "super_admin_all_classes"
    ON classes FOR ALL
    USING (get_user_role() = 'SUPER_ADMIN');

CREATE POLICY "school_admin_bursar_classes"
    ON classes FOR ALL
    USING (
        school_id = get_user_school_id()
        AND get_user_role() IN ('SCHOOL_ADMIN', 'BURSAR')
    );

-- Teachers see classes where they are class_teacher or assigned via class_subjects
CREATE POLICY "teacher_assigned_classes"
    ON classes FOR SELECT
    USING (
        school_id = get_user_school_id()
        AND get_user_role() = 'TEACHER'
        AND (
            class_teacher_id = auth.uid()
            OR id IN (
                SELECT class_id FROM class_subjects
                WHERE teacher_id = auth.uid() AND is_deleted = false
            )
        )
    );

-- ===========================================================================
-- SUBJECTS
-- ===========================================================================

CREATE POLICY "super_admin_all_subjects"
    ON subjects FOR ALL
    USING (get_user_role() = 'SUPER_ADMIN');

CREATE POLICY "school_members_subjects"
    ON subjects FOR ALL
    USING (
        school_id = get_user_school_id()
        AND get_user_role() IN ('SCHOOL_ADMIN', 'BURSAR', 'TEACHER')
    );

-- ===========================================================================
-- CLASS SUBJECTS
-- ===========================================================================

CREATE POLICY "super_admin_all_class_subjects"
    ON class_subjects FOR ALL
    USING (get_user_role() = 'SUPER_ADMIN');

CREATE POLICY "school_admin_manage_class_subjects"
    ON class_subjects FOR ALL
    USING (
        EXISTS (
            SELECT 1 FROM classes c
            WHERE c.id = class_id
            AND c.school_id = get_user_school_id()
        )
        AND get_user_role() IN ('SCHOOL_ADMIN', 'BURSAR')
    );

-- Teachers see their assigned class_subjects
CREATE POLICY "teacher_see_own_class_subjects"
    ON class_subjects FOR SELECT
    USING (
        teacher_id = auth.uid()
        AND EXISTS (
            SELECT 1 FROM classes c
            WHERE c.id = class_id
            AND c.school_id = get_user_school_id()
        )
    );

-- ===========================================================================
-- STUDENTS
-- ===========================================================================

CREATE POLICY "super_admin_all_students"
    ON students FOR ALL
    USING (get_user_role() = 'SUPER_ADMIN');

-- School admins and bursars see all students in their school
CREATE POLICY "school_admin_bursar_all_students"
    ON students FOR ALL
    USING (
        school_id = get_user_school_id()
        AND get_user_role() IN ('SCHOOL_ADMIN', 'BURSAR')
    );

-- Teachers see students in their assigned classes
CREATE POLICY "teacher_assigned_students"
    ON students FOR SELECT
    USING (
        school_id = get_user_school_id()
        AND get_user_role() = 'TEACHER'
        AND (
            current_class_id IN (
                SELECT id FROM classes WHERE class_teacher_id = auth.uid() AND is_deleted = false
            )
            OR current_class_id IN (
                SELECT class_id FROM class_subjects WHERE teacher_id = auth.uid() AND is_deleted = false
            )
        )
    );

-- Parents see only their own children (matched by phone)
CREATE POLICY "parent_own_children"
    ON students FOR SELECT
    USING (
        school_id = get_user_school_id()
        AND get_user_role() = 'PARENT'
        AND parent_phone = (SELECT phone FROM users WHERE id = auth.uid())
    );

-- ===========================================================================
-- CLASS ENROLLMENTS
-- ===========================================================================

CREATE POLICY "super_admin_all_class_enrollments"
    ON class_enrollments FOR ALL
    USING (get_user_role() = 'SUPER_ADMIN');

CREATE POLICY "school_admin_manage_enrollments"
    ON class_enrollments FOR ALL
    USING (
        EXISTS (
            SELECT 1 FROM students s
            WHERE s.id = student_id
            AND s.school_id = get_user_school_id()
        )
        AND get_user_role() IN ('SCHOOL_ADMIN', 'BURSAR')
    );

CREATE POLICY "teacher_see_enrollments"
    ON class_enrollments FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM students s
            WHERE s.id = student_id
            AND s.school_id = get_user_school_id()
        )
        AND get_user_role() = 'TEACHER'
        AND (
            class_id IN (
                SELECT id FROM classes WHERE class_teacher_id = auth.uid() AND is_deleted = false
            )
            OR class_id IN (
                SELECT class_id FROM class_subjects WHERE teacher_id = auth.uid() AND is_deleted = false
            )
        )
    );

CREATE POLICY "parent_see_enrollments"
    ON class_enrollments FOR SELECT
    USING (
        student_id IN (
            SELECT id FROM students
            WHERE parent_phone = (SELECT phone FROM users WHERE id = auth.uid())
            AND school_id = get_user_school_id()
            AND is_deleted = false
        )
        AND get_user_role() = 'PARENT'
    );

-- ===========================================================================
-- FEE STRUCTURES
-- ===========================================================================

CREATE POLICY "super_admin_all_fee_structures"
    ON fee_structures FOR ALL
    USING (get_user_role() = 'SUPER_ADMIN');

CREATE POLICY "school_members_fee_structures"
    ON fee_structures FOR ALL
    USING (
        school_id = get_user_school_id()
        AND get_user_role() IN ('SCHOOL_ADMIN', 'BURSAR')
    );

-- Teachers can read fee structures
CREATE POLICY "teacher_read_fee_structures"
    ON fee_structures FOR SELECT
    USING (
        school_id = get_user_school_id()
        AND get_user_role() = 'TEACHER'
    );

-- ===========================================================================
-- FEE ACCOUNTS
-- ===========================================================================

CREATE POLICY "super_admin_all_fee_accounts"
    ON fee_accounts FOR ALL
    USING (get_user_role() = 'SUPER_ADMIN');

-- Bursar has full fee access
CREATE POLICY "school_admin_bursar_fee_accounts"
    ON fee_accounts FOR ALL
    USING (
        school_id = get_user_school_id()
        AND get_user_role() IN ('SCHOOL_ADMIN', 'BURSAR')
    );

-- Teachers: read-only for their assigned students
CREATE POLICY "teacher_read_fee_accounts"
    ON fee_accounts FOR SELECT
    USING (
        school_id = get_user_school_id()
        AND get_user_role() = 'TEACHER'
        AND student_id IN (
            SELECT id FROM students
            WHERE current_class_id IN (
                SELECT id FROM classes WHERE class_teacher_id = auth.uid() AND is_deleted = false
            )
            OR current_class_id IN (
                SELECT class_id FROM class_subjects WHERE teacher_id = auth.uid() AND is_deleted = false
            )
            AND is_deleted = false
        )
    );

-- Parents see fee accounts for their own children
CREATE POLICY "parent_own_fee_accounts"
    ON fee_accounts FOR SELECT
    USING (
        school_id = get_user_school_id()
        AND get_user_role() = 'PARENT'
        AND student_id IN (
            SELECT id FROM students
            WHERE parent_phone = (SELECT phone FROM users WHERE id = auth.uid())
            AND school_id = get_user_school_id()
            AND is_deleted = false
        )
    );

-- ===========================================================================
-- FEE PAYMENTS
-- ===========================================================================

CREATE POLICY "super_admin_all_fee_payments"
    ON fee_payments FOR ALL
    USING (get_user_role() = 'SUPER_ADMIN');

-- Bursar has full fee access
CREATE POLICY "school_admin_bursar_fee_payments"
    ON fee_payments FOR ALL
    USING (
        school_id = get_user_school_id()
        AND get_user_role() IN ('SCHOOL_ADMIN', 'BURSAR')
    );

-- Parents see payments for their own children
CREATE POLICY "parent_own_fee_payments"
    ON fee_payments FOR SELECT
    USING (
        school_id = get_user_school_id()
        AND get_user_role() = 'PARENT'
        AND student_id IN (
            SELECT id FROM students
            WHERE parent_phone = (SELECT phone FROM users WHERE id = auth.uid())
            AND school_id = get_user_school_id()
            AND is_deleted = false
        )
    );

-- ===========================================================================
-- MARKS
-- ===========================================================================

CREATE POLICY "super_admin_all_marks"
    ON marks FOR ALL
    USING (get_user_role() = 'SUPER_ADMIN');

CREATE POLICY "school_admin_bursar_marks"
    ON marks FOR ALL
    USING (
        school_id = get_user_school_id()
        AND get_user_role() IN ('SCHOOL_ADMIN', 'BURSAR')
    );

-- Teachers manage marks for their assigned subjects/classes
CREATE POLICY "teacher_manage_marks"
    ON marks FOR ALL
    USING (
        school_id = get_user_school_id()
        AND get_user_role() = 'TEACHER'
        AND (
            class_id IN (
                SELECT id FROM classes WHERE class_teacher_id = auth.uid() AND is_deleted = false
            )
            OR (class_id, subject_id) IN (
                SELECT class_id, subject_id FROM class_subjects
                WHERE teacher_id = auth.uid() AND is_deleted = false
            )
        )
    );

-- Parents see marks for their own children
CREATE POLICY "parent_own_marks"
    ON marks FOR SELECT
    USING (
        school_id = get_user_school_id()
        AND get_user_role() = 'PARENT'
        AND student_id IN (
            SELECT id FROM students
            WHERE parent_phone = (SELECT phone FROM users WHERE id = auth.uid())
            AND school_id = get_user_school_id()
            AND is_deleted = false
        )
    );

-- ===========================================================================
-- REPORT CARDS
-- ===========================================================================

CREATE POLICY "super_admin_all_report_cards"
    ON report_cards FOR ALL
    USING (get_user_role() = 'SUPER_ADMIN');

CREATE POLICY "school_admin_bursar_report_cards"
    ON report_cards FOR ALL
    USING (
        school_id = get_user_school_id()
        AND get_user_role() IN ('SCHOOL_ADMIN', 'BURSAR')
    );

-- Teachers manage report cards for their assigned classes
CREATE POLICY "teacher_manage_report_cards"
    ON report_cards FOR ALL
    USING (
        school_id = get_user_school_id()
        AND get_user_role() = 'TEACHER'
        AND student_id IN (
            SELECT id FROM students
            WHERE current_class_id IN (
                SELECT id FROM classes WHERE class_teacher_id = auth.uid() AND is_deleted = false
            )
            AND is_deleted = false
        )
    );

-- Parents see published report cards for their own children
CREATE POLICY "parent_own_report_cards"
    ON report_cards FOR SELECT
    USING (
        school_id = get_user_school_id()
        AND get_user_role() = 'PARENT'
        AND is_published = true
        AND student_id IN (
            SELECT id FROM students
            WHERE parent_phone = (SELECT phone FROM users WHERE id = auth.uid())
            AND school_id = get_user_school_id()
            AND is_deleted = false
        )
    );

-- ===========================================================================
-- ATTENDANCE RECORDS
-- ===========================================================================

CREATE POLICY "super_admin_all_attendance"
    ON attendance_records FOR ALL
    USING (get_user_role() = 'SUPER_ADMIN');

CREATE POLICY "school_admin_bursar_attendance"
    ON attendance_records FOR ALL
    USING (
        school_id = get_user_school_id()
        AND get_user_role() IN ('SCHOOL_ADMIN', 'BURSAR')
    );

-- Teachers manage attendance for their assigned classes
CREATE POLICY "teacher_manage_attendance"
    ON attendance_records FOR ALL
    USING (
        school_id = get_user_school_id()
        AND get_user_role() = 'TEACHER'
        AND (
            class_id IN (
                SELECT id FROM classes WHERE class_teacher_id = auth.uid() AND is_deleted = false
            )
            OR class_id IN (
                SELECT class_id FROM class_subjects WHERE teacher_id = auth.uid() AND is_deleted = false
            )
        )
    );

-- Parents see attendance for their own children
CREATE POLICY "parent_own_attendance"
    ON attendance_records FOR SELECT
    USING (
        school_id = get_user_school_id()
        AND get_user_role() = 'PARENT'
        AND student_id IN (
            SELECT id FROM students
            WHERE parent_phone = (SELECT phone FROM users WHERE id = auth.uid())
            AND school_id = get_user_school_id()
            AND is_deleted = false
        )
    );

-- ===========================================================================
-- ANNOUNCEMENTS
-- ===========================================================================

CREATE POLICY "super_admin_all_announcements"
    ON announcements FOR ALL
    USING (get_user_role() = 'SUPER_ADMIN');

CREATE POLICY "school_admin_manage_announcements"
    ON announcements FOR ALL
    USING (
        school_id = get_user_school_id()
        AND get_user_role() IN ('SCHOOL_ADMIN', 'BURSAR')
    );

-- Teachers see announcements targeted to them
CREATE POLICY "teacher_see_announcements"
    ON announcements FOR SELECT
    USING (
        school_id = get_user_school_id()
        AND get_user_role() = 'TEACHER'
    );

-- Parents see announcements targeted to all or their children's class
CREATE POLICY "parent_see_announcements"
    ON announcements FOR SELECT
    USING (
        school_id = get_user_school_id()
        AND get_user_role() = 'PARENT'
        AND (
            target_audience = 'all'
            OR target_class_ids && (
                SELECT array_agg(s.current_class_id) FROM students s
                WHERE s.parent_phone = (SELECT phone FROM users WHERE id = auth.uid())
                AND s.school_id = get_user_school_id()
                AND s.is_deleted = false
            )
        )
    );

-- ===========================================================================
-- SMS LOGS
-- ===========================================================================

CREATE POLICY "super_admin_all_sms_logs"
    ON sms_logs FOR ALL
    USING (get_user_role() = 'SUPER_ADMIN');

CREATE POLICY "school_admin_bursar_sms_logs"
    ON sms_logs FOR ALL
    USING (
        school_id = get_user_school_id()
        AND get_user_role() IN ('SCHOOL_ADMIN', 'BURSAR')
    );

-- ===========================================================================
-- STAFF
-- ===========================================================================

CREATE POLICY "super_admin_all_staff"
    ON staff FOR ALL
    USING (get_user_role() = 'SUPER_ADMIN');

CREATE POLICY "school_admin_bursar_staff"
    ON staff FOR ALL
    USING (
        school_id = get_user_school_id()
        AND get_user_role() IN ('SCHOOL_ADMIN', 'BURSAR')
    );

-- Staff can see their own record
CREATE POLICY "staff_see_own_record"
    ON staff FOR SELECT
    USING (
        user_id = auth.uid()
        AND school_id = get_user_school_id()
    );

-- ===========================================================================
-- PAYROLL RECORDS
-- ===========================================================================

CREATE POLICY "super_admin_all_payroll"
    ON payroll_records FOR ALL
    USING (get_user_role() = 'SUPER_ADMIN');

CREATE POLICY "school_admin_bursar_payroll"
    ON payroll_records FOR ALL
    USING (
        school_id = get_user_school_id()
        AND get_user_role() IN ('SCHOOL_ADMIN', 'BURSAR')
    );

-- ===========================================================================
-- SUBSCRIPTION INVOICES
-- ===========================================================================

CREATE POLICY "super_admin_all_subscription_invoices"
    ON subscription_invoices FOR ALL
    USING (get_user_role() = 'SUPER_ADMIN');

CREATE POLICY "school_admin_subscription_invoices"
    ON subscription_invoices FOR SELECT
    USING (
        school_id = get_user_school_id()
        AND get_user_role() = 'SCHOOL_ADMIN'
    );

-- ===========================================================================
-- AUDIT LOGS
-- ===========================================================================

CREATE POLICY "super_admin_all_audit_logs"
    ON audit_logs FOR ALL
    USING (get_user_role() = 'SUPER_ADMIN');

CREATE POLICY "school_admin_audit_logs"
    ON audit_logs FOR SELECT
    USING (
        school_id = get_user_school_id()
        AND get_user_role() = 'SCHOOL_ADMIN'
    );

-- System can insert audit logs (used by triggers/functions)
CREATE POLICY "system_insert_audit_logs"
    ON audit_logs FOR INSERT
    WITH CHECK (true);

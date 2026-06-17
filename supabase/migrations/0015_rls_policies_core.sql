-- =============================================================================
-- SKULI SaaS: RLS Policies — Core / Academic / Finance / Grading
-- Migration 0015
--
-- Policies for the tables the user sees in the main school-admin app:
-- schools, users, parent_students, academic_years, terms, classes,
-- subjects, class_subjects, students, class_enrollments,
-- fee_structures, fee_types, fee_accounts, fee_payments,
-- fee_discounts, student_discounts, fee_structure_audit_log,
-- marks, report_cards, subject_comments, grading_scales.
--
-- All policies use the helper functions from 0003 (is_in_school,
-- is_school_admin, get_user_role, get_user_school_id). Where a policy
-- existed multiple times in the source set, the canonical form is
-- the parent_students-based version (per 00065) — phone/email
-- equality is never the source of authority.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- schools
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS super_admin_all_schools          ON schools;
DROP POLICY IF EXISTS school_members_own_school        ON schools;
DROP POLICY IF EXISTS school_admin_update_own_school   ON schools;
DROP POLICY IF EXISTS group_admin_insert_schools       ON schools;
DROP POLICY IF EXISTS group_admin_update_group_schools ON schools;

CREATE POLICY super_admin_all_schools ON schools FOR ALL
    USING (get_user_role() = 'SUPER_ADMIN');

CREATE POLICY school_members_own_school ON schools FOR SELECT
    USING (
        id = get_user_school_id()
        AND get_user_role() IN ('SCHOOL_ADMIN', 'BURSAR', 'TEACHER')
    );

CREATE POLICY school_admin_update_own_school ON schools FOR UPDATE
    USING (
        id = get_user_school_id()
        AND get_user_role() = 'SCHOOL_ADMIN'
    );

CREATE POLICY group_admin_insert_schools ON schools FOR INSERT
    WITH CHECK (
        get_user_role() = 'GROUP_ADMIN'
        AND group_id IN (SELECT group_id FROM group_admins WHERE user_id = auth.uid())
    );

CREATE POLICY group_admin_update_group_schools ON schools FOR UPDATE
    USING (
        get_user_role() = 'GROUP_ADMIN'
        AND id IN (SELECT get_user_group_school_ids())
    );

-- ---------------------------------------------------------------------------
-- users
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS super_admin_all_users        ON users;
DROP POLICY IF EXISTS school_members_see_school_users ON users;
DROP POLICY IF EXISTS users_see_own_record         ON users;
DROP POLICY IF EXISTS school_admin_manage_users    ON users;

CREATE POLICY super_admin_all_users ON users FOR ALL
    USING (get_user_role() = 'SUPER_ADMIN');

CREATE POLICY school_members_see_school_users ON users FOR SELECT
    USING (
        school_id = get_user_school_id()
        AND get_user_role() IN ('SCHOOL_ADMIN', 'BURSAR', 'TEACHER')
    );

CREATE POLICY users_see_own_record ON users FOR SELECT
    USING (id = auth.uid());

CREATE POLICY school_admin_manage_users ON users FOR ALL
    USING (
        school_id = get_user_school_id()
        AND get_user_role() = 'SCHOOL_ADMIN'
    );

-- ---------------------------------------------------------------------------
-- parent_students (per 00066 — explicit policies)
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS parent_students_select              ON parent_students;
DROP POLICY IF EXISTS parent_students_insert              ON parent_students;
DROP POLICY IF EXISTS parent_students_update              ON parent_students;
DROP POLICY IF EXISTS parent_students_school_admin_all    ON parent_students;
DROP POLICY IF EXISTS parent_students_super_admin_all     ON parent_students;

CREATE POLICY parent_students_select ON parent_students FOR SELECT
    USING (parent_id = auth.uid());

CREATE POLICY parent_students_insert ON parent_students FOR INSERT
    WITH CHECK (
        parent_id = auth.uid()
        AND school_id = (SELECT school_id FROM users WHERE id = auth.uid())
    );

CREATE POLICY parent_students_update ON parent_students FOR UPDATE
    USING (parent_id = auth.uid())
    WITH CHECK (
        parent_id = auth.uid()
        AND school_id = (SELECT school_id FROM users WHERE id = auth.uid())
    );

CREATE POLICY parent_students_school_admin_all ON parent_students FOR ALL
    USING (school_id = get_user_school_id() AND is_school_admin())
    WITH CHECK (school_id = get_user_school_id() AND is_school_admin());

CREATE POLICY parent_students_super_admin_all ON parent_students FOR ALL
    USING (get_user_role() = 'SUPER_ADMIN')
    WITH CHECK (get_user_role() = 'SUPER_ADMIN');

-- ---------------------------------------------------------------------------
-- academic_years / terms / subjects
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS super_admin_all_academic_years ON academic_years;
DROP POLICY IF EXISTS school_members_academic_years   ON academic_years;
DROP POLICY IF EXISTS super_admin_all_terms          ON terms;
DROP POLICY IF EXISTS school_members_terms           ON terms;
DROP POLICY IF EXISTS super_admin_all_subjects       ON subjects;
DROP POLICY IF EXISTS school_members_subjects        ON subjects;

CREATE POLICY super_admin_all_academic_years ON academic_years FOR ALL
    USING (get_user_role() = 'SUPER_ADMIN');
CREATE POLICY school_members_academic_years   ON academic_years FOR ALL
    USING (school_id = get_user_school_id() AND is_school_admin());

CREATE POLICY super_admin_all_terms ON terms FOR ALL
    USING (get_user_role() = 'SUPER_ADMIN');
CREATE POLICY school_members_terms  ON terms FOR ALL
    USING (school_id = get_user_school_id() AND is_school_admin());

CREATE POLICY super_admin_all_subjects ON subjects FOR ALL
    USING (get_user_role() = 'SUPER_ADMIN');
CREATE POLICY school_members_subjects  ON subjects FOR ALL
    USING (school_id = get_user_school_id() AND is_school_admin());

-- ---------------------------------------------------------------------------
-- classes
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS super_admin_all_classes    ON classes;
DROP POLICY IF EXISTS school_admin_bursar_classes ON classes;
DROP POLICY IF EXISTS teacher_assigned_classes   ON classes;

CREATE POLICY super_admin_all_classes ON classes FOR ALL
    USING (get_user_role() = 'SUPER_ADMIN');

CREATE POLICY school_admin_bursar_classes ON classes FOR ALL
    USING (school_id = get_user_school_id() AND get_user_role() IN ('SCHOOL_ADMIN', 'BURSAR'));

CREATE POLICY teacher_assigned_classes ON classes FOR SELECT
    USING (
        school_id = get_user_school_id()
        AND get_user_role() = 'TEACHER'
        AND (
            class_teacher_id = auth.uid()
            OR id IN (SELECT class_id FROM class_subjects WHERE teacher_id = auth.uid() AND is_deleted = false)
        )
    );

-- ---------------------------------------------------------------------------
-- class_subjects
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS super_admin_all_class_subjects     ON class_subjects;
DROP POLICY IF EXISTS school_admin_manage_class_subjects ON class_subjects;
DROP POLICY IF EXISTS teacher_see_own_class_subjects     ON class_subjects;

CREATE POLICY super_admin_all_class_subjects ON class_subjects FOR ALL
    USING (get_user_role() = 'SUPER_ADMIN');

CREATE POLICY school_admin_manage_class_subjects ON class_subjects FOR ALL
    USING (
        class_school_id(class_id) = get_user_school_id()
        AND get_user_role() IN ('SCHOOL_ADMIN', 'BURSAR')
    );

CREATE POLICY teacher_see_own_class_subjects ON class_subjects FOR SELECT
    USING (
        teacher_id = auth.uid()
        AND class_school_id(class_id) = get_user_school_id()
    );

-- ---------------------------------------------------------------------------
-- students
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS super_admin_all_students       ON students;
DROP POLICY IF EXISTS school_admin_bursar_all_students ON students;
DROP POLICY IF EXISTS teacher_assigned_students      ON students;
DROP POLICY IF EXISTS parent_own_children            ON students;

CREATE POLICY super_admin_all_students ON students FOR ALL
    USING (get_user_role() = 'SUPER_ADMIN');

CREATE POLICY school_admin_bursar_all_students ON students FOR ALL
    USING (school_id = get_user_school_id() AND get_user_role() IN ('SCHOOL_ADMIN', 'BURSAR'));

CREATE POLICY teacher_assigned_students ON students FOR SELECT
    USING (
        school_id = get_user_school_id()
        AND get_user_role() = 'TEACHER'
        AND (
            current_class_id IN (SELECT id FROM classes WHERE class_teacher_id = auth.uid() AND is_deleted = false)
            OR current_class_id IN (SELECT class_id FROM class_subjects WHERE teacher_id = auth.uid() AND is_deleted = false)
        )
    );

CREATE POLICY parent_own_children ON students FOR SELECT
    USING (
        get_user_role() = 'PARENT'
        AND id IN (SELECT student_id FROM parent_students WHERE parent_id = auth.uid())
    );

-- ---------------------------------------------------------------------------
-- class_enrollments
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS super_admin_all_class_enrollments ON class_enrollments;
DROP POLICY IF EXISTS school_admin_manage_enrollments   ON class_enrollments;
DROP POLICY IF EXISTS teacher_see_enrollments           ON class_enrollments;
DROP POLICY IF EXISTS parent_see_enrollments            ON class_enrollments;

CREATE POLICY super_admin_all_class_enrollments ON class_enrollments FOR ALL
    USING (get_user_role() = 'SUPER_ADMIN');

CREATE POLICY school_admin_manage_enrollments ON class_enrollments FOR ALL
    USING (
        student_id IN (SELECT id FROM students WHERE school_id = get_user_school_id())
        AND get_user_role() IN ('SCHOOL_ADMIN', 'BURSAR')
    );

CREATE POLICY teacher_see_enrollments ON class_enrollments FOR SELECT
    USING (
        student_id IN (SELECT id FROM students WHERE school_id = get_user_school_id())
        AND get_user_role() = 'TEACHER'
        AND (
            class_id IN (SELECT id FROM classes WHERE class_teacher_id = auth.uid() AND is_deleted = false)
            OR class_id IN (SELECT class_id FROM class_subjects WHERE teacher_id = auth.uid() AND is_deleted = false)
        )
    );

CREATE POLICY parent_see_enrollments ON class_enrollments FOR SELECT
    USING (
        student_id IN (SELECT student_id FROM parent_students WHERE parent_id = auth.uid())
        AND get_user_role() = 'PARENT'
    );

-- ---------------------------------------------------------------------------
-- fee_structures / fee_types / fee_accounts / fee_payments
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS super_admin_all_fee_structures   ON fee_structures;
DROP POLICY IF EXISTS school_members_fee_structures    ON fee_structures;
DROP POLICY IF EXISTS teacher_read_fee_structures      ON fee_structures;
DROP POLICY IF EXISTS fee_types_select                ON fee_types;
DROP POLICY IF EXISTS fee_types_write                 ON fee_types;
DROP POLICY IF EXISTS super_admin_all_fee_accounts     ON fee_accounts;
DROP POLICY IF EXISTS school_admin_bursar_fee_accounts ON fee_accounts;
DROP POLICY IF EXISTS teacher_read_fee_accounts       ON fee_accounts;
DROP POLICY IF EXISTS parent_own_fee_accounts          ON fee_accounts;
DROP POLICY IF EXISTS super_admin_all_fee_payments     ON fee_payments;
DROP POLICY IF EXISTS school_admin_bursar_fee_payments ON fee_payments;
DROP POLICY IF EXISTS parent_own_fee_payments          ON fee_payments;

CREATE POLICY super_admin_all_fee_structures ON fee_structures FOR ALL
    USING (get_user_role() = 'SUPER_ADMIN');

CREATE POLICY school_members_fee_structures ON fee_structures FOR ALL
    USING (school_id = get_user_school_id() AND get_user_role() IN ('SCHOOL_ADMIN', 'BURSAR'));

CREATE POLICY teacher_read_fee_structures ON fee_structures FOR SELECT
    USING (school_id = get_user_school_id() AND get_user_role() = 'TEACHER');

CREATE POLICY fee_types_select ON fee_types FOR SELECT
    USING (school_id = get_user_school_id());

CREATE POLICY fee_types_write ON fee_types FOR ALL
    USING (school_id = get_user_school_id())
    WITH CHECK (school_id = get_user_school_id());

CREATE POLICY super_admin_all_fee_accounts ON fee_accounts FOR ALL
    USING (get_user_role() = 'SUPER_ADMIN');

CREATE POLICY school_admin_bursar_fee_accounts ON fee_accounts FOR ALL
    USING (school_id = get_user_school_id() AND get_user_role() IN ('SCHOOL_ADMIN', 'BURSAR'));

CREATE POLICY teacher_read_fee_accounts ON fee_accounts FOR SELECT
    USING (
        school_id = get_user_school_id()
        AND get_user_role() = 'TEACHER'
        AND student_id IN (
            SELECT id FROM students
            WHERE current_class_id IN (
                SELECT id FROM classes WHERE class_teacher_id = auth.uid() AND is_deleted = false
            ) OR current_class_id IN (
                SELECT class_id FROM class_subjects WHERE teacher_id = auth.uid() AND is_deleted = false
            )
        )
    );

CREATE POLICY parent_own_fee_accounts ON fee_accounts FOR SELECT
    USING (
        get_user_role() = 'PARENT'
        AND student_id IN (SELECT student_id FROM parent_students WHERE parent_id = auth.uid())
    );

CREATE POLICY super_admin_all_fee_payments ON fee_payments FOR ALL
    USING (get_user_role() = 'SUPER_ADMIN');

CREATE POLICY school_admin_bursar_fee_payments ON fee_payments FOR ALL
    USING (school_id = get_user_school_id() AND get_user_role() IN ('SCHOOL_ADMIN', 'BURSAR'));

CREATE POLICY parent_own_fee_payments ON fee_payments FOR SELECT
    USING (
        get_user_role() = 'PARENT'
        AND student_id IN (SELECT student_id FROM parent_students WHERE parent_id = auth.uid())
    );

-- ---------------------------------------------------------------------------
-- fee_discounts / student_discounts
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS super_admin_all_fee_discounts        ON fee_discounts;
DROP POLICY IF EXISTS school_manage_discounts              ON fee_discounts;
DROP POLICY IF EXISTS super_admin_all_student_discounts    ON student_discounts;
DROP POLICY IF EXISTS school_manage_student_discounts      ON student_discounts;
DROP POLICY IF EXISTS parent_read_student_discounts        ON student_discounts;

CREATE POLICY super_admin_all_fee_discounts ON fee_discounts FOR ALL
    USING (get_user_role() = 'SUPER_ADMIN');

CREATE POLICY school_manage_discounts ON fee_discounts FOR ALL
    USING (school_id = get_user_school_id() AND get_user_role() IN ('SCHOOL_ADMIN', 'BURSAR'));

CREATE POLICY super_admin_all_student_discounts ON student_discounts FOR ALL
    USING (get_user_role() = 'SUPER_ADMIN');

CREATE POLICY school_manage_student_discounts ON student_discounts FOR ALL
    USING (school_id = get_user_school_id() AND get_user_role() IN ('SCHOOL_ADMIN', 'BURSAR'));

CREATE POLICY parent_read_student_discounts ON student_discounts FOR SELECT
    USING (
        get_user_role() = 'PARENT'
        AND student_id IN (SELECT student_id FROM parent_students WHERE parent_id = auth.uid())
    );

-- ---------------------------------------------------------------------------
-- fee_structure_audit_log
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS school_members_read_fee_audit   ON fee_structure_audit_log;
DROP POLICY IF EXISTS system_insert_fee_audit         ON fee_structure_audit_log;
DROP POLICY IF EXISTS super_admin_fee_audit           ON fee_structure_audit_log;

CREATE POLICY school_members_read_fee_audit ON fee_structure_audit_log FOR SELECT
    USING (school_id = get_user_school_id());

CREATE POLICY system_insert_fee_audit ON fee_structure_audit_log FOR INSERT
    WITH CHECK (school_id = get_user_school_id());

CREATE POLICY super_admin_fee_audit ON fee_structure_audit_log FOR ALL
    USING (get_user_role() = 'SUPER_ADMIN');

-- ---------------------------------------------------------------------------
-- marks / report_cards / subject_comments / grading_scales
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS super_admin_all_marks          ON marks;
DROP POLICY IF EXISTS school_admin_bursar_marks      ON marks;
DROP POLICY IF EXISTS teacher_manage_marks           ON marks;
DROP POLICY IF EXISTS teacher_write_own_marks        ON marks;
DROP POLICY IF EXISTS teacher_update_own_marks       ON marks;
DROP POLICY IF EXISTS parent_own_marks               ON marks;
DROP POLICY IF EXISTS super_admin_all_report_cards   ON report_cards;
DROP POLICY IF EXISTS school_admin_bursar_report_cards ON report_cards;
DROP POLICY IF EXISTS teacher_manage_report_cards    ON report_cards;
DROP POLICY IF EXISTS parent_own_report_cards        ON report_cards;
DROP POLICY IF EXISTS school_admin_manage_grades     ON grading_scales;

CREATE POLICY super_admin_all_marks ON marks FOR ALL
    USING (get_user_role() = 'SUPER_ADMIN');

CREATE POLICY school_admin_bursar_marks ON marks FOR ALL
    USING (school_id = get_user_school_id() AND get_user_role() IN ('SCHOOL_ADMIN', 'BURSAR'));

CREATE POLICY teacher_manage_marks ON marks FOR ALL
    USING (
        school_id = get_user_school_id()
        AND get_user_role() = 'TEACHER'
        AND (
            class_id IN (SELECT id FROM classes WHERE class_teacher_id = auth.uid() AND is_deleted = false)
            OR (class_id, subject_id) IN (
                SELECT class_id, subject_id FROM class_subjects
                WHERE teacher_id = auth.uid() AND is_deleted = false
            )
        )
    );

CREATE POLICY teacher_write_own_marks ON marks FOR INSERT
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

CREATE POLICY teacher_update_own_marks ON marks FOR UPDATE
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

CREATE POLICY parent_own_marks ON marks FOR SELECT
    USING (
        get_user_role() = 'PARENT'
        AND student_id IN (SELECT student_id FROM parent_students WHERE parent_id = auth.uid())
    );

CREATE POLICY super_admin_all_report_cards ON report_cards FOR ALL
    USING (get_user_role() = 'SUPER_ADMIN');

CREATE POLICY school_admin_bursar_report_cards ON report_cards FOR ALL
    USING (school_id = get_user_school_id() AND get_user_role() IN ('SCHOOL_ADMIN', 'BURSAR'));

CREATE POLICY teacher_manage_report_cards ON report_cards FOR ALL
    USING (
        school_id = get_user_school_id()
        AND get_user_role() = 'TEACHER'
        AND student_id IN (
            SELECT id FROM students
            WHERE current_class_id IN (
                SELECT id FROM classes WHERE class_teacher_id = auth.uid() AND is_deleted = false
            )
        )
    );

CREATE POLICY parent_own_report_cards ON report_cards FOR SELECT
    USING (
        get_user_role() = 'PARENT'
        AND is_published = true
        AND student_id IN (SELECT student_id FROM parent_students WHERE parent_id = auth.uid())
    );

DROP POLICY IF EXISTS subject_comments_school ON subject_comments;
CREATE POLICY subject_comments_school ON subject_comments FOR ALL
    USING (school_id = get_user_school_id());

CREATE POLICY school_admin_manage_grades ON grading_scales FOR ALL
    USING (school_id = get_user_school_id());

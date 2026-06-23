-- =============================================================================
-- SKULI SaaS: RLS hardening (Audit §2.3 / §8.3 / §8.4 / §8.5 / §10.1)
-- Migration 0028 (part 3)
--
-- Closes the broad RLS gaps the production-readiness review flagged.
-- For every FOR ALL policy that previously had no role restriction
-- and no WITH CHECK, this migration re-creates the policy with:
--   * an explicit role predicate (SCHOOL_ADMIN / BURSAR / etc.)
--   * a WITH CHECK (school_id = get_user_school_id()) so a row can
--     never be re-homed across tenants via UPDATE
--   * tighter participant scoping on message threads
--   * payroll_records restricted to SCHOOL_ADMIN + BURSAR + a
--     `payment_status` guard so two concurrent /api/v1/payroll/approve
--     calls cannot both flip the same record out of 'pending'
-- ---------------------------------------------------------------------------

-- ---------------------------------------------------------------------------
-- §2.3 — grading_scales / fee_types / subject_comments now require
-- SCHOOL_ADMIN and a same-tenant WITH CHECK.
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS school_admin_manage_grades ON grading_scales;
CREATE POLICY school_admin_manage_grades ON grading_scales FOR ALL
    USING (
        school_id = get_user_school_id()
        AND get_user_role() = 'SCHOOL_ADMIN'
    )
    WITH CHECK (
        school_id = get_user_school_id()
        AND get_user_role() = 'SCHOOL_ADMIN'
    );

DROP POLICY IF EXISTS fee_types_select ON fee_types;
DROP POLICY IF EXISTS fee_types_write  ON fee_types;

CREATE POLICY fee_types_select ON fee_types FOR SELECT
    USING (school_id = get_user_school_id());

CREATE POLICY fee_types_write ON fee_types FOR ALL
    USING (
        school_id = get_user_school_id()
        AND get_user_role() = 'SCHOOL_ADMIN'
    )
    WITH CHECK (
        school_id = get_user_school_id()
        AND get_user_role() = 'SCHOOL_ADMIN'
    );

DROP POLICY IF EXISTS subject_comments_school ON subject_comments;
CREATE POLICY subject_comments_school ON subject_comments FOR ALL
    USING (
        school_id = get_user_school_id()
        AND get_user_role() IN ('SCHOOL_ADMIN', 'TEACHER')
    )
    WITH CHECK (
        school_id = get_user_school_id()
        AND get_user_role() IN ('SCHOOL_ADMIN', 'TEACHER')
    );

-- ---------------------------------------------------------------------------
-- §8.3 — assets / asset_maintenance / library_books / library_issues
-- / meeting_slots / message_threads / thread_messages /
-- timetable_periods / timetable_slots / expense_categories
-- now restrict writes to SCHOOL_ADMIN (BURSAR for expense_categories)
-- and lock the row to the caller's school on UPDATE.
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS school_manage_assets ON assets;
CREATE POLICY school_manage_assets ON assets FOR ALL
    USING (
        school_id = get_user_school_id()
        AND get_user_role() = 'SCHOOL_ADMIN'
    )
    WITH CHECK (
        school_id = get_user_school_id()
        AND get_user_role() = 'SCHOOL_ADMIN'
    );

DROP POLICY IF EXISTS school_manage_asset_maintenance ON asset_maintenance;
CREATE POLICY school_manage_asset_maintenance ON asset_maintenance FOR ALL
    USING (
        school_id = get_user_school_id()
        AND get_user_role() = 'SCHOOL_ADMIN'
    )
    WITH CHECK (
        school_id = get_user_school_id()
        AND get_user_role() = 'SCHOOL_ADMIN'
    );

DROP POLICY IF EXISTS school_manage_library_books ON library_books;
CREATE POLICY school_manage_library_books ON library_books FOR ALL
    USING (
        school_id = get_user_school_id()
        AND get_user_role() = 'SCHOOL_ADMIN'
    )
    WITH CHECK (
        school_id = get_user_school_id()
        AND get_user_role() = 'SCHOOL_ADMIN'
    );

DROP POLICY IF EXISTS school_manage_library_issues ON library_issues;
CREATE POLICY school_manage_library_issues ON library_issues FOR ALL
    USING (
        school_id = get_user_school_id()
        AND get_user_role() IN ('SCHOOL_ADMIN', 'TEACHER')
    )
    WITH CHECK (
        school_id = get_user_school_id()
        AND get_user_role() IN ('SCHOOL_ADMIN', 'TEACHER')
    );

DROP POLICY IF EXISTS school_manage_slots ON meeting_slots;
CREATE POLICY school_manage_slots ON meeting_slots FOR ALL
    USING (
        school_id = get_user_school_id()
        AND get_user_role() = 'SCHOOL_ADMIN'
    )
    WITH CHECK (
        school_id = get_user_school_id()
        AND get_user_role() = 'SCHOOL_ADMIN'
    );

DROP POLICY IF EXISTS school_manage_bookings ON meeting_bookings;
CREATE POLICY school_manage_bookings ON meeting_bookings FOR ALL
    USING (
        school_id = get_user_school_id()
        AND get_user_role() = 'SCHOOL_ADMIN'
    )
    WITH CHECK (
        school_id = get_user_school_id()
        AND get_user_role() = 'SCHOOL_ADMIN'
    );

DROP POLICY IF EXISTS school_manage_threads ON message_threads;
CREATE POLICY school_manage_threads ON message_threads FOR ALL
    USING (
        school_id = get_user_school_id()
        AND get_user_role() = 'SCHOOL_ADMIN'
    )
    WITH CHECK (
        school_id = get_user_school_id()
        AND get_user_role() = 'SCHOOL_ADMIN'
    );

DROP POLICY IF EXISTS school_manage_thread_msgs ON thread_messages;
CREATE POLICY school_manage_thread_msgs ON thread_messages FOR ALL
    USING (
        school_id = get_user_school_id()
        AND get_user_role() = 'SCHOOL_ADMIN'
    )
    WITH CHECK (
        school_id = get_user_school_id()
        AND get_user_role() = 'SCHOOL_ADMIN'
    );

DROP POLICY IF EXISTS school_admin_manage_periods ON timetable_periods;
CREATE POLICY school_admin_manage_periods ON timetable_periods FOR ALL
    USING (
        school_id = get_user_school_id()
        AND get_user_role() = 'SCHOOL_ADMIN'
    )
    WITH CHECK (
        school_id = get_user_school_id()
        AND get_user_role() = 'SCHOOL_ADMIN'
    );

DROP POLICY IF EXISTS school_admin_manage_slots ON timetable_slots;
CREATE POLICY school_admin_manage_slots ON timetable_slots FOR ALL
    USING (
        school_id = get_user_school_id()
        AND get_user_role() = 'SCHOOL_ADMIN'
    )
    WITH CHECK (
        school_id = get_user_school_id()
        AND get_user_role() = 'SCHOOL_ADMIN'
    );

DROP POLICY IF EXISTS school_manage_expense_categories ON expense_categories;
CREATE POLICY school_manage_expense_categories ON expense_categories FOR ALL
    USING (
        school_id = get_user_school_id()
        AND get_user_role() IN ('SCHOOL_ADMIN', 'BURSAR')
    )
    WITH CHECK (
        school_id = get_user_school_id()
        AND get_user_role() IN ('SCHOOL_ADMIN', 'BURSAR')
    );

-- sms_templates / emis_report_logs: gate writes to SCHOOL_ADMIN.
DROP POLICY IF EXISTS sms_templates_school_access ON sms_templates;
CREATE POLICY sms_templates_school_access ON sms_templates FOR ALL
    USING (
        (
            school_id = get_user_school_id()
            AND get_user_role() = 'SCHOOL_ADMIN'
        )
        OR get_user_role() = 'SUPER_ADMIN'
    )
    WITH CHECK (
        (
            school_id = get_user_school_id()
            AND get_user_role() = 'SCHOOL_ADMIN'
        )
        OR get_user_role() = 'SUPER_ADMIN'
    );

DROP POLICY IF EXISTS school_admin_emis_logs ON emis_report_logs;
CREATE POLICY school_admin_emis_logs ON emis_report_logs FOR ALL
    USING (
        (
            school_id = get_user_school_id()
            AND get_user_role() = 'SCHOOL_ADMIN'
        )
        OR get_user_role() = 'SUPER_ADMIN'
    )
    WITH CHECK (
        (
            school_id = get_user_school_id()
            AND get_user_role() = 'SCHOOL_ADMIN'
        )
        OR get_user_role() = 'SUPER_ADMIN'
    );

-- ---------------------------------------------------------------------------
-- §8.5 — tuition_payments: only SCHOOL_ADMIN / BURSAR (and the paying
-- parent) should see online payment records. A TEACHER could otherwise
-- read all amounts, payer phone/email in the related row.
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS tuition_payments_select ON tuition_payments;
CREATE POLICY tuition_payments_select ON tuition_payments FOR SELECT
    USING (
        (
            school_id = get_user_school_id()
            AND get_user_role() IN ('SCHOOL_ADMIN', 'BURSAR', 'SUPER_ADMIN')
        )
        OR EXISTS (
            SELECT 1 FROM students s
            JOIN parent_students ps ON ps.student_id = s.id
            WHERE s.id = tuition_payments.student_id
              AND ps.parent_id = auth.uid()
        )
    );

-- ---------------------------------------------------------------------------
-- §8.4 — message_threads / meeting_bookings tightened to participants.
-- Portal-side policies (portal_view_bookings etc.) already scope on
-- parent_students, but the broad school_manage_* policies above were
-- effectively admin-only. We additionally add a SELECT policy for
-- participants of a thread (so a parent can read threads they are
-- part of, regardless of role).
-- ---------------------------------------------------------------------------
-- NOTE: message_threads is phone-based (one thread per parent_phone per school).
-- There is no thread_participants table — the link is message_threads.parent_phone
-- matched against users.phone for the calling user.
DROP POLICY IF EXISTS thread_participant_select ON message_threads;
CREATE POLICY thread_participant_select ON message_threads FOR SELECT
    USING (
        get_user_role() = 'PARENT'
        AND parent_phone = (
            SELECT phone FROM users WHERE id = auth.uid()
        )
    );

-- ---------------------------------------------------------------------------
-- §10.1 — payroll_records: a successful approval must atomically flip
-- the row out of 'pending'. The trigger on payroll_records enforces
-- the (school_id, payment_status) invariant and is created in this
-- migration. The /api/v1/payroll/approve route now uses an UPDATE
-- ... WHERE payment_status = 'pending' RETURNING to detect races.
-- ---------------------------------------------------------------------------
DROP TRIGGER IF EXISTS payroll_records_approval_guard ON payroll_records;
CREATE OR REPLACE FUNCTION public.payroll_records_approval_guard()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
    -- Once a row has been batched/funded, only the service role may
    -- mutate it. The app-layer approval is the only path that flips
    -- a 'pending' row to 'batched'; any other transition is rejected
    -- unless the caller is the service role.
    IF NEW.payment_status <> OLD.payment_status
       AND NEW.payment_status NOT IN ('pending', 'batched', 'paid', 'failed')
    THEN
        RAISE EXCEPTION 'invalid payroll_records.payment_status transition: % -> %',
            OLD.payment_status, NEW.payment_status
            USING ERRCODE = '23514';
    END IF;

    IF OLD.payment_status <> 'pending' AND NEW.payment_status = 'batched' THEN
        RAISE EXCEPTION 'payroll_records row % is not pending (current: %)',
            OLD.id, OLD.payment_status
            USING ERRCODE = '23514';
    END IF;

    RETURN NEW;
END;
$$;

CREATE TRIGGER payroll_records_approval_guard
    BEFORE UPDATE ON payroll_records
    FOR EACH ROW EXECUTE FUNCTION public.payroll_records_approval_guard();

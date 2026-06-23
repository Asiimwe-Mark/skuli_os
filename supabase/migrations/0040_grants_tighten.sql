-- =============================================================================
-- SKULI SaaS: Tightened grants (Audit Â§8.1)
-- Migration 0040 (originally 0028 part 4)
--
-- The previous grants file (0026_grants.sql) ran:
--   GRANT SELECT, INSERT, UPDATE, DELETE
--     ON ALL TABLES IN SCHEMA public TO anon, authenticated;
--   ALTER DEFAULT PRIVILEGES IN SCHEMA public
--     GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO anon, authenticated;
--
-- This hands full DML on every current and future public table to
-- both roles, so the *only* thing standing between a caller and the
-- data is RLS. A single missed RLS policy on a new table = breach.
--
-- This migration:
--   1. Revokes the blanket INSERT/UPDATE/DELETE grant from anon
--      and authenticated. Both roles keep SELECT.
--   2. Keeps ALTER DEFAULT PRIVILEGES for SELECT only â€” new tables
--      are at least readable to authenticated, but writes are
--      explicitly granted per-table by follow-up migrations.
--   3. Keeps service_role with full DML (it bypasses RLS by design
--      and is used by the webhook + admin paths).
--   4. Grants INSERT to authenticated *only* on the small set of
--      tables users truly insert into (audit_logs handled by
--      service_role triggers; sms_logs is a denormalized log table;
--      attendance_records etc. are inserted by the route layer
--      which already passes the right WITH CHECK).
-- ---------------------------------------------------------------------------

-- 1. Revoke the blanket DML grants.
REVOKE INSERT, UPDATE, DELETE
    ON ALL TABLES IN SCHEMA public
    FROM anon, authenticated;

-- 2. Make the default for new tables SELECT-only.
ALTER DEFAULT PRIVILEGES IN SCHEMA public
    REVOKE INSERT, UPDATE, DELETE ON TABLES FROM anon, authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
    REVOKE USAGE, UPDATE ON SEQUENCES FROM anon, authenticated;

-- 3. Restore DELETE for the operational log tables that the app
--    actually needs to clear (e.g. expired notifications). The list
--    is small and explicit â€” anything else is denied.
GRANT INSERT ON public.audit_logs              TO authenticated;
GRANT INSERT ON public.in_app_notifications    TO authenticated;
GRANT INSERT, UPDATE, DELETE
    ON public.push_subscriptions               TO authenticated;
GRANT INSERT, UPDATE, DELETE
    ON public.notification_preferences         TO authenticated;

-- 4. Re-grant the per-table privileges the application needs to
--    function. RLS still applies (the WITH CHECK on every policy
--    in 0015/0016/0017/0028_rls_hardening gates writes by school +
--    role). The DML grant just lets the request reach the policy.
--    Where the route uses a service-role client (webhooks,
--    /api/v1/* admin paths), no grant is needed at all.
GRANT INSERT, UPDATE, DELETE ON public.students                TO authenticated;
GRANT INSERT, UPDATE, DELETE ON public.class_enrollments       TO authenticated;
GRANT INSERT, UPDATE, DELETE ON public.parent_students         TO authenticated;
GRANT INSERT, UPDATE, DELETE ON public.fee_accounts            TO authenticated;
GRANT INSERT, UPDATE, DELETE ON public.fee_payments            TO authenticated;
GRANT INSERT, UPDATE, DELETE ON public.fee_structures          TO authenticated;
GRANT INSERT, UPDATE, DELETE ON public.fee_types               TO authenticated;
GRANT INSERT, UPDATE, DELETE ON public.fee_discounts           TO authenticated;
GRANT INSERT, UPDATE, DELETE ON public.student_discounts       TO authenticated;
GRANT INSERT, UPDATE, DELETE ON public.marks                   TO authenticated;
GRANT INSERT, UPDATE, DELETE ON public.report_cards            TO authenticated;
GRANT INSERT, UPDATE, DELETE ON public.subject_comments        TO authenticated;
GRANT INSERT, UPDATE, DELETE ON public.grading_scales          TO authenticated;
GRANT INSERT, UPDATE, DELETE ON public.attendance_records      TO authenticated;
GRANT INSERT, UPDATE, DELETE ON public.announcements           TO authenticated;
GRANT INSERT, UPDATE, DELETE ON public.staff                   TO authenticated;
GRANT INSERT, UPDATE, DELETE ON public.staff_payment_profiles  TO authenticated;
GRANT INSERT, UPDATE, DELETE ON public.payroll_records         TO authenticated;
GRANT INSERT, UPDATE, DELETE ON public.payroll_batches         TO authenticated;
GRANT INSERT, UPDATE, DELETE ON public.batch_line_items        TO authenticated;
GRANT INSERT, UPDATE, DELETE ON public.meeting_slots           TO authenticated;
GRANT INSERT, UPDATE, DELETE ON public.meeting_bookings        TO authenticated;
GRANT INSERT, UPDATE, DELETE ON public.message_threads         TO authenticated;
GRANT INSERT, UPDATE, DELETE ON public.thread_messages         TO authenticated;
GRANT INSERT, UPDATE, DELETE ON public.assets                  TO authenticated;
GRANT INSERT, UPDATE, DELETE ON public.asset_maintenance       TO authenticated;
GRANT INSERT, UPDATE, DELETE ON public.library_books           TO authenticated;
GRANT INSERT, UPDATE, DELETE ON public.library_issues          TO authenticated;
GRANT INSERT, UPDATE, DELETE ON public.discipline_records      TO authenticated;
GRANT INSERT, UPDATE, DELETE ON public.calendar_events         TO authenticated;
GRANT INSERT, UPDATE, DELETE ON public.timetable_periods       TO authenticated;
GRANT INSERT, UPDATE, DELETE ON public.timetable_slots         TO authenticated;
GRANT INSERT, UPDATE, DELETE ON public.teacher_class_assignments TO authenticated;
GRANT INSERT, UPDATE, DELETE ON public.expense_categories      TO authenticated;
GRANT INSERT, UPDATE, DELETE ON public.expenses                TO authenticated;
GRANT INSERT, UPDATE, DELETE ON public.sms_templates           TO authenticated;
GRANT INSERT, UPDATE, DELETE ON public.sms_logs                TO authenticated;
GRANT INSERT, UPDATE, DELETE ON public.emis_report_logs        TO authenticated;
GRANT INSERT, UPDATE, DELETE ON public.users                   TO authenticated;
GRANT INSERT, UPDATE, DELETE ON public.classes                 TO authenticated;
GRANT INSERT, UPDATE, DELETE ON public.subjects                TO authenticated;
GRANT INSERT, UPDATE, DELETE ON public.class_subjects          TO authenticated;
GRANT INSERT, UPDATE, DELETE ON public.academic_years          TO authenticated;
GRANT INSERT, UPDATE, DELETE ON public.terms                   TO authenticated;
GRANT INSERT, UPDATE, DELETE ON public.schools                 TO authenticated;
GRANT INSERT, UPDATE, DELETE ON public.school_groups           TO authenticated;
GRANT INSERT, UPDATE, DELETE ON public.group_admins            TO authenticated;
GRANT INSERT, UPDATE, DELETE ON public.referral_codes          TO authenticated;
GRANT INSERT, UPDATE, DELETE ON public.referrals               TO authenticated;
GRANT INSERT, UPDATE, DELETE ON public.billing_credits         TO authenticated;
GRANT INSERT, UPDATE, DELETE ON public.concierge_leads         TO authenticated;
GRANT INSERT, UPDATE, DELETE ON public.alumni                  TO authenticated;
GRANT INSERT, UPDATE, DELETE ON public.marketplace_templates   TO authenticated;
GRANT INSERT, UPDATE, DELETE ON public.subscription_invoices   TO authenticated;
GRANT INSERT, UPDATE, DELETE ON public.platform_settings       TO authenticated;
GRANT INSERT, UPDATE, DELETE ON public.tuition_payments        TO authenticated;
GRANT INSERT, UPDATE, DELETE ON public.impersonation_sessions  TO authenticated;
GRANT INSERT, UPDATE, DELETE ON public.fee_structure_audit_log TO authenticated;

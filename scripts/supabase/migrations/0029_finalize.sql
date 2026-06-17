-- =============================================================================
-- SKULI SaaS: Finalize
-- Migration 0029
--
-- ANALYZE every public table, comment every public table, and
-- GRANT EXECUTE on every function to service_role. Per 00066 final
-- state.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. ANALYZE every public table
-- ---------------------------------------------------------------------------
ANALYZE schools;
ANALYZE users;
ANALYZE school_groups;
ANALYZE group_admins;
ANALYZE parent_students;
ANALYZE academic_years;
ANALYZE terms;
ANALYZE classes;
ANALYZE subjects;
ANALYZE class_subjects;
ANALYZE students;
ANALYZE class_enrollments;
ANALYZE teacher_class_assignments;
ANALYZE fee_structures;
ANALYZE fee_types;
ANALYZE fee_accounts;
ANALYZE fee_payments;
ANALYZE fee_discounts;
ANALYZE student_discounts;
ANALYZE fee_structure_audit_log;
ANALYZE marks;
ANALYZE report_cards;
ANALYZE subject_comments;
ANALYZE grading_scales;
ANALYZE attendance_records;
ANALYZE announcements;
ANALYZE sms_logs;
ANALYZE notification_preferences;
ANALYZE in_app_notifications;
ANALYZE notification_logs;
ANALYZE audit_logs;
ANALYZE staff;
ANALYZE payroll_records;
ANALYZE staff_payment_profiles;
ANALYZE payroll_batches;
ANALYZE batch_line_items;
ANALYZE tuition_payments;
ANALYZE pesapal_token_cache;
ANALYZE subscription_invoices;
ANALYZE expense_categories;
ANALYZE expenses;
ANALYZE meeting_slots;
ANALYZE meeting_bookings;
ANALYZE message_threads;
ANALYZE thread_messages;
ANALYZE push_subscriptions;
ANALYZE push_queue;
ANALYZE library_books;
ANALYZE library_issues;
ANALYZE assets;
ANALYZE asset_maintenance;
ANALYZE concierge_leads;
ANALYZE sms_templates;
ANALYZE marketplace_templates;
ANALYZE referral_codes;
ANALYZE referrals;
ANALYZE billing_credits;
ANALYZE country_configs;
ANALYZE platform_settings;
ANALYZE emis_report_logs;
ANALYZE timetable_periods;
ANALYZE timetable_slots;
ANALYZE calendar_events;
ANALYZE discipline_records;

-- ---------------------------------------------------------------------------
-- 2. Table comments (one-liner purpose per table)
-- ---------------------------------------------------------------------------
COMMENT ON TABLE schools                  IS 'Tenant root: every school on the platform.';
COMMENT ON TABLE users                    IS 'Application-side user profile, joined 1:1 to auth.users.';
COMMENT ON TABLE school_groups            IS 'Multi-school chain grouping; used by GROUP_ADMIN.';
COMMENT ON TABLE group_admins             IS 'Link between a school group and its admin user(s).';
COMMENT ON TABLE parent_students          IS 'Link between a parent user and the student(s) they are responsible for.';
COMMENT ON TABLE academic_years           IS 'School academic year (e.g. 2026).';
COMMENT ON TABLE terms                    IS 'Terms within an academic year.';
COMMENT ON TABLE classes                  IS 'Class cohorts within a school (e.g. P5-A).';
COMMENT ON TABLE subjects                 IS 'Subjects offered by a school.';
COMMENT ON TABLE class_subjects           IS 'M:N assignment of subjects to classes, with an optional teacher.';
COMMENT ON TABLE students                 IS 'Enrolled students.';
COMMENT ON TABLE class_enrollments        IS 'Student-to-class assignment per term.';
COMMENT ON TABLE teacher_class_assignments IS 'Which teacher owns which class+subject.';
COMMENT ON TABLE fee_structures           IS 'Per-term fee line items.';
COMMENT ON TABLE fee_types                IS 'Catalogue of fee categories per school.';
COMMENT ON TABLE fee_accounts             IS 'Per-student per-term fee balance and status.';
COMMENT ON TABLE fee_payments             IS 'Confirmed and pending fee payments.';
COMMENT ON TABLE fee_discounts            IS 'Discount definitions per school.';
COMMENT ON TABLE student_discounts        IS 'Discount grants to specific students.';
COMMENT ON TABLE fee_structure_audit_log  IS 'Audit trail of changes to fee structures.';
COMMENT ON TABLE marks                    IS 'Per-student per-subject per-term exam marks.';
COMMENT ON TABLE report_cards             IS 'Termly report card aggregate per student.';
COMMENT ON TABLE subject_comments         IS 'Per-student per-subject narrative comments (BOT/MID/EOT).';
COMMENT ON TABLE grading_scales           IS 'School-configurable grade boundaries (A-F etc).';
COMMENT ON TABLE attendance_records       IS 'Daily attendance for each student.';
COMMENT ON TABLE announcements            IS 'School-wide or class-targeted announcements + scheduled SMS.';
COMMENT ON TABLE sms_logs                 IS 'Audit log of every outbound SMS.';
COMMENT ON TABLE notification_preferences IS 'Per-school toggles for automated SMS sends.';
COMMENT ON TABLE in_app_notifications     IS 'In-portal notifications.';
COMMENT ON TABLE notification_logs        IS 'Dual-channel (SMS / email / push / in-app) delivery audit.';
COMMENT ON TABLE audit_logs               IS 'System-wide audit trail; INSERT only via trigger/policy.';
COMMENT ON TABLE staff                    IS 'School staff (teachers, support).';
COMMENT ON TABLE payroll_records          IS 'Per-month salary records per staff member.';
COMMENT ON TABLE staff_payment_profiles   IS 'How each staff member is paid (mobile money / bank / cash).';
COMMENT ON TABLE payroll_batches          IS 'A funded clearing run for staff payouts.';
COMMENT ON TABLE batch_line_items         IS 'One row per worker per payroll batch.';
COMMENT ON TABLE tuition_payments         IS 'Pesapal-initiated online fee payments.';
COMMENT ON TABLE pesapal_token_cache      IS 'Singleton row caching the short-lived Pesapal Bearer token.';
COMMENT ON TABLE subscription_invoices    IS 'School subscription invoices (Pesapal).';
COMMENT ON TABLE expense_categories       IS 'Per-school expense category list.';
COMMENT ON TABLE expenses                 IS 'Per-school expense records.';
COMMENT ON TABLE meeting_slots            IS 'Teacher availability slots for parent-teacher meetings.';
COMMENT ON TABLE meeting_bookings         IS 'Parent bookings of a meeting slot.';
COMMENT ON TABLE message_threads          IS 'Two-way parent messaging threads (one per parent phone).';
COMMENT ON TABLE thread_messages          IS 'Individual messages within a thread.';
COMMENT ON TABLE push_subscriptions       IS 'PWA push subscription endpoints.';
COMMENT ON TABLE push_queue               IS 'Queue for push notifications (service-role only).';
COMMENT ON TABLE library_books            IS 'Library catalogue; tracks available copies.';
COMMENT ON TABLE library_issues           IS 'Book issue / return records.';
COMMENT ON TABLE assets                   IS 'School inventory.';
COMMENT ON TABLE asset_maintenance        IS 'Asset maintenance log.';
COMMENT ON TABLE concierge_leads          IS 'Onboarding concierge leads (super admin only).';
COMMENT ON TABLE sms_templates            IS 'Per-school SMS templates with variable substitution.';
COMMENT ON TABLE marketplace_templates    IS 'Curated marketplace templates (sms / fee_structure / report_comment).';
COMMENT ON TABLE referral_codes           IS 'One referral code per school.';
COMMENT ON TABLE referrals                IS 'Track each referral that resulted in a signup.';
COMMENT ON TABLE billing_credits          IS 'Per-school credit balance (in months).';
COMMENT ON TABLE country_configs          IS 'Multi-country config (currency, mobile money, term structure).';
COMMENT ON TABLE platform_settings        IS 'Global platform settings (SMS rate, plan prices, feature flags).';
COMMENT ON TABLE emis_report_logs         IS 'EMIS report generation audit log.';
COMMENT ON TABLE timetable_periods        IS 'Daily period definitions for a school timetable.';
COMMENT ON TABLE timetable_slots          IS 'Subject + teacher assignments to period+class.';
COMMENT ON TABLE calendar_events          IS 'Holidays, exams, events, closures.';
COMMENT ON TABLE discipline_records       IS 'Student discipline log.';

-- ---------------------------------------------------------------------------
-- 3. GRANT EXECUTE on every function to service_role
-- ---------------------------------------------------------------------------
GRANT EXECUTE ON FUNCTION get_user_school_id()                            TO service_role;
GRANT EXECUTE ON FUNCTION get_user_role()                                 TO service_role;
GRANT EXECUTE ON FUNCTION get_user_group_school_ids()                     TO service_role;
GRANT EXECUTE ON FUNCTION class_school_id(uuid)                           TO service_role;
GRANT EXECUTE ON FUNCTION is_school_admin()                               TO service_role;
GRANT EXECUTE ON FUNCTION is_in_school(uuid)                              TO service_role;
GRANT EXECUTE ON FUNCTION update_updated_at()                             TO service_role;
GRANT EXECUTE ON FUNCTION prevent_role_self_escalation()                  TO service_role;
GRANT EXECUTE ON FUNCTION public.handle_new_user()                        TO service_role;
GRANT EXECUTE ON FUNCTION seed_default_grading_scale()                    TO service_role;
GRANT EXECUTE ON FUNCTION auto_create_referral_code()                     TO service_role;
GRANT EXECUTE ON FUNCTION encrypt_secret(text, text)                      TO service_role;
GRANT EXECUTE ON FUNCTION decrypt_secret(text, text)                      TO service_role;
GRANT EXECUTE ON FUNCTION recalculate_fee_account(uuid)                   TO service_role;
GRANT EXECUTE ON FUNCTION create_fee_accounts_for_term(uuid, uuid)        TO service_role;
GRANT EXECUTE ON FUNCTION generate_receipt_number(uuid)                   TO service_role;
GRANT EXECUTE ON FUNCTION confirm_tuition_payment(text, text, text, numeric) TO service_role;
GRANT EXECUTE ON FUNCTION apply_referral_credit(text, uuid)               TO service_role;
GRANT EXECUTE ON FUNCTION generate_meeting_slots(uuid, uuid, date, time, time, int) TO service_role;
GRANT EXECUTE ON FUNCTION issue_library_book(uuid, uuid, uuid, date, uuid)         TO service_role;
GRANT EXECUTE ON FUNCTION return_library_book(uuid, uuid, numeric, boolean)        TO service_role;
GRANT EXECUTE ON FUNCTION dashboard_attendance_today(uuid, date)          TO service_role;
GRANT EXECUTE ON FUNCTION dashboard_attendance_by_class(uuid, date)       TO service_role;
GRANT EXECUTE ON FUNCTION dashboard_payment_trend(uuid, uuid)             TO service_role;
GRANT EXECUTE ON FUNCTION dashboard_payment_methods(uuid, uuid)           TO service_role;
GRANT EXECUTE ON FUNCTION get_student_fee_summary(uuid, text)             TO service_role;
GRANT EXECUTE ON FUNCTION get_student_fee_breakdown(uuid, text)           TO service_role;
GRANT EXECUTE ON FUNCTION get_student_current_results(uuid, text)         TO service_role;
GRANT EXECUTE ON FUNCTION get_student_attendance_summary(uuid, text)      TO service_role;

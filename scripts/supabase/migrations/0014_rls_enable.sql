-- =============================================================================
-- SKULI SaaS: Row Level Security — Enable
-- Migration 0014
--
-- RLS is enabled on every public table. The four "system" tables
-- (push_queue, audit_logs, notification_logs, pesapal_token_cache)
-- have USING (false) policies so the client surface is locked down
-- while the service role bypasses RLS entirely.
--
-- Policies themselves live in 0015 / 0016 / 0017. The hardening of
-- INSERT-only, no-client-access, and the role-escalation guard live
-- in 0018.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Tenant-scoped tables
-- ---------------------------------------------------------------------------
ALTER TABLE schools                        ENABLE ROW LEVEL SECURITY;
ALTER TABLE users                          ENABLE ROW LEVEL SECURITY;
ALTER TABLE academic_years                 ENABLE ROW LEVEL SECURITY;
ALTER TABLE terms                          ENABLE ROW LEVEL SECURITY;
ALTER TABLE classes                        ENABLE ROW LEVEL SECURITY;
ALTER TABLE subjects                       ENABLE ROW LEVEL SECURITY;
ALTER TABLE class_subjects                 ENABLE ROW LEVEL SECURITY;
ALTER TABLE students                       ENABLE ROW LEVEL SECURITY;
ALTER TABLE parent_students                ENABLE ROW LEVEL SECURITY;
ALTER TABLE class_enrollments              ENABLE ROW LEVEL SECURITY;
ALTER TABLE fee_structures                 ENABLE ROW LEVEL SECURITY;
ALTER TABLE fee_types                      ENABLE ROW LEVEL SECURITY;
ALTER TABLE fee_accounts                   ENABLE ROW LEVEL SECURITY;
ALTER TABLE fee_payments                   ENABLE ROW LEVEL SECURITY;
ALTER TABLE marks                          ENABLE ROW LEVEL SECURITY;
ALTER TABLE report_cards                   ENABLE ROW LEVEL SECURITY;
ALTER TABLE subject_comments               ENABLE ROW LEVEL SECURITY;
ALTER TABLE grading_scales                 ENABLE ROW LEVEL SECURITY;
ALTER TABLE attendance_records             ENABLE ROW LEVEL SECURITY;
ALTER TABLE announcements                  ENABLE ROW LEVEL SECURITY;
ALTER TABLE sms_logs                       ENABLE ROW LEVEL SECURITY;
ALTER TABLE staff                          ENABLE ROW LEVEL SECURITY;
ALTER TABLE payroll_records                ENABLE ROW LEVEL SECURITY;
ALTER TABLE staff_payment_profiles         ENABLE ROW LEVEL SECURITY;
ALTER TABLE payroll_batches                ENABLE ROW LEVEL SECURITY;
ALTER TABLE batch_line_items               ENABLE ROW LEVEL SECURITY;
ALTER TABLE subscription_invoices          ENABLE ROW LEVEL SECURITY;
ALTER TABLE teacher_class_assignments      ENABLE ROW LEVEL SECURITY;
ALTER TABLE timetable_periods              ENABLE ROW LEVEL SECURITY;
ALTER TABLE timetable_slots                ENABLE ROW LEVEL SECURITY;
ALTER TABLE calendar_events                ENABLE ROW LEVEL SECURITY;
ALTER TABLE discipline_records             ENABLE ROW LEVEL SECURITY;
ALTER TABLE fee_discounts                  ENABLE ROW LEVEL SECURITY;
ALTER TABLE student_discounts              ENABLE ROW LEVEL SECURITY;
ALTER TABLE fee_structure_audit_log        ENABLE ROW LEVEL SECURITY;
ALTER TABLE expense_categories             ENABLE ROW LEVEL SECURITY;
ALTER TABLE expenses                       ENABLE ROW LEVEL SECURITY;
ALTER TABLE meeting_slots                  ENABLE ROW LEVEL SECURITY;
ALTER TABLE meeting_bookings               ENABLE ROW LEVEL SECURITY;
ALTER TABLE message_threads                ENABLE ROW LEVEL SECURITY;
ALTER TABLE thread_messages                ENABLE ROW LEVEL SECURITY;
ALTER TABLE push_subscriptions             ENABLE ROW LEVEL SECURITY;
ALTER TABLE library_books                  ENABLE ROW LEVEL SECURITY;
ALTER TABLE library_issues                 ENABLE ROW LEVEL SECURITY;
ALTER TABLE assets                         ENABLE ROW LEVEL SECURITY;
ALTER TABLE asset_maintenance              ENABLE ROW LEVEL SECURITY;
ALTER TABLE concierge_leads                ENABLE ROW LEVEL SECURITY;
ALTER TABLE sms_templates                  ENABLE ROW LEVEL SECURITY;
ALTER TABLE in_app_notifications           ENABLE ROW LEVEL SECURITY;
ALTER TABLE notification_preferences       ENABLE ROW LEVEL SECURITY;
ALTER TABLE referral_codes                 ENABLE ROW LEVEL SECURITY;
ALTER TABLE referrals                      ENABLE ROW LEVEL SECURITY;
ALTER TABLE billing_credits                ENABLE ROW LEVEL SECURITY;
ALTER TABLE emis_report_logs               ENABLE ROW LEVEL SECURITY;
ALTER TABLE school_groups                  ENABLE ROW LEVEL SECURITY;
ALTER TABLE group_admins                   ENABLE ROW LEVEL SECURITY;
ALTER TABLE alumni                         ENABLE ROW LEVEL SECURITY;

-- ---------------------------------------------------------------------------
-- System tables (client gets no access; service role bypasses RLS)
-- ---------------------------------------------------------------------------
ALTER TABLE push_queue                 ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs                 ENABLE ROW LEVEL SECURITY;
ALTER TABLE notification_logs          ENABLE ROW LEVEL SECURITY;
ALTER TABLE pesapal_token_cache        ENABLE ROW LEVEL SECURITY;
ALTER TABLE platform_settings          ENABLE ROW LEVEL SECURITY;
ALTER TABLE country_configs            ENABLE ROW LEVEL SECURITY;
ALTER TABLE marketplace_templates      ENABLE ROW LEVEL SECURITY;
ALTER TABLE tuition_payments           ENABLE ROW LEVEL SECURITY;

-- ---------------------------------------------------------------------------
-- System tables: no-client-access (locked-down USING (false))
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS push_queue_no_client_access   ON push_queue;
DROP POLICY IF EXISTS audit_logs_no_client_access   ON audit_logs;
DROP POLICY IF EXISTS notification_logs_none        ON notification_logs;
DROP POLICY IF EXISTS pesapal_token_cache_none      ON pesapal_token_cache;

CREATE POLICY push_queue_no_client_access
    ON push_queue FOR ALL
    USING (false) WITH CHECK (false);

CREATE POLICY audit_logs_no_client_access
    ON audit_logs FOR ALL
    USING (false) WITH CHECK (false);

CREATE POLICY notification_logs_none
    ON notification_logs FOR ALL
    USING (false) WITH CHECK (false);

CREATE POLICY pesapal_token_cache_none
    ON pesapal_token_cache FOR ALL
    USING (false) WITH CHECK (false);

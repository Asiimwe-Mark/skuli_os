-- =============================================================================
-- SKULI SaaS: Column Drops (dead-column sweep)
-- Migration 0028
--
-- Drops every column in section D of the reconciliation report. The
-- CREATE TABLE statements in 0004-0012 do NOT include these columns,
-- so this file is a no-op on a fresh DB. It exists so this stream can
-- be applied to a pre-existing DB that still has them — the drops are
-- idempotent (IF EXISTS).
--
-- Per section D of the reconciliation report, the dead columns are:
-- ---------------------------------------------------------------------------

ALTER TABLE students                 DROP COLUMN IF EXISTS parent_nid;
ALTER TABLE classes                  DROP COLUMN IF EXISTS stream;
ALTER TABLE staff                    DROP COLUMN IF EXISTS national_id;
ALTER TABLE staff                    DROP COLUMN IF EXISTS hire_date;
ALTER TABLE marks                    DROP COLUMN IF EXISTS entered_by;
ALTER TABLE marks                    DROP COLUMN IF EXISTS reviewed_by;
ALTER TABLE report_cards             DROP COLUMN IF EXISTS pdf_url;
ALTER TABLE attendance_records       DROP COLUMN IF EXISTS marked_by;
ALTER TABLE announcements            DROP COLUMN IF EXISTS sent_via;
ALTER TABLE sms_logs                 DROP COLUMN IF EXISTS related_entity_type;
ALTER TABLE sms_logs                 DROP COLUMN IF EXISTS related_entity_id;
ALTER TABLE fee_payments             DROP COLUMN IF EXISTS mobile_money_provider;
ALTER TABLE fee_payments             DROP COLUMN IF EXISTS phone_used;
ALTER TABLE fee_payments             DROP COLUMN IF EXISTS received_by_user_id;
ALTER TABLE fee_structures           DROP COLUMN IF EXISTS is_mandatory;
ALTER TABLE timetable_periods        DROP COLUMN IF EXISTS is_break;
ALTER TABLE timetable_periods        DROP COLUMN IF EXISTS sort_order;
ALTER TABLE timetable_periods        DROP COLUMN IF EXISTS start_time;
ALTER TABLE timetable_periods        DROP COLUMN IF EXISTS end_time;
ALTER TABLE timetable_slots          DROP COLUMN IF EXISTS room;
ALTER TABLE timetable_slots          DROP COLUMN IF EXISTS day_of_week;
ALTER TABLE timetable_slots          DROP COLUMN IF EXISTS academic_year_id;
ALTER TABLE notification_preferences DROP COLUMN IF EXISTS sms_enabled;
ALTER TABLE asset_maintenance        DROP COLUMN IF EXISTS cost;
ALTER TABLE asset_maintenance        DROP COLUMN IF EXISTS next_service_date;
ALTER TABLE asset_maintenance        DROP COLUMN IF EXISTS performed_by;
ALTER TABLE library_issues           DROP COLUMN IF EXISTS issued_by;
ALTER TABLE library_issues           DROP COLUMN IF EXISTS updated_at;
ALTER TABLE meeting_bookings         DROP COLUMN IF EXISTS notes;
ALTER TABLE student_discounts        DROP COLUMN IF EXISTS note;
ALTER TABLE student_discounts        DROP COLUMN IF EXISTS approved_by;
ALTER TABLE fee_discounts            DROP COLUMN IF EXISTS max_amount;
ALTER TABLE fee_discounts            DROP COLUMN IF EXISTS is_recurring;
ALTER TABLE fee_discounts            DROP COLUMN IF EXISTS description;
ALTER TABLE fee_discounts            DROP COLUMN IF EXISTS is_active;
ALTER TABLE subject_comments         DROP COLUMN IF EXISTS created_at;
ALTER TABLE subject_comments         DROP COLUMN IF EXISTS updated_at;
ALTER TABLE subject_comments         DROP COLUMN IF EXISTS is_deleted;
ALTER TABLE concierge_leads          DROP COLUMN IF EXISTS notes;
ALTER TABLE concierge_leads          DROP COLUMN IF EXISTS preferred_date;
ALTER TABLE concierge_leads          DROP COLUMN IF EXISTS followed_up_at;
ALTER TABLE country_configs          DROP COLUMN IF EXISTS mobile_money_providers;
ALTER TABLE expenses                 DROP COLUMN IF EXISTS term_id;
ALTER TABLE expenses                 DROP COLUMN IF EXISTS receipt_number;
ALTER TABLE expenses                 DROP COLUMN IF EXISTS recorded_by;
ALTER TABLE expenses                 DROP COLUMN IF EXISTS notes;
ALTER TABLE expenses                 DROP COLUMN IF EXISTS created_at;
ALTER TABLE emis_report_logs         DROP COLUMN IF EXISTS record_count;
ALTER TABLE emis_report_logs         DROP COLUMN IF EXISTS report_type;
ALTER TABLE emis_report_logs         DROP COLUMN IF EXISTS pdf_url;
ALTER TABLE payroll_batches          DROP COLUMN IF EXISTS pesapal_funding_ref;
ALTER TABLE payroll_batches          DROP COLUMN IF EXISTS pesapal_funding_url;
ALTER TABLE payroll_batches          DROP COLUMN IF EXISTS pesapal_order_tracking_id;
ALTER TABLE payroll_batches          DROP COLUMN IF EXISTS funded_at;
ALTER TABLE payroll_batches          DROP COLUMN IF EXISTS approved_by_user_id;
ALTER TABLE payroll_batches          DROP COLUMN IF EXISTS total_net_salaries;
ALTER TABLE payroll_batches          DROP COLUMN IF EXISTS total_overhead_fees;
ALTER TABLE batch_line_items         DROP COLUMN IF EXISTS processing_fee;
ALTER TABLE batch_line_items         DROP COLUMN IF EXISTS provider_receipt_id;
ALTER TABLE batch_line_items         DROP COLUMN IF EXISTS last_error;
ALTER TABLE batch_line_items         DROP COLUMN IF EXISTS disbursed_at;
ALTER TABLE batch_line_items         DROP COLUMN IF EXISTS created_at;
ALTER TABLE batch_line_items         DROP COLUMN IF EXISTS payroll_record_id;
ALTER TABLE tuition_payments         DROP COLUMN IF EXISTS fee_type_id;
ALTER TABLE tuition_payments         DROP COLUMN IF EXISTS fee_type_label;
ALTER TABLE tuition_payments         DROP COLUMN IF EXISTS pesapal_redirect_url;
ALTER TABLE tuition_payments         DROP COLUMN IF EXISTS payment_description;
ALTER TABLE tuition_payments         DROP COLUMN IF EXISTS initiated_by_user_id;
ALTER TABLE calendar_events          DROP COLUMN IF EXISTS is_all_day;
ALTER TABLE calendar_events          DROP COLUMN IF EXISTS start_time;
ALTER TABLE pesapal_token_cache      DROP COLUMN IF EXISTS updated_at;
ALTER TABLE schools                  DROP COLUMN IF EXISTS flutterwave_public_key;
ALTER TABLE schools                  DROP COLUMN IF EXISTS flutterwave_secret_key;
ALTER TABLE schools                  DROP COLUMN IF EXISTS flutterwave_secret_key_enc;
ALTER TABLE schools                  DROP COLUMN IF EXISTS flutterwave_encryption_key;
ALTER TABLE schools                  DROP COLUMN IF EXISTS flutterwave_encryption_key_enc;

-- The alumni table IS created in 0011 — see that file for the rationale.
-- No DROP TABLE statement here.

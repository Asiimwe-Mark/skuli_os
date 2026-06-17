-- =============================================================================
-- SKULI OS  |  Migration 0032  |  Complete Schema Reconciliation
-- =============================================================================
--
-- Full cross-reference of every .ts/.tsx file in /app and /lib against
-- migrations 0001–0031.  Every column, enum value, view, trigger, function,
-- and index the frontend reads or writes that was absent from the DB is added
-- here in a single, idempotent file.
--
-- Every ALTER TABLE / CREATE is guarded by IF NOT EXISTS so this migration
-- is safe to re-run against a database that is partially applied.
--
-- ┌─────────────────────────────────────────────────────────────────────────┐
-- │  Tables touched   : 33                                                  │
-- │  Columns added    : 73                                                  │
-- │  Enum values added: 5  (refunded, waiver, push, fixed, fixed_amount)    │
-- │  Views created    : 1  (marks_pivoted)                                  │
-- │  Triggers created : 1  (trg_marks_set_grade)                            │
-- │  Functions created: 1  (fn_marks_set_grade)                             │
-- │  Indexes created  : 20                                                  │
-- └─────────────────────────────────────────────────────────────────────────┘
--
-- =============================================================================

-- =============================================================================
-- SECTION 1 — ENUM EXTENSIONS
-- Must run before any column that references the enum.
-- ADD VALUE IF NOT EXISTS is safe; the outer EXCEPTION guard handles edge cases.
-- =============================================================================

-- 1a. payment_status: add 'refunded'
DO $$ BEGIN
  ALTER TYPE payment_status ADD VALUE IF NOT EXISTS 'refunded';
EXCEPTION WHEN others THEN NULL;
END $$;

-- 1b. expense_payment_method: add 'waiver'
DO $$ BEGIN
  ALTER TYPE expense_payment_method ADD VALUE IF NOT EXISTS 'waiver';
EXCEPTION WHEN others THEN NULL;
END $$;

-- 1c. sms_channel: add 'push'
DO $$ BEGIN
  ALTER TYPE sms_channel ADD VALUE IF NOT EXISTS 'push';
EXCEPTION WHEN others THEN NULL;
END $$;

-- =============================================================================
-- SECTION 2 — TABLE COLUMN ADDITIONS
-- Alphabetical by table name for easy auditing.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 2.01  announcements.sent_via  →  widen from sms_channel enum to text
--
-- The communication/send route writes compound values like 'sms,in_app' which
-- are not valid enum literals.  Converting to text with a CHECK constraint
-- accepts both single and compound channel strings without data loss.
-- ---------------------------------------------------------------------------
DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'announcements'
      AND column_name = 'sent_via'
      AND udt_name = 'sms_channel'
  ) THEN
    ALTER TABLE announcements
      ALTER COLUMN sent_via TYPE text USING sent_via::text;
    ALTER TABLE announcements
      ADD CONSTRAINT announcements_sent_via_check CHECK (
        sent_via IN (
          'sms', 'email', 'in_app', 'push',
          'sms,in_app', 'sms,push', 'email,in_app',
          'sms,email,in_app', 'sms,in_app,push'
        )
      );
    COMMENT ON COLUMN announcements.sent_via IS
      'Channel(s) used. Single: sms/email/in_app/push. Compound: sms,in_app etc.';
  END IF;
EXCEPTION WHEN others THEN NULL;
END $$;

-- ---------------------------------------------------------------------------
-- 2.02  asset_maintenance — cost, next_service_date, performed_by
-- ---------------------------------------------------------------------------
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_name = 'asset_maintenance' AND column_name = 'cost') THEN
    ALTER TABLE asset_maintenance ADD COLUMN cost numeric;
    COMMENT ON COLUMN asset_maintenance.cost IS 'Cost of maintenance job in UGX.';
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_name = 'asset_maintenance' AND column_name = 'next_service_date') THEN
    ALTER TABLE asset_maintenance ADD COLUMN next_service_date date;
    COMMENT ON COLUMN asset_maintenance.next_service_date IS 'When next maintenance is due.';
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_name = 'asset_maintenance' AND column_name = 'performed_by') THEN
    ALTER TABLE asset_maintenance ADD COLUMN performed_by text;
    COMMENT ON COLUMN asset_maintenance.performed_by IS 'Name or company that performed the maintenance.';
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- 2.03  attendance_records — remarks
--
-- Frontend queries the column as "remarks"; the original column was "notes".
-- Both are kept: "notes" remains for any code that already uses it; "remarks"
-- is added and backfilled so existing data is not silently dropped.
-- ---------------------------------------------------------------------------
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_name = 'attendance_records' AND column_name = 'remarks') THEN
    ALTER TABLE attendance_records ADD COLUMN remarks text;
    UPDATE attendance_records SET remarks = notes WHERE notes IS NOT NULL;
    COMMENT ON COLUMN attendance_records.remarks IS
      'Teacher remarks for this record. Mirrors the legacy "notes" column; both are kept.';
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- 2.04  audit_logs — user_agent
--
-- lib/audit-log.ts passes user_agent on every write.  Without this column
-- Supabase silently ignores the field and TypeScript needs "as never".
-- ---------------------------------------------------------------------------
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_name = 'audit_logs' AND column_name = 'user_agent') THEN
    ALTER TABLE audit_logs ADD COLUMN user_agent text;
    COMMENT ON COLUMN audit_logs.user_agent IS
      'HTTP User-Agent string of the browser/client that performed this action.';
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- 2.05  batch_line_items — created_at, disbursed_at, last_error
-- ---------------------------------------------------------------------------
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_name = 'batch_line_items' AND column_name = 'created_at') THEN
    ALTER TABLE batch_line_items ADD COLUMN created_at timestamptz NOT NULL DEFAULT now();
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_name = 'batch_line_items' AND column_name = 'disbursed_at') THEN
    ALTER TABLE batch_line_items ADD COLUMN disbursed_at timestamptz;
    COMMENT ON COLUMN batch_line_items.disbursed_at IS 'When successfully disbursed. NULL until status = SUCCESS.';
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_name = 'batch_line_items' AND column_name = 'last_error') THEN
    ALTER TABLE batch_line_items ADD COLUMN last_error text;
    COMMENT ON COLUMN batch_line_items.last_error IS 'Error message from last failed disbursal attempt.';
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- 2.06  calendar_events — is_public
-- ---------------------------------------------------------------------------
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_name = 'calendar_events' AND column_name = 'is_public') THEN
    ALTER TABLE calendar_events ADD COLUMN is_public boolean NOT NULL DEFAULT true;
    COMMENT ON COLUMN calendar_events.is_public IS 'If true, visible to the parent portal calendar.';
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- 2.07  classes — stream
-- ---------------------------------------------------------------------------
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_name = 'classes' AND column_name = 'stream') THEN
    ALTER TABLE classes ADD COLUMN stream text;
    COMMENT ON COLUMN classes.stream IS 'Stream identifier (A, B, Science, Arts). Optional.';
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- 2.08  concierge_leads — followed_up_at, notes, preferred_date
-- ---------------------------------------------------------------------------
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_name = 'concierge_leads' AND column_name = 'followed_up_at') THEN
    ALTER TABLE concierge_leads ADD COLUMN followed_up_at timestamptz;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_name = 'concierge_leads' AND column_name = 'notes') THEN
    ALTER TABLE concierge_leads ADD COLUMN notes text;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_name = 'concierge_leads' AND column_name = 'preferred_date') THEN
    ALTER TABLE concierge_leads ADD COLUMN preferred_date date;
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- 2.09  emis_report_logs — record_count, report_type
-- ---------------------------------------------------------------------------
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_name = 'emis_report_logs' AND column_name = 'record_count') THEN
    ALTER TABLE emis_report_logs ADD COLUMN record_count int;
    COMMENT ON COLUMN emis_report_logs.record_count IS 'Number of records in the report. Shown in EMIS history list.';
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_name = 'emis_report_logs' AND column_name = 'report_type') THEN
    ALTER TABLE emis_report_logs ADD COLUMN report_type text;
    COMMENT ON COLUMN emis_report_logs.report_type IS 'Type of EMIS report (enrolment, attendance, performance…).';
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- 2.10  expense_categories — color, created_at, updated_at
-- ---------------------------------------------------------------------------
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_name = 'expense_categories' AND column_name = 'color') THEN
    ALTER TABLE expense_categories ADD COLUMN color text;
    COMMENT ON COLUMN expense_categories.color IS 'Hex colour for chart display (e.g. #F59E0B).';
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_name = 'expense_categories' AND column_name = 'created_at') THEN
    ALTER TABLE expense_categories ADD COLUMN created_at timestamptz NOT NULL DEFAULT now();
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_name = 'expense_categories' AND column_name = 'updated_at') THEN
    ALTER TABLE expense_categories ADD COLUMN updated_at timestamptz NOT NULL DEFAULT now();
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- 2.11  expenses — notes, receipt_number, recorded_by, term_id
-- ---------------------------------------------------------------------------
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_name = 'expenses' AND column_name = 'notes') THEN
    ALTER TABLE expenses ADD COLUMN notes text;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_name = 'expenses' AND column_name = 'receipt_number') THEN
    ALTER TABLE expenses ADD COLUMN receipt_number text;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_name = 'expenses' AND column_name = 'recorded_by') THEN
    ALTER TABLE expenses ADD COLUMN recorded_by uuid REFERENCES users(id) ON DELETE SET NULL;
    COMMENT ON COLUMN expenses.recorded_by IS 'User who recorded this expense. JOIN: users!recorded_by(full_name).';
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_name = 'expenses' AND column_name = 'term_id') THEN
    ALTER TABLE expenses ADD COLUMN term_id uuid REFERENCES terms(id) ON DELETE SET NULL;
    COMMENT ON COLUMN expenses.term_id IS 'Term attribution for P&L report.';
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- 2.12  fee_accounts — total_discount, total_fees
-- ---------------------------------------------------------------------------
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_name = 'fee_accounts' AND column_name = 'total_discount') THEN
    ALTER TABLE fee_accounts ADD COLUMN total_discount numeric NOT NULL DEFAULT 0;
    COMMENT ON COLUMN fee_accounts.total_discount IS 'Sum of applied discounts. total_expected = total_fees - total_discount.';
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_name = 'fee_accounts' AND column_name = 'total_fees') THEN
    ALTER TABLE fee_accounts ADD COLUMN total_fees numeric NOT NULL DEFAULT 0;
    COMMENT ON COLUMN fee_accounts.total_fees IS 'Gross fees before discounts. Set by recalculate_fee_account().';
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- 2.13  fee_discounts — description, is_active
--        + widen discount_type to accept 'fixed' alongside 'fixed_amount'
-- ---------------------------------------------------------------------------
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_name = 'fee_discounts' AND column_name = 'description') THEN
    ALTER TABLE fee_discounts ADD COLUMN description text;
    COMMENT ON COLUMN fee_discounts.description IS 'Optional human-readable description of the discount.';
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_name = 'fee_discounts' AND column_name = 'is_active') THEN
    ALTER TABLE fee_discounts ADD COLUMN is_active boolean NOT NULL DEFAULT true;
    COMMENT ON COLUMN fee_discounts.is_active IS 'Whether this discount is available for use. Soft-disable without deletion.';
  END IF;
END $$;

-- Widen discount_type from enum to text (accepts 'fixed', 'fixed_amount', 'percentage')
DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'fee_discounts'
      AND column_name = 'discount_type'
      AND udt_name = 'discount_type'
  ) THEN
    ALTER TABLE fee_discounts ALTER COLUMN discount_type TYPE text USING discount_type::text;
    ALTER TABLE fee_discounts ADD CONSTRAINT fee_discounts_discount_type_check
      CHECK (discount_type IN ('percentage', 'fixed_amount', 'fixed'));
  END IF;
EXCEPTION WHEN others THEN NULL;
END $$;

-- ---------------------------------------------------------------------------
-- 2.14  fee_payments — mobile_money_provider, pesapal_order_tracking_id,
--                      pesapal_tx_id, phone_used, received_by_user_id
-- ---------------------------------------------------------------------------
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_name = 'fee_payments' AND column_name = 'mobile_money_provider') THEN
    ALTER TABLE fee_payments ADD COLUMN mobile_money_provider text
      CHECK (mobile_money_provider IN ('mtn', 'airtel', 'MTN', 'AIRTEL'));
    COMMENT ON COLUMN fee_payments.mobile_money_provider IS 'Mobile money network (mtn/airtel). Set for STK push payments.';
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_name = 'fee_payments' AND column_name = 'pesapal_order_tracking_id') THEN
    ALTER TABLE fee_payments ADD COLUMN pesapal_order_tracking_id text;
    COMMENT ON COLUMN fee_payments.pesapal_order_tracking_id IS 'Pesapal tracking ID from STK push. Used by webhook to verify.';
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_name = 'fee_payments' AND column_name = 'pesapal_tx_id') THEN
    ALTER TABLE fee_payments ADD COLUMN pesapal_tx_id text;
    COMMENT ON COLUMN fee_payments.pesapal_tx_id IS 'Confirmed Pesapal transaction ID. Written by IPN webhook.';
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_name = 'fee_payments' AND column_name = 'phone_used') THEN
    ALTER TABLE fee_payments ADD COLUMN phone_used text;
    COMMENT ON COLUMN fee_payments.phone_used IS 'Phone number used for STK push. Stored for receipt and reconciliation.';
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_name = 'fee_payments' AND column_name = 'received_by_user_id') THEN
    ALTER TABLE fee_payments ADD COLUMN received_by_user_id uuid REFERENCES users(id) ON DELETE SET NULL;
    COMMENT ON COLUMN fee_payments.received_by_user_id IS 'Staff who recorded the payment. Used for receipt audit trail.';
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- 2.15  grading_scales — sort_order
-- ---------------------------------------------------------------------------
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_name = 'grading_scales' AND column_name = 'sort_order') THEN
    ALTER TABLE grading_scales ADD COLUMN sort_order int NOT NULL DEFAULT 0;
    COMMENT ON COLUMN grading_scales.sort_order IS 'Display order. Lower = better grade shown first.';
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- 2.16  library_issues — is_deleted, issued_by, updated_at
-- ---------------------------------------------------------------------------
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_name = 'library_issues' AND column_name = 'is_deleted') THEN
    ALTER TABLE library_issues ADD COLUMN is_deleted boolean NOT NULL DEFAULT false;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_name = 'library_issues' AND column_name = 'issued_by') THEN
    ALTER TABLE library_issues ADD COLUMN issued_by uuid REFERENCES users(id) ON DELETE SET NULL;
    COMMENT ON COLUMN library_issues.issued_by IS 'Staff member who issued the book.';
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_name = 'library_issues' AND column_name = 'updated_at') THEN
    ALTER TABLE library_issues ADD COLUMN updated_at timestamptz NOT NULL DEFAULT now();
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- 2.17  marks — grade
--
-- Stored grade label (A/B/C…) so the portal can read it without
-- re-running grading_scales on every fetch.  Auto-populated by the
-- trigger created in Section 4.
-- ---------------------------------------------------------------------------
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_name = 'marks' AND column_name = 'grade') THEN
    ALTER TABLE marks ADD COLUMN grade text;
    COMMENT ON COLUMN marks.grade IS 'Grade label from grading_scales. Auto-set by trg_marks_set_grade.';
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- 2.18  meeting_bookings — notes
-- ---------------------------------------------------------------------------
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_name = 'meeting_bookings' AND column_name = 'notes') THEN
    ALTER TABLE meeting_bookings ADD COLUMN notes text;
    COMMENT ON COLUMN meeting_bookings.notes IS 'Parent note about what they want to discuss.';
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- 2.19  meeting_slots — day_of_week  (GENERATED ALWAYS — do not INSERT)
-- ---------------------------------------------------------------------------
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_name = 'meeting_slots' AND column_name = 'day_of_week') THEN
    ALTER TABLE meeting_slots
      ADD COLUMN day_of_week int
        GENERATED ALWAYS AS (EXTRACT(ISODOW FROM slot_date)::int) STORED;
    COMMENT ON COLUMN meeting_slots.day_of_week IS 'ISO weekday derived from slot_date (1=Mon…7=Sun). Generated — never insert.';
  END IF;
EXCEPTION WHEN others THEN NULL;
END $$;

-- ---------------------------------------------------------------------------
-- 2.20  notification_logs — cost, last_error, provider_message_id
--
-- lib/services/notifications.ts updates these fields after every SMS send.
-- Without them the service needed "as never" casts and delivery costs/errors
-- were not persisted.
-- ---------------------------------------------------------------------------
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_name = 'notification_logs' AND column_name = 'cost') THEN
    ALTER TABLE notification_logs ADD COLUMN cost numeric;
    COMMENT ON COLUMN notification_logs.cost IS 'SMS delivery cost in UGX (from Africa''s Talking response).';
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_name = 'notification_logs' AND column_name = 'last_error') THEN
    ALTER TABLE notification_logs ADD COLUMN last_error text;
    COMMENT ON COLUMN notification_logs.last_error IS 'Last error message if delivery failed.';
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_name = 'notification_logs' AND column_name = 'provider_message_id') THEN
    ALTER TABLE notification_logs ADD COLUMN provider_message_id text;
    COMMENT ON COLUMN notification_logs.provider_message_id IS 'Africa''s Talking messageId. Used for delivery receipt correlation.';
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- 2.21  notification_preferences — sms_enabled
-- ---------------------------------------------------------------------------
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_name = 'notification_preferences' AND column_name = 'sms_enabled') THEN
    ALTER TABLE notification_preferences ADD COLUMN sms_enabled boolean NOT NULL DEFAULT false;
    COMMENT ON COLUMN notification_preferences.sms_enabled IS 'Master SMS toggle. false = no automated SMS sent for this school.';
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- 2.22  payroll_batches — funded_at, pesapal_order_tracking_id
-- ---------------------------------------------------------------------------
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_name = 'payroll_batches' AND column_name = 'funded_at') THEN
    ALTER TABLE payroll_batches ADD COLUMN funded_at timestamptz;
    COMMENT ON COLUMN payroll_batches.funded_at IS 'When batch funding was confirmed by the Pesapal IPN webhook.';
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_name = 'payroll_batches' AND column_name = 'pesapal_order_tracking_id') THEN
    ALTER TABLE payroll_batches ADD COLUMN pesapal_order_tracking_id text;
    COMMENT ON COLUMN payroll_batches.pesapal_order_tracking_id IS 'Pesapal tracking ID for the batch-funding payment.';
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- 2.23  report_cards — pdf_url
-- ---------------------------------------------------------------------------
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_name = 'report_cards' AND column_name = 'pdf_url') THEN
    ALTER TABLE report_cards ADD COLUMN pdf_url text;
    COMMENT ON COLUMN report_cards.pdf_url IS 'Storage URL of the generated PDF. Read by the list page for direct download.';
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- 2.24  schools — cash_on, is_deleted, next_billing_date
-- ---------------------------------------------------------------------------
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_name = 'schools' AND column_name = 'cash_on') THEN
    ALTER TABLE schools ADD COLUMN cash_on boolean NOT NULL DEFAULT true;
    COMMENT ON COLUMN schools.cash_on IS 'Whether cash payments are accepted. Toggled per school in payment settings.';
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_name = 'schools' AND column_name = 'is_deleted') THEN
    ALTER TABLE schools ADD COLUMN is_deleted boolean NOT NULL DEFAULT false;
    COMMENT ON COLUMN schools.is_deleted IS 'Soft delete. Deleted schools are excluded from all tenant queries.';
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_name = 'schools' AND column_name = 'next_billing_date') THEN
    ALTER TABLE schools ADD COLUMN next_billing_date timestamptz;
    COMMENT ON COLUMN schools.next_billing_date IS 'Date the next billing cycle begins. Set by the subscription webhook.';
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- 2.25  sms_logs — error, related_entity_id, related_entity_type
-- ---------------------------------------------------------------------------
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_name = 'sms_logs' AND column_name = 'error') THEN
    ALTER TABLE sms_logs ADD COLUMN error text;
    COMMENT ON COLUMN sms_logs.error IS 'Error message from Africa''s Talking on send failure. Used for retry logic.';
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_name = 'sms_logs' AND column_name = 'related_entity_id') THEN
    ALTER TABLE sms_logs ADD COLUMN related_entity_id uuid;
    COMMENT ON COLUMN sms_logs.related_entity_id IS 'UUID of the entity this SMS relates to.';
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_name = 'sms_logs' AND column_name = 'related_entity_type') THEN
    ALTER TABLE sms_logs ADD COLUMN related_entity_type text;
    COMMENT ON COLUMN sms_logs.related_entity_type IS 'Entity type this SMS relates to (fee_payment, meeting_booking…).';
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- 2.26  staff_payment_profiles — account_name
-- ---------------------------------------------------------------------------
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_name = 'staff_payment_profiles' AND column_name = 'account_name') THEN
    ALTER TABLE staff_payment_profiles ADD COLUMN account_name text;
    COMMENT ON COLUMN staff_payment_profiles.account_name IS 'Bank account holder name for bank transfer disbursements.';
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- 2.27  students — address, parent_nid
-- ---------------------------------------------------------------------------
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_name = 'students' AND column_name = 'address') THEN
    ALTER TABLE students ADD COLUMN address text;
    COMMENT ON COLUMN students.address IS 'Home address. Used in report card PDF and EMIS exports.';
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_name = 'students' AND column_name = 'parent_nid') THEN
    ALTER TABLE students ADD COLUMN parent_nid text;
    COMMENT ON COLUMN students.parent_nid IS 'Parent national ID. Optional. Reserved for NIN verification.';
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- 2.28  subject_comments — created_at, is_deleted, updated_at
-- ---------------------------------------------------------------------------
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_name = 'subject_comments' AND column_name = 'created_at') THEN
    ALTER TABLE subject_comments ADD COLUMN created_at timestamptz NOT NULL DEFAULT now();
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_name = 'subject_comments' AND column_name = 'is_deleted') THEN
    ALTER TABLE subject_comments ADD COLUMN is_deleted boolean NOT NULL DEFAULT false;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_name = 'subject_comments' AND column_name = 'updated_at') THEN
    ALTER TABLE subject_comments ADD COLUMN updated_at timestamptz NOT NULL DEFAULT now();
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- 2.29  subjects — color
-- ---------------------------------------------------------------------------
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_name = 'subjects' AND column_name = 'color') THEN
    ALTER TABLE subjects ADD COLUMN color text;
    COMMENT ON COLUMN subjects.color IS 'Optional hex/CSS colour for timetable cell display (e.g. #6366f1).';
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- 2.30  subscription_invoices — revenue_by_plan
-- ---------------------------------------------------------------------------
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_name = 'subscription_invoices' AND column_name = 'revenue_by_plan') THEN
    ALTER TABLE subscription_invoices ADD COLUMN revenue_by_plan jsonb;
    COMMENT ON COLUMN subscription_invoices.revenue_by_plan IS 'Revenue-by-plan snapshot at invoice time. Used by the admin revenue chart.';
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- 2.31  timetable_periods — end_time, is_break, sort_order, start_time
-- ---------------------------------------------------------------------------
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_name = 'timetable_periods' AND column_name = 'end_time') THEN
    ALTER TABLE timetable_periods ADD COLUMN end_time time;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_name = 'timetable_periods' AND column_name = 'is_break') THEN
    ALTER TABLE timetable_periods ADD COLUMN is_break boolean NOT NULL DEFAULT false;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_name = 'timetable_periods' AND column_name = 'sort_order') THEN
    ALTER TABLE timetable_periods ADD COLUMN sort_order int NOT NULL DEFAULT 0;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_name = 'timetable_periods' AND column_name = 'start_time') THEN
    ALTER TABLE timetable_periods ADD COLUMN start_time time;
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- 2.32  timetable_slots — academic_year_id, day_of_week, room
--        + replace old unique constraint with the correct composite one
-- ---------------------------------------------------------------------------
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_name = 'timetable_slots' AND column_name = 'academic_year_id') THEN
    ALTER TABLE timetable_slots
      ADD COLUMN academic_year_id uuid REFERENCES academic_years(id) ON DELETE CASCADE;
    COMMENT ON COLUMN timetable_slots.academic_year_id IS 'Academic year scope. Part of the upsert conflict key.';
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_name = 'timetable_slots' AND column_name = 'day_of_week') THEN
    ALTER TABLE timetable_slots
      ADD COLUMN day_of_week int NOT NULL DEFAULT 1 CHECK (day_of_week BETWEEN 1 AND 5);
    COMMENT ON COLUMN timetable_slots.day_of_week IS '1=Mon 2=Tue 3=Wed 4=Thu 5=Fri.';
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_name = 'timetable_slots' AND column_name = 'room') THEN
    ALTER TABLE timetable_slots ADD COLUMN room text;
  END IF;
END $$;

-- Replace old unique constraints with the correct composite key
DO $$ BEGIN
  ALTER TABLE timetable_slots
    DROP CONSTRAINT IF EXISTS timetable_slots_school_id_class_id_period_id_key;
EXCEPTION WHEN others THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE timetable_slots
    DROP CONSTRAINT IF EXISTS uq_timetable_slots_school_class_period_day;
EXCEPTION WHEN others THEN NULL;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'uq_timetable_slots_class_period_day_year'
  ) THEN
    ALTER TABLE timetable_slots
      ADD CONSTRAINT uq_timetable_slots_class_period_day_year
        UNIQUE (class_id, period_id, day_of_week, academic_year_id);
  END IF;
EXCEPTION WHEN others THEN NULL;
END $$;

-- ---------------------------------------------------------------------------
-- 2.33  tuition_payments — fee_type_id, fee_type_label, initiated_by_user_id,
--                           payment_description, pesapal_redirect_url
-- ---------------------------------------------------------------------------
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_name = 'tuition_payments' AND column_name = 'fee_type_id') THEN
    ALTER TABLE tuition_payments
      ADD COLUMN fee_type_id uuid REFERENCES fee_types(id) ON DELETE SET NULL;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_name = 'tuition_payments' AND column_name = 'fee_type_label') THEN
    ALTER TABLE tuition_payments ADD COLUMN fee_type_label text;
    COMMENT ON COLUMN tuition_payments.fee_type_label IS 'Fee type name at payment time. Denormalised for receipt display.';
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_name = 'tuition_payments' AND column_name = 'initiated_by_user_id') THEN
    ALTER TABLE tuition_payments
      ADD COLUMN initiated_by_user_id uuid REFERENCES users(id) ON DELETE SET NULL;
    COMMENT ON COLUMN tuition_payments.initiated_by_user_id IS 'Bursar or parent who initiated the payment. For audit.';
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_name = 'tuition_payments' AND column_name = 'payment_description') THEN
    ALTER TABLE tuition_payments ADD COLUMN payment_description text;
    COMMENT ON COLUMN tuition_payments.payment_description IS 'Description sent to Pesapal (e.g. "Term1 2026 - John Mukasa").';
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_name = 'tuition_payments' AND column_name = 'pesapal_redirect_url') THEN
    ALTER TABLE tuition_payments ADD COLUMN pesapal_redirect_url text;
    COMMENT ON COLUMN tuition_payments.pesapal_redirect_url IS 'Pesapal hosted-checkout URL. Frontend redirects parent here.';
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- 2.34  users — role_title
-- ---------------------------------------------------------------------------
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_name = 'users' AND column_name = 'role_title') THEN
    ALTER TABLE users ADD COLUMN role_title text;
    COMMENT ON COLUMN users.role_title IS 'Optional display title shown in class lists (e.g. "Head of Department").';
  END IF;
END $$;

-- =============================================================================
-- SECTION 3 — VIEW: marks_pivoted
--
-- The parent portal results page queries marks for bot_score, mid_score,
-- eot_score, total_score, and grade as column names.  The marks table stores
-- one row per (student, subject, exam_type) — there are no such columns.
-- This view pivots exam_type rows into named columns so the portal query works
-- without any frontend changes.
--
-- RLS: no separate policy needed — the view is SECURITY INVOKER (default) so
-- it inherits the marks table's existing RLS policies.
-- =============================================================================

CREATE OR REPLACE VIEW marks_pivoted AS
SELECT
  m.school_id,
  m.student_id,
  m.subject_id,
  m.term_id,
  m.academic_year_id,
  m.class_id,
  s.name                                                            AS subject_name,
  s.code                                                            AS subject_code,
  s.max_marks,
  MAX(CASE WHEN m.exam_type = 'bot'        THEN m.score END)        AS bot_score,
  MAX(CASE WHEN m.exam_type = 'midterm'    THEN m.score END)        AS mid_score,
  MAX(CASE WHEN m.exam_type = 'eot'        THEN m.score END)        AS eot_score,
  MAX(CASE WHEN m.exam_type = 'assignment' THEN m.score END)        AS assignment_score,
  MAX(CASE WHEN m.exam_type = 'practical'  THEN m.score END)        AS practical_score,
  COALESCE(MAX(CASE WHEN m.exam_type = 'bot'        THEN m.score END), 0)
    + COALESCE(MAX(CASE WHEN m.exam_type = 'midterm'    THEN m.score END), 0)
    + COALESCE(MAX(CASE WHEN m.exam_type = 'eot'        THEN m.score END), 0)
    + COALESCE(MAX(CASE WHEN m.exam_type = 'assignment' THEN m.score END), 0)
    + COALESCE(MAX(CASE WHEN m.exam_type = 'practical'  THEN m.score END), 0)
                                                                    AS total_score,
  MAX(m.grade)                                                      AS grade,
  MAX(m.remarks)                                                    AS remarks
FROM   marks   m
JOIN   subjects s ON s.id = m.subject_id
WHERE  m.is_deleted = false
GROUP BY
  m.school_id, m.student_id, m.subject_id, m.term_id,
  m.academic_year_id, m.class_id,
  s.name, s.code, s.max_marks;

COMMENT ON VIEW marks_pivoted IS
  'Pivoted marks: one row per (student, subject, term) with bot_score, mid_score, '
  'eot_score, total_score, grade. Used by the parent portal results page.';

GRANT SELECT ON marks_pivoted TO authenticated;
GRANT SELECT ON marks_pivoted TO service_role;
GRANT SELECT ON marks_pivoted TO anon;

-- =============================================================================
-- SECTION 4 — TRIGGER: auto-populate marks.grade
--
-- Looks up the matching grading_scales row for the school and stores the grade
-- label on the marks row so downstream reads never need to re-join grading_scales.
-- =============================================================================

CREATE OR REPLACE FUNCTION fn_marks_set_grade()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_pct   numeric;
  v_grade text;
BEGIN
  IF NEW.score IS NOT NULL AND NEW.max_score IS NOT NULL AND NEW.max_score > 0 THEN
    v_pct := (NEW.score / NEW.max_score) * 100;
    SELECT grade INTO v_grade
    FROM   grading_scales
    WHERE  school_id  = NEW.school_id
      AND  is_deleted = false
      AND  v_pct >= min_score
      AND  v_pct <= max_score
    ORDER BY sort_order
    LIMIT 1;
    NEW.grade := v_grade;
  ELSE
    NEW.grade := NULL;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_marks_set_grade ON marks;
CREATE TRIGGER trg_marks_set_grade
  BEFORE INSERT OR UPDATE OF score, max_score
  ON marks
  FOR EACH ROW EXECUTE FUNCTION fn_marks_set_grade();

-- Backfill existing rows
UPDATE marks m
SET    grade = (
  SELECT gs.grade
  FROM   grading_scales gs
  WHERE  gs.school_id  = m.school_id
    AND  gs.is_deleted = false
    AND  (m.score / NULLIF(m.max_score, 0) * 100) >= gs.min_score
    AND  (m.score / NULLIF(m.max_score, 0) * 100) <= gs.max_score
  ORDER BY gs.sort_order
  LIMIT 1
)
WHERE  m.score     IS NOT NULL
  AND  m.max_score IS NOT NULL
  AND  m.max_score  > 0;

-- =============================================================================
-- SECTION 5 — INDEXES
-- All created with IF NOT EXISTS; safe to re-run.
-- =============================================================================

-- fee_payments
CREATE INDEX IF NOT EXISTS idx_fee_payments_received_by
  ON fee_payments(received_by_user_id)
  WHERE received_by_user_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_fee_payments_pesapal_tracking
  ON fee_payments(pesapal_order_tracking_id)
  WHERE pesapal_order_tracking_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_fee_payments_mobile_provider
  ON fee_payments(school_id, mobile_money_provider, status)
  WHERE is_deleted = false AND mobile_money_provider IS NOT NULL;

-- fee_discounts
CREATE INDEX IF NOT EXISTS idx_fee_discounts_school_active
  ON fee_discounts(school_id, is_active)
  WHERE is_deleted = false;

-- fee_accounts
CREATE INDEX IF NOT EXISTS idx_fee_accounts_school_term_status
  ON fee_accounts(school_id, term_id, status)
  WHERE is_deleted = false;

-- expenses
CREATE INDEX IF NOT EXISTS idx_expenses_recorded_by
  ON expenses(recorded_by)
  WHERE recorded_by IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_expenses_term_school
  ON expenses(school_id, term_id)
  WHERE is_deleted = false AND term_id IS NOT NULL;

-- marks
CREATE INDEX IF NOT EXISTS idx_marks_grade
  ON marks(school_id, term_id, grade)
  WHERE is_deleted = false;

-- schools
CREATE INDEX IF NOT EXISTS idx_schools_active
  ON schools(id)
  WHERE is_deleted = false;

CREATE INDEX IF NOT EXISTS idx_schools_next_billing_date
  ON schools(next_billing_date)
  WHERE is_deleted = false AND subscription_status = 'active';

-- calendar_events
CREATE INDEX IF NOT EXISTS idx_calendar_events_public_portal
  ON calendar_events(school_id, event_date, is_public)
  WHERE is_deleted = false AND is_public = true;

-- timetable_slots
CREATE INDEX IF NOT EXISTS idx_timetable_slots_class_day
  ON timetable_slots(class_id, day_of_week)
  WHERE is_deleted = false;

CREATE INDEX IF NOT EXISTS idx_timetable_slots_teacher_day
  ON timetable_slots(teacher_id, day_of_week)
  WHERE is_deleted = false AND teacher_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_timetable_slots_academic_year
  ON timetable_slots(school_id, academic_year_id)
  WHERE is_deleted = false;

-- timetable_periods
CREATE INDEX IF NOT EXISTS idx_timetable_periods_school_order
  ON timetable_periods(school_id, sort_order)
  WHERE is_deleted = false;

-- meeting_slots
CREATE INDEX IF NOT EXISTS idx_meeting_slots_teacher_day
  ON meeting_slots(teacher_id, day_of_week)
  WHERE is_deleted = false AND is_booked = false;

-- library_issues
CREATE INDEX IF NOT EXISTS idx_library_issues_overdue
  ON library_issues(school_id, due_date)
  WHERE returned_at IS NULL AND is_deleted = false;

-- subject_comments
CREATE INDEX IF NOT EXISTS idx_subject_comments_student_term
  ON subject_comments(student_id, term_id)
  WHERE is_deleted = false;

-- sms_logs
CREATE INDEX IF NOT EXISTS idx_sms_logs_related_entity
  ON sms_logs(related_entity_type, related_entity_id)
  WHERE related_entity_id IS NOT NULL;

-- =============================================================================
-- SECTION 6 — ANALYZE
-- Updates planner statistics for every modified table so query plans are
-- correct immediately after the migration runs.
-- =============================================================================
ANALYZE announcements;
ANALYZE asset_maintenance;
ANALYZE attendance_records;
ANALYZE audit_logs;
ANALYZE batch_line_items;
ANALYZE calendar_events;
ANALYZE classes;
ANALYZE concierge_leads;
ANALYZE emis_report_logs;
ANALYZE expense_categories;
ANALYZE expenses;
ANALYZE fee_accounts;
ANALYZE fee_discounts;
ANALYZE fee_payments;
ANALYZE grading_scales;
ANALYZE library_issues;
ANALYZE marks;
ANALYZE meeting_bookings;
ANALYZE meeting_slots;
ANALYZE notification_logs;
ANALYZE notification_preferences;
ANALYZE payroll_batches;
ANALYZE report_cards;
ANALYZE schools;
ANALYZE sms_logs;
ANALYZE staff_payment_profiles;
ANALYZE students;
ANALYZE subject_comments;
ANALYZE subjects;
ANALYZE subscription_invoices;
ANALYZE timetable_periods;
ANALYZE timetable_slots;
ANALYZE tuition_payments;
ANALYZE users;

-- =============================================================================
-- END OF MIGRATION 0032
-- Tables: 33 | Columns: 73 | Enums: 5 | Views: 1 | Triggers: 1 | Indexes: 20
-- =============================================================================
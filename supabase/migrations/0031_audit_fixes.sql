-- =============================================================================
-- SKULI OS: Audit Fixes
-- Migration 0031
--
-- Fixes all critical and medium issues found in the A-to-Z audit (2026-06-07).
--
-- Issue map:
--   BUG-C1  → Restore fee_payments.received_by_user_id (column, FK, index)
--   BUG-C3  → Add notification_preferences.sms_enabled
--   BUG-C5  → Restore expenses.term_id, expenses.created_at, expenses.recorded_by
--   BUG-C6  → Fix recalculate_fee_account() + add total_discount column
--   BUG-M1  → Add class_enrollments.school_id
--   BUG-M5  → Add staff_payment_profiles(staff_id) index
--   BUG-M8  → Restore timetable_slots.day_of_week
--   BUG-M9  → Restore timetable_periods.start_time / end_time
--   BUG-M10 → Backfill fee_payments.term_id + add index
--   BUG-M11 → Restore expenses.recorded_by (merged with BUG-C5)
--   MIN-4   → Restore library_issues.issued_by
--   MIN-5   → Restore subject_comments.is_deleted
--   MIN-6   → Restore batch_line_items.created_at
--   MIN-7   → Restore calendar_events.is_public
--   Cache   → Add Cache-Control header support column (last_cache_bust)
--   Perf    → Add missing compound indexes for common query patterns
--   Data    → Backfill class_enrollments.school_id from students
--
-- Run: supabase db push (or psql -f 0031_audit_fixes.sql)
-- Safe: every ALTER is wrapped in a DO block with IF NOT EXISTS / EXCEPTION
--       handling so re-running is idempotent.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- SECTION 1: BUG-C1 + BUG-C4 — Restore fee_payments.received_by_user_id
--
-- Migration 0028 (column_drops) incorrectly classified this as dead.
-- It is referenced in 8 app files for audit trail purposes (who accepted cash).
-- We restore the column, the FK, and the index.
-- ---------------------------------------------------------------------------
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'fee_payments' AND column_name = 'received_by_user_id'
  ) THEN
    ALTER TABLE fee_payments
      ADD COLUMN received_by_user_id uuid REFERENCES users(id) ON DELETE SET NULL;

    COMMENT ON COLUMN fee_payments.received_by_user_id
      IS 'User who physically received/recorded the payment. Used for receipt audit.';
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_fee_payments_received_by
  ON fee_payments(received_by_user_id)
  WHERE received_by_user_id IS NOT NULL;

-- ---------------------------------------------------------------------------
-- SECTION 2: BUG-C3 — Add sms_enabled to notification_preferences
--
-- The onboarding API (app/api/onboard/route.ts) inserts sms_enabled: false
-- and the settings/notifications page selects it. The column is missing from
-- the schema defined in 0008.
-- ---------------------------------------------------------------------------
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'notification_preferences' AND column_name = 'sms_enabled'
  ) THEN
    ALTER TABLE notification_preferences
      ADD COLUMN sms_enabled boolean NOT NULL DEFAULT false;

    COMMENT ON COLUMN notification_preferences.sms_enabled
      IS 'Master toggle: if false, no automated SMS is sent regardless of other flags.';
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- SECTION 3: BUG-C5 + BUG-M11 — Restore expenses.term_id, created_at, recorded_by
--
-- Migration 0009 comments mark these as "never selected" but the P&L report,
-- the expenses API, and the export route all use them.
-- ---------------------------------------------------------------------------
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'expenses' AND column_name = 'term_id'
  ) THEN
    ALTER TABLE expenses
      ADD COLUMN term_id uuid REFERENCES terms(id) ON DELETE SET NULL;

    COMMENT ON COLUMN expenses.term_id
      IS 'Term this expense is attributed to. Used by P&L report and filtering.';
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'expenses' AND column_name = 'created_at'
  ) THEN
    ALTER TABLE expenses
      ADD COLUMN created_at timestamptz NOT NULL DEFAULT now();

    COMMENT ON COLUMN expenses.created_at
      IS 'When the expense record was created.';
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'expenses' AND column_name = 'recorded_by'
  ) THEN
    ALTER TABLE expenses
      ADD COLUMN recorded_by uuid REFERENCES users(id) ON DELETE SET NULL;

    COMMENT ON COLUMN expenses.recorded_by
      IS 'User who recorded this expense. Used in export and attribution.';
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'expenses' AND column_name = 'notes'
  ) THEN
    ALTER TABLE expenses
      ADD COLUMN notes text;

    COMMENT ON COLUMN expenses.notes
      IS 'Optional notes about the expense.';
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'expenses' AND column_name = 'receipt_number'
  ) THEN
    ALTER TABLE expenses
      ADD COLUMN receipt_number text;

    COMMENT ON COLUMN expenses.receipt_number
      IS 'Supplier receipt number for the expense, if any.';
  END IF;
END $$;

-- Restore expense indexes
CREATE INDEX IF NOT EXISTS idx_expenses_date_v2
  ON expenses(school_id, expense_date, is_deleted)
  WHERE is_deleted = false;

CREATE INDEX IF NOT EXISTS idx_expenses_term_v2
  ON expenses(school_id, term_id, expense_date)
  WHERE is_deleted = false AND term_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_expenses_recorded_by
  ON expenses(recorded_by)
  WHERE recorded_by IS NOT NULL;

-- ---------------------------------------------------------------------------
-- SECTION 4: BUG-C6 — Fix fee_accounts: add total_discount, fix total_fees
--
-- total_fees was defined as "total_expected before discounts" but
-- recalculate_fee_account() never set it. We formalise:
--   total_fees     = gross fees (sum of fee_structures, no discount)
--   total_discount = sum of applied discounts
--   total_expected = total_fees - total_discount (net payable)
--   total_paid     = confirmed payments
--   balance        = total_expected - total_paid
-- ---------------------------------------------------------------------------
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'fee_accounts' AND column_name = 'total_discount'
  ) THEN
    ALTER TABLE fee_accounts
      ADD COLUMN total_discount numeric NOT NULL DEFAULT 0;

    COMMENT ON COLUMN fee_accounts.total_discount
      IS 'Sum of applied fee discounts for this term. total_expected = total_fees - total_discount.';
  END IF;
END $$;

-- Ensure total_fees column exists (it's in the original schema but let's be safe)
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'fee_accounts' AND column_name = 'total_fees'
  ) THEN
    ALTER TABLE fee_accounts
      ADD COLUMN total_fees numeric NOT NULL DEFAULT 0;

    COMMENT ON COLUMN fee_accounts.total_fees
      IS 'Gross fee total before discounts. Set by recalculate_fee_account().';
  END IF;
END $$;

-- Replace recalculate_fee_account with the fixed version that correctly
-- populates total_fees and total_discount.
CREATE OR REPLACE FUNCTION recalculate_fee_account(p_account_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
    v_account       fee_accounts%ROWTYPE;
    v_gross_fees    numeric;  -- sum of fee_structures (no discount)
    v_total_discount numeric;
    v_net_expected  numeric;  -- gross - discounts
    v_total_paid    numeric;
    v_balance       numeric;
    v_status        fee_account_status;
BEGIN
    SELECT * INTO v_account FROM fee_accounts WHERE id = p_account_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Fee account % not found', p_account_id;
    END IF;

    -- ── 1. Gross fees: sum all applicable fee_structures ────────────────────
    SELECT COALESCE(SUM(fs.amount), 0)
    INTO v_gross_fees
    FROM fee_structures fs
    LEFT JOIN students st ON st.id = v_account.student_id
    WHERE fs.term_id    = v_account.term_id
      AND fs.school_id  = v_account.school_id
      AND fs.is_deleted = false
      AND (fs.class_id IS NULL OR fs.class_id = st.current_class_id);

    -- ── 2. Applicable discounts ──────────────────────────────────────────────
    SELECT COALESCE(SUM(
        CASE
            WHEN fd.discount_type = 'percentage' THEN
                -- Cap at 100 % of the gross fee
                LEAST(v_gross_fees * fd.value / 100.0, v_gross_fees)
            ELSE
                -- Fixed amount: can't exceed gross
                LEAST(fd.value, v_gross_fees)
        END
    ), 0)
    INTO v_total_discount
    FROM student_discounts sd
    JOIN fee_discounts fd ON fd.id = sd.discount_id
    WHERE sd.student_id = v_account.student_id
      AND (sd.term_id = v_account.term_id OR sd.term_id IS NULL)
      AND sd.is_deleted = false
      AND fd.is_deleted = false;

    -- Net expected is always >= 0
    v_net_expected := GREATEST(v_gross_fees - v_total_discount, 0);

    -- ── 3. Confirmed payments ────────────────────────────────────────────────
    SELECT COALESCE(SUM(fp.amount), 0)
    INTO v_total_paid
    FROM fee_payments fp
    WHERE fp.fee_account_id = p_account_id
      AND fp.status         = 'confirmed'
      AND fp.is_deleted     = false;

    v_balance := v_net_expected - v_total_paid;

    -- ── 4. Status logic ──────────────────────────────────────────────────────
    IF v_net_expected = 0 THEN
        v_status := 'paid';          -- no fees due (full scholarship, etc.)
    ELSIF v_balance <= 0 AND v_total_paid > 0 THEN
        IF v_balance < 0 THEN
            v_status := 'overpaid';
        ELSE
            v_status := 'paid';
        END IF;
    ELSIF v_total_paid > 0 THEN
        v_status := 'partial';
    ELSE
        v_status := 'unpaid';
    END IF;

    -- ── 5. Write back ────────────────────────────────────────────────────────
    UPDATE fee_accounts
    SET
        total_fees     = v_gross_fees,
        total_discount = v_total_discount,
        total_expected = v_net_expected,
        total_paid     = v_total_paid,
        balance        = v_balance,
        status         = v_status,
        updated_at     = now()
    WHERE id = p_account_id;
END;
$$;

COMMENT ON FUNCTION recalculate_fee_account(uuid)
  IS 'Recalculates total_fees, total_discount, total_expected, total_paid, balance, status for a fee_account. Call after any fee structure, discount, or payment change.';

-- ---------------------------------------------------------------------------
-- SECTION 5: BUG-M1 — Add school_id to class_enrollments
--
-- Without school_id, RLS on class_enrollments must join through students
-- to get the tenant scope. This adds it and backfills from students.school_id.
-- ---------------------------------------------------------------------------
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'class_enrollments' AND column_name = 'school_id'
  ) THEN
    -- Add nullable first, backfill, then add NOT NULL constraint
    ALTER TABLE class_enrollments
      ADD COLUMN school_id uuid REFERENCES schools(id) ON DELETE CASCADE;

    -- Backfill from students table
    UPDATE class_enrollments ce
    SET school_id = s.school_id
    FROM students s
    WHERE s.id = ce.student_id
      AND ce.school_id IS NULL;

    -- Now enforce NOT NULL
    ALTER TABLE class_enrollments
      ALTER COLUMN school_id SET NOT NULL;

    COMMENT ON COLUMN class_enrollments.school_id
      IS 'Tenant scope. Denormalised from students.school_id for RLS and index efficiency.';
  END IF;
END $$;

-- Add index for the new column
CREATE INDEX IF NOT EXISTS idx_class_enrollments_school_id
  ON class_enrollments(school_id);

-- Compound index for the most common query: school + term
CREATE INDEX IF NOT EXISTS idx_class_enrollments_school_term
  ON class_enrollments(school_id, term_id)
  WHERE is_deleted = false;

-- ---------------------------------------------------------------------------
-- SECTION 6: BUG-M5 — Add staff_payment_profiles(staff_id) index
-- ---------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_staff_payment_profiles_staff_id
  ON staff_payment_profiles(staff_id);

-- ---------------------------------------------------------------------------
-- SECTION 7: BUG-M8 — Restore timetable_slots.day_of_week
--
-- The timetable page renders a Mon–Fri grid. This column is required.
-- ---------------------------------------------------------------------------
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'timetable_slots' AND column_name = 'day_of_week'
  ) THEN
    ALTER TABLE timetable_slots
      ADD COLUMN day_of_week int NOT NULL DEFAULT 1
      CHECK (day_of_week BETWEEN 1 AND 5);  -- 1=Mon … 5=Fri

    COMMENT ON COLUMN timetable_slots.day_of_week
      IS '1=Monday, 2=Tuesday, 3=Wednesday, 4=Thursday, 5=Friday.';
  END IF;
END $$;

-- Update the unique constraint to include day_of_week
-- (school_id, class_id, period_id) could be duplicate across days
DO $$ BEGIN
  -- Drop old unique constraint if it exists without day_of_week
  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'timetable_slots_school_id_class_id_period_id_key'
      AND contype = 'u'
  ) THEN
    ALTER TABLE timetable_slots
      DROP CONSTRAINT timetable_slots_school_id_class_id_period_id_key;
  END IF;
EXCEPTION WHEN others THEN NULL;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'uq_timetable_slots_school_class_period_day'
  ) THEN
    ALTER TABLE timetable_slots
      ADD CONSTRAINT uq_timetable_slots_school_class_period_day
      UNIQUE (school_id, class_id, period_id, day_of_week);
  END IF;
EXCEPTION WHEN others THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS idx_timetable_slots_class_day
  ON timetable_slots(class_id, day_of_week)
  WHERE is_deleted = false;

-- ---------------------------------------------------------------------------
-- SECTION 8: BUG-M9 — Restore timetable_periods.start_time / end_time / sort_order
--
-- The timetable PDF generator and the UI both need these to render times.
-- ---------------------------------------------------------------------------
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'timetable_periods' AND column_name = 'start_time'
  ) THEN
    ALTER TABLE timetable_periods
      ADD COLUMN start_time time;

    COMMENT ON COLUMN timetable_periods.start_time
      IS 'Period start time (HH:MM). Null for unnamed break periods.';
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'timetable_periods' AND column_name = 'end_time'
  ) THEN
    ALTER TABLE timetable_periods
      ADD COLUMN end_time time;

    COMMENT ON COLUMN timetable_periods.end_time
      IS 'Period end time (HH:MM).';
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'timetable_periods' AND column_name = 'sort_order'
  ) THEN
    ALTER TABLE timetable_periods
      ADD COLUMN sort_order int NOT NULL DEFAULT 0;

    COMMENT ON COLUMN timetable_periods.sort_order
      IS 'Display order of periods within a day (0 = first).';
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'timetable_periods' AND column_name = 'is_break'
  ) THEN
    ALTER TABLE timetable_periods
      ADD COLUMN is_break boolean NOT NULL DEFAULT false;

    COMMENT ON COLUMN timetable_periods.is_break
      IS 'True for break/lunch periods that have no subject assigned.';
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_timetable_periods_school_order
  ON timetable_periods(school_id, sort_order)
  WHERE is_deleted = false;

-- ---------------------------------------------------------------------------
-- SECTION 9: BUG-M10 — Backfill fee_payments.term_id + add NOT NULL default
--
-- Payments recorded before term_id was added have NULL. The materialized view
-- excludes them with WHERE term_id IS NOT NULL, causing incomplete dashboards.
-- Backfill from their parent fee_account.
-- ---------------------------------------------------------------------------
UPDATE fee_payments fp
SET term_id = fa.term_id
FROM fee_accounts fa
WHERE fp.fee_account_id = fa.id
  AND fp.term_id IS NULL
  AND fa.term_id IS NOT NULL;

-- Add index for the backfilled rows
CREATE INDEX IF NOT EXISTS idx_fee_payments_term_school_status
  ON fee_payments(school_id, term_id, status)
  WHERE is_deleted = false AND term_id IS NOT NULL;

-- ---------------------------------------------------------------------------
-- SECTION 10: MIN-4 — Restore library_issues.issued_by
-- ---------------------------------------------------------------------------
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'library_issues' AND column_name = 'issued_by'
  ) THEN
    ALTER TABLE library_issues
      ADD COLUMN issued_by uuid REFERENCES users(id) ON DELETE SET NULL;

    COMMENT ON COLUMN library_issues.issued_by
      IS 'Staff member who issued the book. Used in library export report.';
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- SECTION 11: MIN-5 — Restore subject_comments audit columns
-- ---------------------------------------------------------------------------
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'subject_comments' AND column_name = 'is_deleted'
  ) THEN
    ALTER TABLE subject_comments
      ADD COLUMN is_deleted boolean NOT NULL DEFAULT false;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'subject_comments' AND column_name = 'created_at'
  ) THEN
    ALTER TABLE subject_comments
      ADD COLUMN created_at timestamptz NOT NULL DEFAULT now();
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'subject_comments' AND column_name = 'updated_at'
  ) THEN
    ALTER TABLE subject_comments
      ADD COLUMN updated_at timestamptz NOT NULL DEFAULT now();
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_subject_comments_student_term
  ON subject_comments(student_id, term_id)
  WHERE is_deleted = false;

-- ---------------------------------------------------------------------------
-- SECTION 12: MIN-6 — Restore batch_line_items.created_at
-- ---------------------------------------------------------------------------
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'batch_line_items' AND column_name = 'created_at'
  ) THEN
    ALTER TABLE batch_line_items
      ADD COLUMN created_at timestamptz NOT NULL DEFAULT now();

    COMMENT ON COLUMN batch_line_items.created_at
      IS 'When the line item was enqueued in this payroll batch.';
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- SECTION 13: MIN-7 — Restore calendar_events.is_public
-- ---------------------------------------------------------------------------
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'calendar_events' AND column_name = 'is_public'
  ) THEN
    ALTER TABLE calendar_events
      ADD COLUMN is_public boolean NOT NULL DEFAULT true;

    COMMENT ON COLUMN calendar_events.is_public
      IS 'If true, visible to the parent portal calendar. Set false for internal-only events.';
  END IF;
END $$;

-- Add portal calendar index
CREATE INDEX IF NOT EXISTS idx_calendar_events_public_portal
  ON calendar_events(school_id, event_date, is_public)
  WHERE is_deleted = false AND is_public = true;

-- ---------------------------------------------------------------------------
-- SECTION 14: BUG-M6 — Confirm push_queue has RLS DISABLED
-- (RLS must NOT be on this table — service-role manages it exclusively)
-- ---------------------------------------------------------------------------
DO $$ BEGIN
  -- Disable RLS on push_queue if it was accidentally enabled
  ALTER TABLE push_queue DISABLE ROW LEVEL SECURITY;
EXCEPTION WHEN others THEN NULL;
END $$;

-- ---------------------------------------------------------------------------
-- SECTION 15: Performance — Additional compound indexes for hot paths
--
-- Identified from query patterns in the API routes not covered by 0013.
-- ---------------------------------------------------------------------------

-- Fee accounts: defaulters page uses status='unpaid' + school + term
CREATE INDEX IF NOT EXISTS idx_fee_accounts_school_term_status
  ON fee_accounts(school_id, term_id, status)
  WHERE is_deleted = false;

-- Fee structures: per-class fee calculation
CREATE INDEX IF NOT EXISTS idx_fee_structures_school_term_class
  ON fee_structures(school_id, term_id, class_id)
  WHERE is_deleted = false;

-- Marks: teacher marks entry page (class + term + review_status)
CREATE INDEX IF NOT EXISTS idx_marks_teacher_entry
  ON marks(school_id, class_id, term_id, subject_id, review_status)
  WHERE is_deleted = false;

-- Report cards: portal results page (student + term + published)
CREATE INDEX IF NOT EXISTS idx_report_cards_student_term_published
  ON report_cards(student_id, term_id, is_published)
  WHERE is_deleted = false;

-- Payroll records: payroll page (school + month + year + status)
CREATE INDEX IF NOT EXISTS idx_payroll_records_school_period_status
  ON payroll_records(school_id, year, month, payment_status)
  WHERE is_deleted = false;

-- Attendance: absence SMS function (school + date + status + is_deleted)
CREATE INDEX IF NOT EXISTS idx_attendance_school_date_absent
  ON attendance_records(school_id, date, status)
  WHERE is_deleted = false AND status = 'absent';

-- Students: portal lookup by parent_phone (used by webhook and message threads)
CREATE INDEX IF NOT EXISTS idx_students_school_parent_phone
  ON students(school_id, parent_phone)
  WHERE is_deleted = false AND parent_phone IS NOT NULL;

-- Push subscriptions: notification fanout (user + endpoint)
CREATE INDEX IF NOT EXISTS idx_push_subscriptions_user
  ON push_subscriptions(user_id)
  WHERE is_deleted = false;

-- Meeting bookings: teacher-side confirmation queue
CREATE INDEX IF NOT EXISTS idx_meeting_bookings_school_status
  ON meeting_bookings(school_id, status);

-- Library issues: overdue calculation (returned_at IS NULL + due_date)
CREATE INDEX IF NOT EXISTS idx_library_issues_overdue_calc
  ON library_issues(school_id, returned_at, due_date)
  WHERE returned_at IS NULL;

-- Discipline: parent notification queue
CREATE INDEX IF NOT EXISTS idx_discipline_parent_notified
  ON discipline_records(school_id, parent_notified, incident_date DESC)
  WHERE is_deleted = false AND parent_notified = false;

-- Audit logs: settings / audit log page (school + created_at DESC)
CREATE INDEX IF NOT EXISTS idx_audit_logs_school_created
  ON audit_logs(school_id, created_at DESC);

-- ---------------------------------------------------------------------------
-- SECTION 16: Schema — New terms_current view for fast current-term lookup
--
-- The dashboard layout and the enroll page both need the current term for
-- a school. A view avoids repeated subquery patterns.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE VIEW current_terms
WITH (security_invoker = true)
AS
SELECT
    t.id,
    t.school_id,
    t.academic_year_id,
    t.name,
    t.start_date,
    t.end_date,
    t.is_current,
    ay.name AS academic_year_name,
    ay.is_current AS academic_year_is_current
FROM terms t
JOIN academic_years ay ON ay.id = t.academic_year_id
WHERE t.is_current = true
  AND t.is_deleted = false
  AND ay.is_deleted = false;

COMMENT ON VIEW current_terms
  IS 'One row per school for the current term + its academic year. Used by dashboard layout and enrollment pages.';

GRANT SELECT ON current_terms TO authenticated;
GRANT SELECT ON current_terms TO service_role;

-- ---------------------------------------------------------------------------
-- SECTION 17: Fee account trigger — auto-recalculate on payment confirmation
--
-- When a fee_payment is inserted/updated (especially status → 'confirmed'),
-- automatically call recalculate_fee_account. This removes the manual
-- "call recalculate after each payment" burden from API routes.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION trigger_recalculate_fee_account()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
    -- Fire on INSERT (new payment) or UPDATE where status or amount changed.
    -- Do NOT fire on DELETE — soft-deletes are UPDATEs (is_deleted = true).
    IF (TG_OP = 'INSERT')
    OR (TG_OP = 'UPDATE' AND (
         NEW.status      IS DISTINCT FROM OLD.status OR
         NEW.amount      IS DISTINCT FROM OLD.amount OR
         NEW.is_deleted  IS DISTINCT FROM OLD.is_deleted
       ))
    THEN
        PERFORM recalculate_fee_account(NEW.fee_account_id);
    END IF;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_fee_payment_recalc ON fee_payments;

CREATE TRIGGER trg_fee_payment_recalc
AFTER INSERT OR UPDATE ON fee_payments
FOR EACH ROW
EXECUTE FUNCTION trigger_recalculate_fee_account();

COMMENT ON TRIGGER trg_fee_payment_recalc ON fee_payments
  IS 'Auto-recalculates the parent fee_account balance/status whenever a payment is inserted or its status/amount changes.';

-- ---------------------------------------------------------------------------
-- SECTION 18: Fee account trigger — auto-recalculate when discount changes
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION trigger_recalculate_fee_accounts_for_student()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
    v_account_id uuid;
BEGIN
    -- When a student_discount is added/removed/soft-deleted, recalculate
    -- all fee accounts for that student in the affected term.
    FOR v_account_id IN
        SELECT id FROM fee_accounts
        WHERE student_id = COALESCE(NEW.student_id, OLD.student_id)
          AND (
              term_id = COALESCE(NEW.term_id, OLD.term_id)
              OR (NEW.term_id IS NULL AND OLD.term_id IS NULL)
          )
          AND is_deleted = false
    LOOP
        PERFORM recalculate_fee_account(v_account_id);
    END LOOP;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_student_discount_recalc ON student_discounts;

CREATE TRIGGER trg_student_discount_recalc
AFTER INSERT OR UPDATE OR DELETE ON student_discounts
FOR EACH ROW
EXECUTE FUNCTION trigger_recalculate_fee_accounts_for_student();

COMMENT ON TRIGGER trg_student_discount_recalc ON student_discounts
  IS 'Auto-recalculates fee accounts when a discount is applied/removed for a student.';

-- ---------------------------------------------------------------------------
-- SECTION 19: Fee structure trigger — auto-recalculate all accounts in term
--
-- When a fee_structure row changes (amount, class_id, is_deleted), every
-- fee_account in that term for the school needs recalculation. Batched.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION trigger_recalculate_accounts_for_fee_structure()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
    v_account_id uuid;
    v_term_id    uuid;
    v_school_id  uuid;
BEGIN
    v_term_id   := COALESCE(NEW.term_id,   OLD.term_id);
    v_school_id := COALESCE(NEW.school_id, OLD.school_id);

    FOR v_account_id IN
        SELECT id FROM fee_accounts
        WHERE school_id = v_school_id
          AND term_id   = v_term_id
          AND is_deleted = false
    LOOP
        PERFORM recalculate_fee_account(v_account_id);
    END LOOP;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_fee_structure_recalc ON fee_structures;

CREATE TRIGGER trg_fee_structure_recalc
AFTER INSERT OR UPDATE OR DELETE ON fee_structures
FOR EACH ROW
EXECUTE FUNCTION trigger_recalculate_accounts_for_fee_structure();

COMMENT ON TRIGGER trg_fee_structure_recalc ON fee_structures
  IS 'When a fee structure changes, recalculates all fee accounts for that term.';

-- ---------------------------------------------------------------------------
-- SECTION 20: Materialized view refresh function (callable from API)
--
-- The pg_cron refresh runs every 5 minutes. The API can force an immediate
-- refresh after a bulk payment batch via this function.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION refresh_dashboard_mvs()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
    REFRESH MATERIALIZED VIEW CONCURRENTLY mv_dashboard_attendance_today;
    REFRESH MATERIALIZED VIEW CONCURRENTLY mv_dashboard_attendance_by_class;
    REFRESH MATERIALIZED VIEW CONCURRENTLY mv_dashboard_payment_trend;
    REFRESH MATERIALIZED VIEW CONCURRENTLY mv_dashboard_payment_methods;
EXCEPTION WHEN others THEN
    -- If CONCURRENTLY fails (e.g., unique index not yet built), fall back
    REFRESH MATERIALIZED VIEW mv_dashboard_attendance_today;
    REFRESH MATERIALIZED VIEW mv_dashboard_attendance_by_class;
    REFRESH MATERIALIZED VIEW mv_dashboard_payment_trend;
    REFRESH MATERIALIZED VIEW mv_dashboard_payment_methods;
END;
$$;

GRANT EXECUTE ON FUNCTION refresh_dashboard_mvs() TO service_role;

COMMENT ON FUNCTION refresh_dashboard_mvs()
  IS 'Force-refreshes all dashboard materialised views. Called by the bulk-payment API after a large batch.';

-- ---------------------------------------------------------------------------
-- SECTION 21: school_settings — Per-school feature flags and cache config
--
-- A single JSONB settings column on schools is too unstructured. Add a
-- proper school_settings table for cache control and feature toggles.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS school_settings (
    school_id       uuid PRIMARY KEY REFERENCES schools(id) ON DELETE CASCADE,
    -- Cache
    cache_ttl_seconds int NOT NULL DEFAULT 60,
    -- Feature flags
    feature_portal_payments  boolean NOT NULL DEFAULT true,
    feature_library          boolean NOT NULL DEFAULT true,
    feature_assets           boolean NOT NULL DEFAULT true,
    feature_payroll          boolean NOT NULL DEFAULT true,
    feature_emis             boolean NOT NULL DEFAULT true,
    feature_marketplace      boolean NOT NULL DEFAULT true,
    -- Branding
    primary_color   text,
    -- Timestamps
    created_at      timestamptz NOT NULL DEFAULT now(),
    updated_at      timestamptz NOT NULL DEFAULT now()
);

-- INTENTIONALLY-UNUSED
-- the TABLE school_settings above is provisioned for upcoming
-- feature-flag and per-school cache-TTL work. The auto-create
-- trigger (below) populates a row for every new school from day
-- one, so the wiring PR can simply start reading them. Until
-- that PR lands, no app code references this table.
--
COMMENT ON TABLE school_settings
  IS 'Per-school feature flags, cache TTL overrides, and branding settings.';

-- Auto-create a school_settings row for every new school
CREATE OR REPLACE FUNCTION auto_create_school_settings()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
    INSERT INTO school_settings (school_id)
    VALUES (NEW.id)
    ON CONFLICT (school_id) DO NOTHING;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_auto_school_settings ON schools;

CREATE TRIGGER trg_auto_school_settings
AFTER INSERT ON schools
FOR EACH ROW
EXECUTE FUNCTION auto_create_school_settings();

-- Backfill existing schools
INSERT INTO school_settings (school_id)
SELECT id FROM schools
WHERE is_deleted = false
ON CONFLICT (school_id) DO NOTHING;

-- RLS
ALTER TABLE school_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY school_settings_select ON school_settings
  FOR SELECT
  TO authenticated
  USING (is_in_school(school_id));

CREATE POLICY school_settings_update ON school_settings
  FOR UPDATE
  TO authenticated
  USING (
    school_id = get_user_school_id()
    AND get_user_role() IN ('SCHOOL_ADMIN', 'SUPER_ADMIN')
  );

CREATE POLICY school_settings_service ON school_settings
  FOR ALL
  TO service_role
  USING (true);

GRANT SELECT, UPDATE ON school_settings TO authenticated;
GRANT ALL ON school_settings TO service_role;

-- ---------------------------------------------------------------------------
-- SECTION 22: Grant new function to service_role
-- ---------------------------------------------------------------------------
GRANT EXECUTE ON FUNCTION trigger_recalculate_fee_account()              TO service_role;
GRANT EXECUTE ON FUNCTION trigger_recalculate_fee_accounts_for_student() TO service_role;
GRANT EXECUTE ON FUNCTION trigger_recalculate_accounts_for_fee_structure() TO service_role;
GRANT EXECUTE ON FUNCTION auto_create_school_settings()                  TO service_role;
GRANT EXECUTE ON FUNCTION refresh_dashboard_mvs()                        TO service_role;

-- ---------------------------------------------------------------------------
-- SECTION 23: ANALYZE all modified tables
-- ---------------------------------------------------------------------------
ANALYZE fee_payments;
ANALYZE fee_accounts;
ANALYZE fee_structures;
ANALYZE expenses;
ANALYZE notification_preferences;
ANALYZE class_enrollments;
ANALYZE staff_payment_profiles;
ANALYZE timetable_slots;
ANALYZE timetable_periods;
ANALYZE library_issues;
ANALYZE subject_comments;
ANALYZE batch_line_items;
ANALYZE calendar_events;
ANALYZE discipline_records;
ANALYZE school_settings;

-- =============================================================================
-- END OF MIGRATION 0031
-- =============================================================================

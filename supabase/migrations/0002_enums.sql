-- =============================================================================
-- SKULI SaaS: Enum Types
-- Migration 0002
--
-- All 30 enums in one place. Storage values are lowercase and use the
-- exact set the app writes — TS types that include UPPERCASE variants
-- (e.g. CONCIERGE, BANK_TRANSFER) are decorative and never reach the DB.
--
-- discipline_incident_type: union of 00001 (misconduct/absence/violence/
-- cheating/vandalism/other) and 00034 (verbal_warning/written_warning/
-- detention/suspension/parent_called/referred_to_head/other). The
-- discipline_records.incident_type column itself is `text` (per 00034's
-- fix), so the enum is advisory. We still define it for documentation.
-- =============================================================================

DO $$ BEGIN

  -- ── Core user / school ─────────────────────────────────────────────────────

  CREATE TYPE user_role AS ENUM (
      'SUPER_ADMIN',
      'SCHOOL_ADMIN',
      'BURSAR',
      'TEACHER',
      'PARENT',
      'GROUP_ADMIN'
  );

  CREATE TYPE school_type AS ENUM (
      'nursery',
      'primary',
      'secondary',
      'both'
  );

  CREATE TYPE subscription_plan AS ENUM (
      'trial',
      'starter',
      'growth',
      'pro'
  );

  CREATE TYPE subscription_status AS ENUM (
      'active',
      'past_due',
      'cancelled',
      'trial'
  );

  -- ── Academic ───────────────────────────────────────────────────────────────

  CREATE TYPE student_status AS ENUM (
      'active',
      'left',
      'graduated'
  );

  CREATE TYPE term_name AS ENUM (
      'Term1',
      'Term2',
      'Term3'
  );

  CREATE TYPE exam_type AS ENUM (
      'bot',
      'midterm',
      'eot',
      'assignment',
      'practical'
  );

  CREATE TYPE attendance_status AS ENUM (
      'present',
      'absent',
      'late',
      'excused'
  );

  CREATE TYPE conduct_grade AS ENUM (
      'A',
      'B',
      'C',
      'D'
  );

  CREATE TYPE report_card_status AS ENUM (
      'not_started',
      'draft',
      'submitted',
      'approved'
  );

  -- ── Fees & Payments ────────────────────────────────────────────────────────

  CREATE TYPE payment_method AS ENUM (
      'mobile_money',
      'cash',
      'bank',
      'waiver'
  );

  CREATE TYPE mm_provider AS ENUM (
      'mtn',
      'airtel'
  );

  CREATE TYPE payment_status AS ENUM (
      'pending',
      'confirmed',
      'failed',
      'reversed'
  );

  CREATE TYPE fee_account_status AS ENUM (
      'paid',
      'partial',
      'unpaid',
      'overpaid'
  );

  CREATE TYPE discount_type AS ENUM (
      'percentage',
      'fixed_amount'
  );

  -- ── Expenses ───────────────────────────────────────────────────────────────

  CREATE TYPE expense_payment_method AS ENUM (
      'cash',
      'bank',
      'mobile_money',
      'cheque'
  );

  -- ── Communication ──────────────────────────────────────────────────────────

  CREATE TYPE announcement_target AS ENUM (
      'all',
      'class',
      'defaulters',
      'custom'
  );

  CREATE TYPE sms_channel AS ENUM (
      'sms',
      'email',
      'in_app'
  );

  CREATE TYPE sms_status AS ENUM (
      'pending',
      'sent',
      'delivered',
      'failed'
  );

  -- ── Payroll ────────────────────────────────────────────────────────────────

  CREATE TYPE payroll_payment_status AS ENUM (
      'pending',
      'paid'
  );

  -- ── Discipline ─────────────────────────────────────────────────────────────
  -- Union of 00001 + 00034. discipline_records.incident_type is `text` so
  -- the enum is advisory — but the app may rely on it for type casting.

  CREATE TYPE discipline_incident_type AS ENUM (
      'misconduct',
      'absence',
      'violence',
      'cheating',
      'vandalism',
      'other',
      'verbal_warning',
      'written_warning',
      'detention',
      'suspension',
      'parent_called',
      'referred_to_head'
  );

  -- ── Assets ─────────────────────────────────────────────────────────────────

  CREATE TYPE asset_condition AS ENUM (
      'excellent',
      'good',
      'fair',
      'poor',
      'written_off'
  );

  -- ── Concierge ──────────────────────────────────────────────────────────────

  CREATE TYPE concierge_status AS ENUM (
      'new',
      'contacted',
      'in_progress',
      'completed',
      'cancelled'
  );

  -- ── Pesapal / Payroll Disbursement ─────────────────────────────────────────

  CREATE TYPE pesapal_payment_status AS ENUM (
      'PENDING',
      'COMPLETED',
      'FAILED',
      'REVERSED'
  );

  CREATE TYPE payroll_funding_status AS ENUM (
      'AWAITING_EXTERNAL_FUNDING',
      'SUCCESS',
      'FAILED'
  );

  CREATE TYPE payroll_funding_mechanism AS ENUM (
      'BANK_COLLECT',
      'MOMO_PUSH'
  );

  CREATE TYPE disbursal_status AS ENUM (
      'HOLD_UNTIL_FUNDED',
      'QUEUED',
      'SUCCESS',
      'FAILED'
  );

  CREATE TYPE staff_payout_method AS ENUM (
      'MOBILE_MONEY',
      'BANK',
      'CASH'
  );

  CREATE TYPE notification_channel AS ENUM (
      'IN_APP',
      'SMS',
      'EMAIL',
      'PUSH'
  );

  -- ── Template Marketplace ───────────────────────────────────────────────────

  CREATE TYPE marketplace_category AS ENUM (
      'sms_template',
      'fee_structure',
      'report_comment'
  );

EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

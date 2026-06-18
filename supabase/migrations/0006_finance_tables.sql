-- =============================================================================
-- SKULI SaaS: Finance Tables
-- Migration 0006
--
-- fee_structures, fee_types, fee_accounts, fee_payments,
-- fee_discounts, student_discounts, fee_structure_audit_log.
--
-- Dead columns removed (per reconciliation report section D):
--   * fee_structures.is_mandatory        — never selected by app
--   * fee_discounts.max_amount           — never selected
--   * fee_discounts.is_recurring         — never selected
--   * fee_discounts.description/is_active — never selected
--   * student_discounts.note             — never selected
--   * student_discounts.approved_by      — never selected
--
-- Note: 00020 originally added `is_recurring boolean DEFAULT true`
-- to fee_discounts; 00034 changed the default to `false`. The column
-- is being removed entirely per the dead-column audit.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. fee_structures
-- ---------------------------------------------------------------------------
CREATE TABLE fee_structures (
    id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    school_id   uuid NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
    term_id     uuid NOT NULL REFERENCES terms(id) ON DELETE CASCADE,
    class_id    uuid REFERENCES classes(id) ON DELETE SET NULL,
    name        text NOT NULL,
    amount      numeric NOT NULL,
    frequency   text,
    created_at  timestamptz NOT NULL DEFAULT now(),
    updated_at  timestamptz NOT NULL DEFAULT now(),
    is_deleted  boolean NOT NULL DEFAULT false
);

-- ---------------------------------------------------------------------------
-- 2. fee_types
-- ---------------------------------------------------------------------------
CREATE TABLE fee_types (
    id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    school_id   uuid NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
    name        text NOT NULL,
    description text,
    is_active   boolean NOT NULL DEFAULT true,
    is_deleted  boolean NOT NULL DEFAULT false,
    created_at  timestamptz NOT NULL DEFAULT now(),
    updated_at  timestamptz NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------------
-- 3. fee_accounts
-- ---------------------------------------------------------------------------
CREATE TABLE fee_accounts (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    school_id       uuid NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
    student_id      uuid NOT NULL REFERENCES students(id) ON DELETE CASCADE,
    term_id         uuid NOT NULL REFERENCES terms(id) ON DELETE CASCADE,
    academic_year_id uuid NOT NULL REFERENCES academic_years(id) ON DELETE CASCADE,
    total_expected  numeric NOT NULL DEFAULT 0,
    total_paid      numeric NOT NULL DEFAULT 0,
    total_fees      numeric NOT NULL DEFAULT 0,
    total_discount  numeric NOT NULL DEFAULT 0,
    balance         numeric NOT NULL DEFAULT 0,
    status          fee_account_status NOT NULL DEFAULT 'unpaid',
    created_at      timestamptz NOT NULL DEFAULT now(),
    updated_at      timestamptz NOT NULL DEFAULT now(),
    is_deleted      boolean NOT NULL DEFAULT false,
    UNIQUE (student_id, term_id)
);
COMMENT ON COLUMN fee_accounts.total_fees     IS 'Gross fees before discounts. Set by recalculate_fee_account().';
COMMENT ON COLUMN fee_accounts.total_discount IS 'Sum of applied discounts. total_expected = total_fees - total_discount.';

-- ---------------------------------------------------------------------------
-- 4. fee_payments
--    term_id column added (00059) so dashboard trend/method aggregates
--    can filter by term directly without a fee_accounts join.
--    mobile_money_provider / phone_used / received_by_user_id dropped
--    (dead columns, section D).
-- ---------------------------------------------------------------------------
CREATE TABLE fee_payments (
    id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    school_id               uuid NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
    fee_account_id          uuid NOT NULL REFERENCES fee_accounts(id) ON DELETE CASCADE,
    student_id              uuid NOT NULL REFERENCES students(id) ON DELETE CASCADE,
    term_id                 uuid REFERENCES terms(id) ON DELETE SET NULL,
    amount                  numeric NOT NULL,
    payment_method          payment_method NOT NULL,
    mobile_money_transaction_id text,
    mobile_money_provider   text CHECK (mobile_money_provider IN ('mtn', 'airtel')),
    phone_used              text,
    pesapal_order_tracking_id text,
    pesapal_tx_id           text,
    received_by_user_id     uuid REFERENCES users(id) ON DELETE SET NULL,
    payment_date            date NOT NULL DEFAULT current_date,
    notes                   text,
    receipt_number          text,
    status                  payment_status NOT NULL DEFAULT 'pending',
    created_at              timestamptz NOT NULL DEFAULT now(),
    updated_at              timestamptz NOT NULL DEFAULT now(),
    is_deleted              boolean NOT NULL DEFAULT false
);
COMMENT ON COLUMN fee_payments.mobile_money_provider IS 'Mobile money network (mtn/airtel) from detectMobileMoneyProvider(). Lowercase only.';
COMMENT ON COLUMN fee_payments.received_by_user_id   IS 'Staff who recorded/received the payment. Audit trail.';

-- ---------------------------------------------------------------------------
-- 5. fee_discounts
-- ---------------------------------------------------------------------------
-- discount_type is text + CHECK (not the discount_type enum) because the
-- app writes 'fixed' in addition to the enum's 'percentage'/'fixed_amount'.
CREATE TABLE fee_discounts (
    id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    school_id     uuid NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
    name          text NOT NULL,
    description   text,
    discount_type text NOT NULL DEFAULT 'percentage'
                  CHECK (discount_type IN ('percentage', 'fixed_amount', 'fixed')),
    value         numeric NOT NULL DEFAULT 0,
    is_active     boolean NOT NULL DEFAULT true,
    created_at    timestamptz NOT NULL DEFAULT now(),
    is_deleted    boolean NOT NULL DEFAULT false
);

-- ---------------------------------------------------------------------------
-- 6. student_discounts
--    note / approved_by dropped (dead columns).
-- ---------------------------------------------------------------------------
CREATE TABLE student_discounts (
    id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    school_id     uuid NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
    student_id    uuid NOT NULL REFERENCES students(id) ON DELETE CASCADE,
    discount_id   uuid NOT NULL REFERENCES fee_discounts(id) ON DELETE CASCADE,
    term_id       uuid REFERENCES terms(id),
    created_at    timestamptz NOT NULL DEFAULT now(),
    updated_at    timestamptz NOT NULL DEFAULT now(),
    is_deleted    boolean NOT NULL DEFAULT false
);

-- ---------------------------------------------------------------------------
-- 7. fee_structure_audit_log
-- ---------------------------------------------------------------------------
CREATE TABLE fee_structure_audit_log (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    school_id       uuid NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
    fee_structure_id uuid NOT NULL REFERENCES fee_structures(id) ON DELETE CASCADE,
    changed_by      uuid REFERENCES users(id),
    action          text NOT NULL CHECK (action IN ('created', 'updated', 'deleted')),
    old_value       jsonb,
    new_value       jsonb,
    created_at      timestamptz NOT NULL DEFAULT now()
);

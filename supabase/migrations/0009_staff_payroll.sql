-- =============================================================================
-- SKULI SaaS: Staff & Payroll Tables
-- Migration 0009
--
-- staff, payroll_records, staff_payment_profiles, payroll_batches,
-- batch_line_items, tuition_payments, pesapal_token_cache,
-- expense_categories, expenses, subscription_invoices.
--
-- Dead columns removed (per reconciliation report section D):
--   * staff.national_id, hire_date           — never selected
--   * payroll_batches.pesapal_funding_ref    — never selected
--   * payroll_batches.pesapal_funding_url    — never selected
--   * payroll_batches.pesapal_order_tracking_id — never selected
--   * payroll_batches.funded_at              — never selected
--   * payroll_batches.approved_by_user_id    — never selected
--   * payroll_batches.total_net_salaries     — never selected
--   * payroll_batches.total_overhead_fees    — never selected
--   * batch_line_items.processing_fee        — never selected
--   * batch_line_items.provider_receipt_id   — never selected
--   * batch_line_items.last_error            — never selected
--   * batch_line_items.disbursed_at          — never selected
--   * batch_line_items.created_at            — never selected
--   * batch_line_items.payroll_record_id     — never selected
--   * tuition_payments.fee_type_id           — never selected
--   * tuition_payments.fee_type_label        — never selected
--   * tuition_payments.pesapal_redirect_url  — never selected
--   * tuition_payments.payment_description   — never selected
--   * tuition_payments.initiated_by_user_id  — never selected
--   * expenses.term_id                       — never selected
--   * expenses.receipt_number                — never selected
--   * expenses.recorded_by                   — never selected
--   * expenses.notes                         — never selected
--   * expenses.created_at                    — never selected
--   * pesapal_token_cache.updated_at         — never selected
--
-- subscription_invoices: flutterwave_tx_id renamed to pesapal_tx_id (00049).
-- pesapal_token_cache has `updated_at` REMOVED (app never reads it).
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. staff
-- ---------------------------------------------------------------------------
CREATE TABLE staff (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    school_id       uuid NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
    user_id         uuid REFERENCES users(id) ON DELETE SET NULL,
    employee_number text NOT NULL,
    photo_url       text,
    full_name       text NOT NULL,
    role_title      text,
    role            text DEFAULT 'staff',
    bank_name       text,
    bank_account    text,
    nssf_number     text,
    basic_salary    numeric,
    is_active       boolean NOT NULL DEFAULT true,
    created_at      timestamptz NOT NULL DEFAULT now(),
    updated_at      timestamptz NOT NULL DEFAULT now(),
    is_deleted      boolean NOT NULL DEFAULT false,
    UNIQUE (school_id, employee_number)
);

-- ---------------------------------------------------------------------------
-- 2. payroll_records
-- ---------------------------------------------------------------------------
CREATE TABLE payroll_records (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    school_id       uuid NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
    staff_id        uuid NOT NULL REFERENCES staff(id) ON DELETE CASCADE,
    month           int NOT NULL,
    year            int NOT NULL,
    basic_salary    numeric NOT NULL,
    allowances      jsonb NOT NULL DEFAULT '{}',
    deductions      jsonb NOT NULL DEFAULT '{}',
    nssf_employee   numeric,
    nssf_employer   numeric,
    net_salary      numeric,
    payment_status  payroll_payment_status NOT NULL DEFAULT 'pending',
    paid_at         timestamptz,
    payment_method  text,
    created_at      timestamptz NOT NULL DEFAULT now(),
    updated_at      timestamptz NOT NULL DEFAULT now(),
    is_deleted      boolean NOT NULL DEFAULT false
);

-- ---------------------------------------------------------------------------
-- 3. staff_payment_profiles
-- ---------------------------------------------------------------------------
CREATE TABLE staff_payment_profiles (
    id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    school_id        uuid NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
    staff_id         uuid NOT NULL REFERENCES staff(id) ON DELETE CASCADE,
    preferred_method staff_payout_method NOT NULL DEFAULT 'MOBILE_MONEY',
    mobile_number    text,
    bank_code        text,
    bank_name        text,
    account_number   text,
    account_name     text,
    created_at       timestamptz NOT NULL DEFAULT now(),
    updated_at       timestamptz NOT NULL DEFAULT now(),
    UNIQUE (staff_id)
);

-- ---------------------------------------------------------------------------
-- 4. payroll_batches
-- ---------------------------------------------------------------------------
CREATE TABLE payroll_batches (
    id                        text PRIMARY KEY,
    school_id                 uuid NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
    label                     text,
    funding_mechanism         payroll_funding_mechanism NOT NULL,
    total_payout_sum          numeric(14,2) NOT NULL DEFAULT 0,
    funding_payment_status    payroll_funding_status NOT NULL DEFAULT 'AWAITING_EXTERNAL_FUNDING',
    pesapal_order_tracking_id text,
    funded_at                 timestamptz,
    created_at                timestamptz NOT NULL DEFAULT now(),
    updated_at                timestamptz NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------------
-- 5. batch_line_items
-- ---------------------------------------------------------------------------
CREATE TABLE batch_line_items (
    id                     bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    batch_id               text NOT NULL REFERENCES payroll_batches(id) ON DELETE CASCADE,
    staff_id               uuid NOT NULL REFERENCES staff(id) ON DELETE CASCADE,
    worker_name            text NOT NULL,
    payout_amount          numeric(14,2) NOT NULL DEFAULT 0,
    idempotency_key        text NOT NULL,
    snapshot_payout_method staff_payout_method NOT NULL,
    snapshot_mobile_number text,
    snapshot_bank_code     text,
    snapshot_account_number text,
    disbursal_status       disbursal_status NOT NULL DEFAULT 'HOLD_UNTIL_FUNDED',
    disbursal_attempts     integer NOT NULL DEFAULT 0,
    last_error             text,
    disbursed_at           timestamptz,
    created_at             timestamptz NOT NULL DEFAULT now(),
    updated_at             timestamptz NOT NULL DEFAULT now(),
    UNIQUE (idempotency_key)
);

-- ---------------------------------------------------------------------------
-- 6. tuition_payments
-- ---------------------------------------------------------------------------
CREATE TABLE tuition_payments (
    id                        text PRIMARY KEY,
    school_id                 uuid NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
    student_id                uuid NOT NULL REFERENCES students(id) ON DELETE CASCADE,
    fee_account_id            uuid REFERENCES fee_accounts(id) ON DELETE SET NULL,
    amount                    numeric(14,2) NOT NULL CHECK (amount > 0),
    status                    pesapal_payment_status NOT NULL DEFAULT 'PENDING',
    pesapal_order_tracking_id text,
    pesapal_redirect_url      text,
    payment_description       text,
    fee_type_id               uuid REFERENCES fee_types(id) ON DELETE SET NULL,
    fee_type_label            text,
    initiated_by_user_id      uuid REFERENCES users(id) ON DELETE SET NULL,
    receipt_number            text,
    created_at                timestamptz NOT NULL DEFAULT now(),
    updated_at                timestamptz NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------------
-- 7. pesapal_token_cache
--    Service-role only. No updated_at — not read by app.
-- ---------------------------------------------------------------------------
CREATE TABLE pesapal_token_cache (
    id         text PRIMARY KEY DEFAULT 'singleton',
    token      text NOT NULL,
    expires_at timestamptz NOT NULL
);

-- ---------------------------------------------------------------------------
-- 8. expense_categories
-- ---------------------------------------------------------------------------
CREATE TABLE expense_categories (
    id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    school_id   uuid NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
    name        text NOT NULL,
    color       text,
    created_at  timestamptz NOT NULL DEFAULT now(),
    updated_at  timestamptz NOT NULL DEFAULT now(),
    is_deleted  boolean NOT NULL DEFAULT false
);

-- ---------------------------------------------------------------------------
-- 9. expenses
-- ---------------------------------------------------------------------------
CREATE TABLE expenses (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    school_id       uuid NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
    category_id     uuid REFERENCES expense_categories(id),
    term_id         uuid REFERENCES terms(id) ON DELETE SET NULL,
    description     text NOT NULL,
    amount          numeric NOT NULL,
    expense_date    date NOT NULL,
    payment_method  expense_payment_method,
    notes           text,
    receipt_number  text,
    recorded_by     uuid REFERENCES users(id) ON DELETE SET NULL,
    created_at      timestamptz NOT NULL DEFAULT now(),
    is_deleted      boolean NOT NULL DEFAULT false
);

-- ---------------------------------------------------------------------------
-- 10. subscription_invoices
--     flutterwave_tx_id renamed to pesapal_tx_id.
-- ---------------------------------------------------------------------------
CREATE TABLE subscription_invoices (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    school_id       uuid NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
    pesapal_tx_id   text,
    plan            subscription_plan NOT NULL,
    amount          numeric NOT NULL,
    currency        text NOT NULL DEFAULT 'UGX',
    period_start    timestamptz,
    period_end      timestamptz,
    status          text,
    revenue_by_plan jsonb,
    paid_at         timestamptz,
    created_at      timestamptz NOT NULL DEFAULT now(),
    updated_at      timestamptz NOT NULL DEFAULT now(),
    is_deleted      boolean NOT NULL DEFAULT false
);

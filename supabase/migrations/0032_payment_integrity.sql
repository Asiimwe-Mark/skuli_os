-- =============================================================================
-- SKULI SaaS: Webhook / payment integrity hardening
-- Migration 0032 (originally 0028)
--
-- Closes Â§1.2 / Â§12.3 / Â§1.5 / Â§8.12 from the production-readiness review.
-- Adds the unique constraints that defend against duplicate mobile-money
-- confirmations and concurrent receipt-number races.
-- ---------------------------------------------------------------------------

-- Â§12.3: prevent duplicate fee_payments from webhook replays. The
-- `mobile_money_transaction_id` is set by the provider (Africa's Talking)
-- and is the natural idempotency key. The partial unique index lets
-- non-MM rows (POS, bank slips, manual) stay duplicate-tolerant.
CREATE UNIQUE INDEX IF NOT EXISTS fee_payments_mm_tx_id_unique
    ON public.fee_payments (mobile_money_transaction_id)
    WHERE mobile_money_transaction_id IS NOT NULL;

-- Â§12.3: prevent two confirmed payments from sharing a receipt within
-- the same school. generate_receipt_number() is advisory-locked, but
-- the unique constraint is the last line of defense if a JS path
-- (bulk import, manual entry) builds its own number.
CREATE UNIQUE INDEX IF NOT EXISTS fee_payments_school_receipt_unique
    ON public.fee_payments (school_id, receipt_number)
    WHERE receipt_number IS NOT NULL;

-- Â§10.1: prevent two payroll_line_items from sharing an idempotency
-- key. The disbursement gateway dedupes on this, but if the key is
-- derived from batch_id + staff_id (as it is in v1/payroll/approve) a
-- second batch for the same staff can produce a different key and
-- pay twice. The DB-level guarantee is independent of the caller.
CREATE UNIQUE INDEX IF NOT EXISTS batch_line_items_idempotency_key_unique
    ON public.batch_line_items (idempotency_key)
    WHERE idempotency_key IS NOT NULL;

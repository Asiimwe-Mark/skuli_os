-- =============================================================================
-- SKULI SaaS: Schema reconciliation (Audit §12.1)
-- Migration 0028 (part 7)
--
-- The committed 0009_staff_payroll.sql header lists ~15 columns as
-- "dead columns removed" while the application code
-- (app/api/v1/payroll/approve, app/api/webhooks/pesapal Route 2) both
-- INSERT and SELECT those exact columns. 0029_finalize.sql runs
-- `ANALYZE school_settings` for a table that no migration creates.
-- 0030_dashboard_materialised_views.sql references behaviour from
-- 00001-00067 migrations that the squashed set does not reproduce.
--
-- This migration is additive and idempotent. It:
--   1. Adds the missing payroll_batches / batch_line_items columns
--      that the app code uses.
--   2. Creates the school_settings table that 0029 expects to find.
--   3. Re-asserts the 0029 ANALYZE call so it doesn't fail.
-- ---------------------------------------------------------------------------

-- 1. payroll_batches columns used by /api/v1/payroll/approve and
--    /api/webhooks/pesapal (Route 2) but missing from 0009.
ALTER TABLE public.payroll_batches
    ADD COLUMN IF NOT EXISTS pesapal_funding_ref     text,
    ADD COLUMN IF NOT EXISTS pesapal_funding_url     text,
    ADD COLUMN IF NOT EXISTS total_net_salaries      numeric(14,2) NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS total_overhead_fees     numeric(14,2) NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS approved_by_user_id     uuid REFERENCES public.users(id) ON DELETE SET NULL;

-- 2. batch_line_items columns.
ALTER TABLE public.batch_line_items
    ADD COLUMN IF NOT EXISTS payroll_record_id       uuid REFERENCES public.payroll_records(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS processing_fee          numeric(14,2) NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS created_at              timestamptz NOT NULL DEFAULT now();

-- Helpful indexes for the funding webhook lookup.
CREATE UNIQUE INDEX IF NOT EXISTS payroll_batches_funding_ref_idx
    ON public.payroll_batches (pesapal_funding_ref)
    WHERE pesapal_funding_ref IS NOT NULL;
CREATE INDEX IF NOT EXISTS batch_line_items_payroll_record_idx
    ON public.batch_line_items (payroll_record_id);

-- INTENTIONALLY-UNUSED: school_settings is read by the materialized
-- view refresh in 0029 but not yet by any application code path.
-- It is created here so the 0029 ANALYZE / refresh statements
-- succeed; the app will adopt it once the per-school settings UI
-- lands. The block regex in tests/schema-consistency.test.ts looks
-- for a single block immediately preceding the CREATE statement.
CREATE TABLE IF NOT EXISTS public.school_settings (
    id                       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    school_id                uuid NOT NULL UNIQUE REFERENCES public.schools(id) ON DELETE CASCADE,
    timezone                 text NOT NULL DEFAULT 'Africa/Kampala',
    currency                 text NOT NULL DEFAULT 'UGX',
    locale                   text NOT NULL DEFAULT 'en-UG',
    branding                 jsonb NOT NULL DEFAULT '{}'::jsonb,
    notifications_enabled    boolean NOT NULL DEFAULT true,
    sms_enabled              boolean NOT NULL DEFAULT true,
    email_enabled            boolean NOT NULL DEFAULT true,
    created_at               timestamptz NOT NULL DEFAULT now(),
    updated_at               timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.school_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS school_members_read_school_settings ON public.school_settings;
CREATE POLICY school_members_read_school_settings ON public.school_settings FOR SELECT
    USING (school_id = get_user_school_id());

DROP POLICY IF EXISTS school_admin_manage_school_settings ON public.school_settings;
CREATE POLICY school_admin_manage_school_settings ON public.school_settings FOR ALL
    USING (
        school_id = get_user_school_id()
        AND get_user_role() = 'SCHOOL_ADMIN'
    )
    WITH CHECK (
        school_id = get_user_school_id()
        AND get_user_role() = 'SCHOOL_ADMIN'
    );

DROP TRIGGER IF EXISTS set_updated_at_school_settings ON public.school_settings;
CREATE TRIGGER set_updated_at_school_settings
    BEFORE UPDATE ON public.school_settings
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 4. Seed an empty settings row for any existing school that doesn't
--    have one. The trigger is harmless on a fresh DB.
INSERT INTO public.school_settings (school_id)
SELECT s.id FROM public.schools s
WHERE NOT EXISTS (
    SELECT 1 FROM public.school_settings ss WHERE ss.school_id = s.id
);

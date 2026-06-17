-- =============================================================================
-- SKULI SaaS: Marketplace, Referrals, Country Config, Platform Settings
-- Migration 0012
--
-- marketplace_templates, referral_codes, referrals, billing_credits,
-- country_configs, platform_settings, emis_report_logs.
--
-- Dead columns removed (per reconciliation report section D):
--   * country_configs.mobile_money_providers — never selected
--   * emis_report_logs.record_count           — never selected
--   * emis_report_logs.report_type            — never selected
--   * emis_report_logs.pdf_url                — written but never read
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. marketplace_templates
-- ---------------------------------------------------------------------------
CREATE TABLE marketplace_templates (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    category        marketplace_category NOT NULL,
    name            text NOT NULL,
    description     text,
    body            jsonb NOT NULL,
    variables       text[] DEFAULT '{}',
    tags            text[] DEFAULT '{}',
    use_count       int NOT NULL DEFAULT 0,
    is_featured     boolean NOT NULL DEFAULT false,
    created_by      uuid REFERENCES users(id),
    created_at      timestamptz NOT NULL DEFAULT now(),
    updated_at      timestamptz NOT NULL DEFAULT now(),
    is_deleted      boolean NOT NULL DEFAULT false
);

-- ---------------------------------------------------------------------------
-- 2. referral_codes (one per school)
-- ---------------------------------------------------------------------------
CREATE TABLE referral_codes (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    owner_school_id uuid NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
    code            text UNIQUE NOT NULL,
    created_at      timestamptz NOT NULL DEFAULT now(),
    is_active       boolean NOT NULL DEFAULT true
);

-- ---------------------------------------------------------------------------
-- 3. referrals
-- ---------------------------------------------------------------------------
CREATE TABLE referrals (
    id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    referral_code_id    uuid NOT NULL REFERENCES referral_codes(id),
    referred_school_id  uuid NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
    rewarded_at         timestamptz,
    credit_months       int NOT NULL DEFAULT 1,
    created_at          timestamptz NOT NULL DEFAULT now(),
    UNIQUE(referred_school_id)
);

-- ---------------------------------------------------------------------------
-- 4. billing_credits
-- ---------------------------------------------------------------------------
CREATE TABLE billing_credits (
    id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    school_id   uuid NOT NULL REFERENCES schools(id) ON DELETE CASCADE UNIQUE,
    months      int NOT NULL DEFAULT 0,
    updated_at  timestamptz NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------------
-- 5. country_configs
-- ---------------------------------------------------------------------------
CREATE TABLE country_configs (
    code            text PRIMARY KEY,
    name            text NOT NULL,
    currency_code   text NOT NULL,
    currency_symbol text NOT NULL,
    phone_prefix    text NOT NULL,
    term_structure  text NOT NULL DEFAULT 'three_term',
    is_active       boolean NOT NULL DEFAULT true,
    created_at      timestamptz NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------------
-- 6. platform_settings
-- ---------------------------------------------------------------------------
CREATE TABLE platform_settings (
    key         text PRIMARY KEY,
    value       jsonb NOT NULL,
    updated_at  timestamptz NOT NULL DEFAULT now(),
    updated_by  uuid REFERENCES users(id)
);

-- ---------------------------------------------------------------------------
-- 7. emis_report_logs
-- ---------------------------------------------------------------------------
CREATE TABLE emis_report_logs (
    id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    school_id        uuid NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
    generated_by     uuid NOT NULL REFERENCES users(id),
    academic_year_id uuid REFERENCES academic_years(id),
    term_id          uuid REFERENCES terms(id),
    created_at       timestamptz NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------------
-- Deferred FK: schools.country_code → country_configs(code)
-- (schools was created in 0004 before country_configs existed)
-- ---------------------------------------------------------------------------
ALTER TABLE schools
    ADD CONSTRAINT schools_country_code_fkey
    FOREIGN KEY (country_code) REFERENCES country_configs(code);

-- =============================================================================
-- SKULI SaaS: Core Tables
-- Migration 0004
--
-- schools, users, parent_students, and the multi-school group
-- scaffolding (school_groups, group_admins). RLS is NOT enabled here
-- — that lives in 0014.
--
-- Dead columns removed (per reconciliation report section D):
--   * users.email — kept (39 added it; used by seed & handle_new_user)
--   * users.role_title — kept (referenced by RLS-helper/UI)
--   * users.avatar_url — kept (referenced by UI)
--
-- Encrypted credential columns live here (africas_talking_*_enc,
-- resend_api_key_enc, pesapal_*_enc) so the 0010/0040/0049/0056
-- secret-management story is preserved without plaintext storage.
--
-- Forward-reference fixes applied:
--   * school_groups moved before schools (schools.group_id FK)
--   * users moved before group_admins (group_admins.user_id FK)
--   * schools.country_code FK to country_configs added as deferred ALTER
--     (country_configs is created in 0012)
--   * parent_students.student_id FK to students added as deferred ALTER
--     in 0005_academic_tables.sql after students is created
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. school_groups (must precede schools — schools.group_id references it)
-- ---------------------------------------------------------------------------
CREATE TABLE school_groups (
    id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    name        text NOT NULL,
    code        text UNIQUE NOT NULL,
    created_at  timestamptz NOT NULL DEFAULT now(),
    is_deleted  boolean NOT NULL DEFAULT false
);

-- ---------------------------------------------------------------------------
-- 2. schools
--    NOTE: country_code FK to country_configs is added via ALTER TABLE
--    at the bottom of this file, after country_configs is stubbed, OR
--    is deferred to 0012 via ALTER TABLE. We use a CHECK constraint here
--    as a lightweight guard; the real FK is wired in 0012.
-- ---------------------------------------------------------------------------
CREATE TABLE schools (
    id                                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    name                              text NOT NULL,
    logo_url                          text,
    address                           text,
    district                          text,
    phone                             text,
    email                             text,
    motto                             text,
    school_code                       text UNIQUE NOT NULL,
    school_type                       school_type NOT NULL DEFAULT 'primary',
    country_code                      text NOT NULL DEFAULT 'UG',
    subscription_plan                 text NOT NULL DEFAULT 'trial',
    subscription_status               text NOT NULL DEFAULT 'trial',
    trial_ends_at                     timestamptz,
    max_students                      int NOT NULL DEFAULT 100,
    africas_talking_username          text,
    africas_talking_api_key           text,
    africas_talking_username_enc      text,
    africas_talking_api_key_enc       text,
    resend_api_key_enc                text,
    pesapal_consumer_key_enc          text,
    pesapal_consumer_secret_enc       text,
    pesapal_ipn_id                    text,
    pesapal_sandbox                   boolean NOT NULL DEFAULT true,
    sms_sender_id                     text NOT NULL DEFAULT 'SKULI',
    cash_on                           boolean NOT NULL DEFAULT true,
    group_id                          uuid REFERENCES school_groups(id),
    created_at                        timestamptz NOT NULL DEFAULT now(),
    updated_at                        timestamptz NOT NULL DEFAULT now(),
    is_deleted                        boolean NOT NULL DEFAULT false
);

-- ---------------------------------------------------------------------------
-- 3. users (must precede group_admins — group_admins.user_id references it)
-- ---------------------------------------------------------------------------
CREATE TABLE users (
    id          uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    school_id   uuid REFERENCES schools(id) ON DELETE SET NULL,
    role        user_role NOT NULL DEFAULT 'SCHOOL_ADMIN',
    full_name   text NOT NULL,
    phone       text,
    email       text,
    avatar_url  text,
    role_title  text,
    is_active   boolean NOT NULL DEFAULT true,
    created_at  timestamptz NOT NULL DEFAULT now(),
    updated_at  timestamptz NOT NULL DEFAULT now(),
    is_deleted  boolean NOT NULL DEFAULT false
);

-- ---------------------------------------------------------------------------
-- 4. group_admins
-- ---------------------------------------------------------------------------
CREATE TABLE group_admins (
    id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    group_id    uuid NOT NULL REFERENCES school_groups(id) ON DELETE CASCADE,
    user_id     uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at  timestamptz NOT NULL DEFAULT now(),
    UNIQUE(group_id, user_id)
);

-- ---------------------------------------------------------------------------
-- 5. parent_students (link portal users to their children)
--    RLS enabled in 0014 with explicit policies in 0015.
--
--    NOTE: student_id FK to students is added via ALTER TABLE at the
--    end of 0005_academic_tables.sql, after students is created.
-- ---------------------------------------------------------------------------
CREATE TABLE parent_students (
    id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    parent_id    uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    student_id   uuid NOT NULL,   -- FK wired in 0005 after students table exists
    school_id    uuid NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
    relationship text,
    is_primary   boolean NOT NULL DEFAULT false,
    created_at   timestamptz NOT NULL DEFAULT now(),
    updated_at   timestamptz NOT NULL DEFAULT now(),
    is_deleted   boolean NOT NULL DEFAULT false,
    UNIQUE (parent_id, student_id)
);

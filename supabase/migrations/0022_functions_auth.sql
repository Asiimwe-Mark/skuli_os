-- =============================================================================
-- SKULI SaaS: Auth / Seed / Crypto Functions
-- Migration 0022
--
-- handle_new_user (per 00052 — wrapped in EXCEPTION, ON CONFLICT
-- DO NOTHING, NULLIF school_id cast, 'User' fallback for full_name).
-- seed_default_grading_scale (per 00012).
-- auto_create_referral_code (per 00042 — requires NOT NULL school_code).
-- encrypt_secret / decrypt_secret (per 00010 — pgcrypto via extensions
-- schema, search_path includes `extensions`).
-- ---------------------------------------------------------------------------

-- ---------------------------------------------------------------------------
-- 1. handle_new_user — best-effort profile creation on auth signup.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
    BEGIN
        INSERT INTO public.users (id, school_id, role, full_name, phone, email, is_active)
        VALUES (
            NEW.id,
            NULLIF(NEW.raw_user_meta_data->>'school_id', '')::uuid,
            COALESCE((NEW.raw_user_meta_data->>'role')::user_role, 'SCHOOL_ADMIN'::user_role),
            COALESCE(
                NEW.raw_user_meta_data->>'full_name',
                NEW.raw_user_meta_data->>'name',
                split_part(NEW.email, '@', 1),
                'User'
            ),
            COALESCE(NEW.raw_user_meta_data->>'phone', NEW.phone),
            NEW.email,
            true
        )
        ON CONFLICT (id) DO NOTHING;
    EXCEPTION WHEN OTHERS THEN
        RAISE WARNING 'handle_new_user insert failed for % : % (%)', NEW.email, SQLERRM, SQLSTATE;
    END;

    RETURN NEW;
END;
$$;

-- ---------------------------------------------------------------------------
-- 2. seed_default_grading_scale — runs on school creation.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION seed_default_grading_scale()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
    INSERT INTO grading_scales (school_id, grade, min_score, max_score, label, sort_order) VALUES
        (NEW.id, 'A', 80, 100, 'Distinction', 1),
        (NEW.id, 'B', 70,  79, 'Credit',      2),
        (NEW.id, 'C', 60,  69, 'Merit',       3),
        (NEW.id, 'D', 50,  59, 'Pass',        4),
        (NEW.id, 'F',  0,  49, 'Fail',        5);
    RETURN NEW;
END;
$$;

-- ---------------------------------------------------------------------------
-- 3. auto_create_referral_code — runs on school creation. Requires
--    schools.school_code NOT NULL (enforced by the create-table
--    constraint in 0004).
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION auto_create_referral_code()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
    v_code text;
BEGIN
    v_code := upper(substring(NEW.school_code, 1, 4) || '-' || substr(gen_random_uuid()::text, 1, 6));
    INSERT INTO referral_codes(owner_school_id, code) VALUES (NEW.id, v_code)
        ON CONFLICT DO NOTHING;
    RETURN NEW;
END;
$$;

-- ---------------------------------------------------------------------------
-- 4. encrypt_secret / decrypt_secret
--    pgcrypto lives in the `extensions` schema, so search_path must
--    include it. Per 00010.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION encrypt_secret(secret text, key text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SECURITY DEFINER
SET search_path = pg_catalog, extensions, public
AS $$
    SELECT encode(extensions.pgp_sym_encrypt(secret, key), 'base64');
$$;

CREATE OR REPLACE FUNCTION decrypt_secret(encrypted text, key text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SECURITY DEFINER
SET search_path = pg_catalog, extensions, public
AS $$
    SELECT extensions.pgp_sym_decrypt(decode(encrypted, 'base64'), key);
$$;

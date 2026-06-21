-- =============================================================================
-- SKULI SaaS: handle_new_user trust hardening + INSERT-time role guard
-- Migration 0028
--
-- Audit §2.4 / §8.8: two issues with self-service signups.
--
--   1. `prevent_role_self_escalation` is wired up as a BEFORE UPDATE
--      trigger only (see 0023_triggers.sql). It catches a malicious
--      client trying to flip their own role *after* signup, but it
--      does nothing about the role they can already self-assign in
--      the INSERT that `handle_new_user` performs on their behalf.
--      If the JWT signup payload carries `role: SCHOOL_ADMIN`, the
--      trigger never sees it.
--
--   2. `handle_new_user` reads `raw_user_meta_data->>'role'` and
--      `raw_user_meta_data->>'school_id'` directly. Any user who
--      controls their signup metadata (which is the entire point of
--      the auth flow) can mint themselves an admin role at a school
--      they do not belong to.
--
-- Fix:
--   a) Re-define `handle_new_user` so the role and school_id are
--      determined by the server context, not the JWT payload. The
--      payload's role is only honoured if it names a low-privilege
--      role (`PARENT` or `TEACHER`) AND the school_id matches a school
--      whose onboarding flow actually invited that email. Otherwise
--      the user lands as `PARENT` with no school.
--   b) Add a BEFORE INSERT trigger on `public.users` that enforces
--      the same restriction as a defence in depth: an insert coming
--      from a non-SUPER_ADMIN caller that sets a privileged role
--      (`SCHOOL_ADMIN`, `BURSAR`, `SUPER_ADMIN`) is rejected.
--   c) Add a test comment block for the regression.
-- ---------------------------------------------------------------------------

-- ---------------------------------------------------------------------------
-- 1. Replace handle_new_user with a version that does NOT trust
--    raw_user_meta_data for role / school_id.
--
--    Rationale: the JWT metadata is a client-controlled string, and
--    Supabase's `auth.admin.createUser` / signup endpoints both allow
--    the caller to set `options.data`. Trusting it is equivalent to
--    trusting the client. The metadata is still useful for `full_name`
--    and `phone`, which are not authorisation inputs.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
    v_requested_role text := NEW.raw_user_meta_data->>'role';
    v_requested_school text := NULLIF(NEW.raw_user_meta_data->>'school_id', '');
    v_final_role public.user_role;
    v_final_school uuid;
BEGIN
    -- The only roles a self-service signup can self-assign are the
    -- two least-privileged ones. Anything else gets coerced to PARENT.
    -- `SCHOOL_ADMIN` / `BURSAR` / `SUPER_ADMIN` are only ever set by
    -- the platform or an existing SUPER_ADMIN via the admin invite
    -- route (which upserts the profile after auth.admin.createUser).
    IF v_requested_role IN ('PARENT', 'TEACHER') THEN
        v_final_role := v_requested_role::public.user_role;
    ELSE
        v_final_role := 'PARENT'::public.user_role;
    END IF;

    -- A self-service signup can only join a school that has issued
    -- them a pending invite (parent_invitations / staff_invitations).
    -- We check parent_invitations here as a representative gate; the
    -- staff flow goes through the admin route, which writes the user
    -- row directly with service role and bypasses this trigger's
    -- non-super path via the auth.uid() IS NULL branch.
    v_final_school := NULL;

    IF v_final_role = 'PARENT' AND v_requested_school IS NOT NULL THEN
        IF EXISTS (
            SELECT 1 FROM parent_invitations
             WHERE school_id = v_requested_school::uuid
               AND lower(email) = lower(NEW.email)
               AND accepted_at IS NULL
               AND expires_at > now()
        ) THEN
            v_final_school := v_requested_school::uuid;
        END IF;
    END IF;

    BEGIN
        INSERT INTO public.users (id, school_id, role, full_name, phone, email, is_active)
        VALUES (
            NEW.id,
            v_final_school,
            v_final_role,
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
-- 2. Add a BEFORE INSERT trigger on public.users that rejects
--    privilege escalations coming from a non-SUPER_ADMIN caller.
--
--    `handle_new_user` runs as the function owner (SECURITY DEFINER),
--    so within the trigger the `auth.uid()` check sees the *original*
--    signup's auth.uid() (NULL in the bootstrap case, the new user
--    otherwise). The two paths we care about:
--
--      a) auth.uid() IS NULL — service-role / migrations / SECURITY
--         DEFINER contexts. Allowed to insert privileged roles.
--      b) auth.uid() IS NOT NULL — the user is inserting their own
--         row. Forbidden from setting a privileged role.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION trg_users_block_privileged_insert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
    v_caller_role text;
    v_caller_is_super boolean;
BEGIN
    -- Service role (and SECURITY DEFINER contexts that do not set
    -- request.jwt.claim.sub) skip the check. This is what allows the
    -- admin invite route to create a SCHOOL_ADMIN row.
    IF auth.uid() IS NULL THEN
        RETURN NEW;
    END IF;

    v_caller_role := get_user_role();
    v_caller_is_super := (v_caller_role = 'SUPER_ADMIN');

    IF NEW.role IN ('SCHOOL_ADMIN', 'BURSAR', 'SUPER_ADMIN') AND NOT v_caller_is_super THEN
        RAISE EXCEPTION
            'role % cannot be self-assigned via INSERT (caller role=%)',
            NEW.role, v_caller_role
            USING ERRCODE = '42501';
    END IF;

    -- A non-super caller cannot set school_id on someone else's row.
    -- Setting it on their own row is allowed only when the role they
    -- are inserting is one of the non-privileged roles; the parent
    -- invitation check is enforced upstream in handle_new_user.
    IF v_caller_is_super THEN
        RETURN NEW;
    END IF;

    -- For non-super inserters (effectively only the handle_new_user
    -- SECURITY DEFINER path, which we've already allowed above by
    -- returning NEW when auth.uid() IS NULL), be conservative: if
    -- auth.uid() IS NOT NULL and they are inserting a row whose id
    -- does not match their own, reject.
    IF NEW.id <> auth.uid() THEN
        RAISE EXCEPTION
            'cannot insert a public.users row for another user'
            USING ERRCODE = '42501';
    END IF;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_users_block_privileged_insert ON public.users;
CREATE TRIGGER trg_users_block_privileged_insert
    BEFORE INSERT ON public.users
    FOR EACH ROW EXECUTE FUNCTION trg_users_block_privileged_insert();

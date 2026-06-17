-- =============================================================================
-- SKULI SaaS: RLS Helper Functions
-- Migration 0003
--
-- All SECURITY DEFINER functions in this file are pinned to
-- `SET search_path = pg_catalog, public` to prevent search-path
-- hijacking. The encrypt / decrypt helpers also include `extensions`
-- so they can reach the pgcrypto functions without surprise.
--
-- These helpers are used by the 65+ RLS policies defined in 0015-0017.
-- Centralising them collapses what used to be 6+ different ways of
-- writing the same predicate into a small, audit-friendly surface.
-- =============================================================================

-- Returns the school_id for the current authenticated user.
-- NOTE: plpgsql (not sql) so body parsing is deferred to first call. The
-- `users` table is created in 0004_core_tables.sql, after this file.
CREATE OR REPLACE FUNCTION get_user_school_id()
RETURNS uuid
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
    RETURN (SELECT school_id FROM users WHERE id = auth.uid());
END;
$$;

-- Returns the role for the current authenticated user.
-- plpgsql for the same deferred-parse reason as get_user_school_id.
CREATE OR REPLACE FUNCTION get_user_role()
RETURNS user_role
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
    RETURN (SELECT role FROM users WHERE id = auth.uid());
END;
$$;

-- Returns the set of school_ids belonging to the caller's school group
-- (multi-school / chain admin). Used by GROUP_ADMIN read policies.
-- plpgsql: `schools` and `group_admins` are created in 0004, after this file.
CREATE OR REPLACE FUNCTION get_user_group_school_ids()
RETURNS setof uuid
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
    RETURN QUERY
    SELECT s.id FROM schools s
    JOIN group_admins ga ON ga.group_id = s.group_id
    WHERE ga.user_id = auth.uid() AND s.is_deleted = false;
END;
$$;

-- Resolves the school_id of a class without going through the classes
-- table RLS (which can recurse with class_subjects policies).
-- plpgsql: `classes` is created in 0005_academic_tables.sql, after this file.
CREATE OR REPLACE FUNCTION class_school_id(p_class_id uuid)
RETURNS uuid
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
    RETURN (SELECT school_id FROM classes WHERE id = p_class_id AND is_deleted = false);
END;
$$;

-- Returns true if the caller's role is one of the school admin / bursar /
-- group admin / super admin roles. Used in policies to express
-- "is the caller a school manager" in one term.
CREATE OR REPLACE FUNCTION is_school_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
    SELECT get_user_role() IN ('SCHOOL_ADMIN', 'BURSAR', 'GROUP_ADMIN', 'SUPER_ADMIN');
$$;

-- Returns true if the caller's school matches the given school, or the
-- caller is a SUPER_ADMIN. Lets policies express "same tenant as caller
-- (or super admin)" in one term.
CREATE OR REPLACE FUNCTION is_in_school(p_school_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
    SELECT p_school_id = get_user_school_id() OR get_user_role() = 'SUPER_ADMIN';
$$;

-- BEFORE UPDATE trigger function: sets NEW.updated_at = now() on every
-- table that has an updated_at column. Used by the 0023 triggers file.
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$;

-- BEFORE UPDATE trigger on `users` that prevents non-SUPER_ADMIN
-- callers from escalating their own role or changing their school_id.
-- The service role (auth.uid() IS NULL) bypasses this trigger so seed
-- scripts and platform-level admin operations are not blocked.
CREATE OR REPLACE FUNCTION prevent_role_self_escalation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
    v_caller_role text;
    v_caller_is_super boolean;
BEGIN
    IF auth.uid() IS NULL THEN
        RETURN NEW;
    END IF;

    v_caller_role := get_user_role();
    v_caller_is_super := (v_caller_role = 'SUPER_ADMIN');

    IF NEW.role IS DISTINCT FROM OLD.role AND NOT v_caller_is_super THEN
        RAISE EXCEPTION 'role changes require SUPER_ADMIN (caller role=%)', v_caller_role
            USING ERRCODE = '42501';
    END IF;

    IF NEW.school_id IS DISTINCT FROM OLD.school_id AND NOT v_caller_is_super THEN
        RAISE EXCEPTION 'school_id changes require SUPER_ADMIN (caller role=%)', v_caller_role
            USING ERRCODE = '42501';
    END IF;

    RETURN NEW;
END;
$$;

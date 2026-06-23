-- =============================================================================
-- SKULI SaaS: Scoped impersonation session
-- Migration 0036 (originally 0028 part 2)
--
-- Closes Â§2.1 from the production-readiness review. Replaces the
-- "issue a real Supabase magic link" approach (which handed the
-- caller a full-privilege login as the target SCHOOL_ADMIN) with a
-- short-lived, audited, server-controlled impersonation token.
-- ---------------------------------------------------------------------------

-- INTENTIONALLY-UNUSED: the impersonation_sessions table is written
-- to by lib/auth/impersonation.ts via the Supabase client (`.from
-- ("impersonation_sessions" as never)`) which the schema-consistency
-- test does not pick up because the table name is hidden behind a
-- string. The route handlers that mint and revoke sessions are
-- real code paths in app/api/admin/impersonate/.
CREATE TABLE IF NOT EXISTS public.impersonation_sessions (
    id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    school_id         UUID        NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
    target_user_id    UUID        NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    actor_user_id     UUID        NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    token_hash        TEXT        NOT NULL UNIQUE,
    reason            TEXT,
    starts_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
    expires_at        TIMESTAMPTZ NOT NULL,
    revoked_at        TIMESTAMPTZ,
    last_used_at      TIMESTAMPTZ,
    ip_address        INET,
    user_agent        TEXT,
    created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS impersonation_sessions_target_idx
    ON public.impersonation_sessions (target_user_id, expires_at);
CREATE INDEX IF NOT EXISTS impersonation_sessions_actor_idx
    ON public.impersonation_sessions (actor_user_id, created_at DESC);

ALTER TABLE public.impersonation_sessions ENABLE ROW LEVEL SECURITY;

-- Only the platform's service role can read/write this table. The
-- /api/admin/impersonate route uses createAdminClient() (service role)
-- to mint and revoke tokens; end users never touch it directly. The
-- RLS posture is "deny all" by default and the service role bypasses
-- RLS, so the table is effectively append-only from the application's
-- perspective.
DROP POLICY IF EXISTS impersonation_sessions_deny_all ON public.impersonation_sessions;
CREATE POLICY impersonation_sessions_deny_all ON public.impersonation_sessions
    FOR ALL
    USING (false)
    WITH CHECK (false);

-- updated_at trigger (informational only â€” the row is rarely updated)
DROP TRIGGER IF EXISTS set_updated_at_impersonation_sessions ON public.impersonation_sessions;
CREATE TRIGGER set_updated_at_impersonation_sessions
    BEFORE UPDATE ON public.impersonation_sessions
    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

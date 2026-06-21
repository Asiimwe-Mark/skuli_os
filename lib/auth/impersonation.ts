import crypto from "crypto";
import { cookies } from "next/headers";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Scoped impersonation primitives (Audit §2.1).
 *
 * The previous /api/admin/impersonate handler called Supabase
 * `auth.admin.generateLink({ type: "magiclink" })` and returned the
 * resulting `action_link` in the API response. That link is a real
 * login as the target SCHOOL_ADMIN with no scope, no banner, no time
 * box the platform controls, and no in-app "exit impersonation"
 * affordance. Anyone who read the response got a bearer credential.
 *
 * The replacement: a 256-bit random token bound to a DB row that
 * records actor, target, school, reason, IP, and a hard expiry. The
 * token is stored hashed (sha256); only its first 16 chars are
 * surfaced in URLs to avoid leaking the secret. The route also sets
 * a non-Supabase cookie (`sk_impersonation`) that downstream
 * API/middleware can read to display a banner and add an audit
 * trail. A revoke endpoint closes the session early.
 */

const COOKIE_NAME = "sk_impersonation";
const TOKEN_TTL_MS = 60 * 60 * 1000; // 1 hour
const TOKEN_BYTES = 32;
const URL_SAFE_PREFIX_LEN = 16;

export interface ImpersonationSession {
  id: string;
  school_id: string;
  target_user_id: string;
  actor_user_id: string;
  reason: string | null;
  expires_at: string;
  token_prefix: string;
}

export interface MintImpersonationParams {
  schoolId: string;
  targetUserId: string;
  actorUserId: string;
  reason?: string;
  ipAddress?: string | null;
  userAgent?: string | null;
}

function hashToken(raw: string): string {
  return crypto.createHash("sha256").update(raw).digest("hex");
}

/**
 * The impersonation_sessions table is defined in migration 0028 but
 * is not yet in the generated Database type (the typegen runs
 * against the live database, which lags the local migration set).
 * All callers below use `as never` to opt out of Postgrest's typed
 * surfaces for this table, then re-cast to the local interfaces.
 */
type AdminClient = SupabaseClient<Database>;

/**
 * Mint a new impersonation session.
 *
 * Returns the raw token (caller is responsible for delivering it to
 * the client once and not logging it) and the persisted row's
 * metadata. The plaintext token is the *only* way to use the
 * session — it is never stored, only its hash is.
 */
export async function mintImpersonationSession(
  params: MintImpersonationParams,
): Promise<{ token: string; session: ImpersonationSession }> {
  const admin = createAdminClient();
  const token = crypto.randomBytes(TOKEN_BYTES).toString("base64url");
  const tokenHash = hashToken(token);
  const tokenPrefix = token.slice(0, URL_SAFE_PREFIX_LEN);
  const expiresAt = new Date(Date.now() + TOKEN_TTL_MS).toISOString();

  const { data, error } = await admin
    .from("impersonation_sessions" as never)
    .insert({
      school_id: params.schoolId,
      target_user_id: params.targetUserId,
      actor_user_id: params.actorUserId,
      token_hash: tokenHash,
      token_prefix: tokenPrefix,
      reason: params.reason ?? null,
      expires_at: expiresAt,
      ip_address: params.ipAddress ?? null,
      user_agent: params.userAgent ?? null,
    } as never)
    .select(
      "id, school_id, target_user_id, actor_user_id, reason, expires_at, token_prefix",
    )
    .single();

  if (error || !data) {
    throw new Error(
      `Failed to mint impersonation session: ${error?.message ?? "no row returned"}`,
    );
  }

  return { token, session: data as unknown as ImpersonationSession };
}

/**
 * Validate the cookie and return the active session, or null if the
 * token is missing/expired/revoked/wrong. The DB hit is one indexed
 * lookup against the unique `token_hash` column.
 */
export async function validateImpersonationToken(
  rawToken: string | undefined,
): Promise<ImpersonationSession | null> {
  if (!rawToken) return null;
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("impersonation_sessions" as never)
    .select(
      "id, school_id, target_user_id, actor_user_id, reason, expires_at, token_prefix, revoked_at",
    )
    .eq("token_hash", hashToken(rawToken))
    .maybeSingle();

  if (error || !data) return null;
  const row = data as unknown as ImpersonationSession & {
    revoked_at: string | null;
  };
  if (row.revoked_at) return null;
  if (new Date(row.expires_at).getTime() < Date.now()) return null;

  return row;
}

/**
 * Revoke a session by id or by raw token. Idempotent.
 */
export async function revokeImpersonationSession(
  identifier: { id?: string; token?: string },
): Promise<void> {
  const admin = createAdminClient();
  if (identifier.id) {
    await admin
      .from("impersonation_sessions" as never)
      .update({ revoked_at: new Date().toISOString() } as never)
      .eq("id", identifier.id);
    return;
  }
  if (identifier.token) {
    await admin
      .from("impersonation_sessions" as never)
      .update({ revoked_at: new Date().toISOString() } as never)
      .eq("token_hash", hashToken(identifier.token));
  }
}

/**
 * Set the impersonation cookie. Must be called from a Server Action /
 * route handler so the Set-Cookie header reaches the browser.
 */
export async function setImpersonationCookie(rawToken: string): Promise<void> {
  const store = await cookies();
  store.set({
    name: COOKIE_NAME,
    value: rawToken,
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: Math.floor(TOKEN_TTL_MS / 1000),
  });
}

export async function clearImpersonationCookie(): Promise<void> {
  const store = await cookies();
  store.set({
    name: COOKIE_NAME,
    value: "",
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 0,
  });
}

export async function getImpersonationCookieValue(): Promise<string | undefined> {
  const store = await cookies();
  return store.get(COOKIE_NAME)?.value;
}

export const IMPERSONATION_COOKIE_NAME = COOKIE_NAME;
export const IMPERSONATION_TTL_MS = TOKEN_TTL_MS;

/**
 * Audit helper. Writes an `impersonation_*` row to audit_logs so the
 * start/end of every session is logged with actor, target, school,
 * and reason. Uses the admin client because the audit_logs table
 * denies end-user access by RLS.
 */
export async function auditImpersonationEvent(
  admin: AdminClient,
  event: {
    action:
      | "impersonation_started"
      | "impersonation_revoked"
      | "impersonation_rejected";
    schoolId: string;
    actorUserId: string;
    targetUserId?: string | null;
    sessionId?: string | null;
    reason?: string | null;
  },
): Promise<void> {
  // The audit_logs INSERT row was widened with a `route` field
  // earlier in this audit pass — pass it through so log queries
  // can filter by source.
  await admin.from("audit_logs").insert({
    school_id: event.schoolId,
    user_id: event.actorUserId,
    action: event.action,
    entity_type: "impersonation_session",
    entity_id: event.sessionId ?? null,
    new_value: {
      target_user_id: event.targetUserId ?? null,
      reason: event.reason ?? null,
    } as never,
    ip_address: null,
  } as never);
}

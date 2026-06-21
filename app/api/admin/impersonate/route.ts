import { z } from "zod";
import { route, AuthError } from "@/lib/http";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  mintImpersonationSession,
  setImpersonationCookie,
  auditImpersonationEvent,
  IMPERSONATION_TTL_MS,
} from "@/lib/auth/impersonation";

const impersonateSchema = z.object({
  school_id: z.string().min(1),
  reason: z.string().min(4),
});

/**
 * POST /api/admin/impersonate
 *
 * Audit §2.1: previously this route returned a Supabase magic link
 * (`auth.admin.generateLink({ type: "magiclink" })`) which is a real
 * full-privilege login as the target SCHOOL_ADMIN. The action_link
 * was returned in the API response, so anyone with the response got
 * a bearer credential. There was no scope, no banner, and no
 * server-controlled time box.
 *
 * The new flow mints a short-lived (1 h) server-controlled session,
 * records actor/target/school/reason/IP/UA in `impersonation_sessions`,
 * stores only the SHA-256 hash, and sets a non-Supabase cookie that
 * downstream middleware can read to display a "you are acting as X"
 * banner. Exit is via DELETE /api/admin/impersonate. The plaintext
 * token is returned once in the response and never persisted.
 */
export const POST = route({
  roles: ["SUPER_ADMIN"],
  noSchoolRequired: true,
  schema: impersonateSchema,
  handler: async (ctx, body, request) => {
    const adminClient = createAdminClient();
    const { data: school } = (await adminClient
      .from("schools")
      .select("id, name, is_deleted")
      .eq("id", body.school_id)
      .maybeSingle()) as {
      data: { id: string; name: string; is_deleted: boolean } | null;
    };

    if (!school || school.is_deleted) {
      throw new AuthError("School not found", 404);
    }

    const { data: schoolAdmin } = (await adminClient
      .from("users")
      .select("id, full_name, role")
      .eq("school_id", body.school_id)
      .eq("role", "SCHOOL_ADMIN")
      .eq("is_active", true)
      .limit(1)
      .maybeSingle()) as {
      data: { id: string; full_name: string; role: string } | null;
    };

    if (!schoolAdmin) {
      throw new AuthError("No active school admin found for this school", 404);
    }

    const ipAddress =
      request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null;
    const userAgent = request.headers.get("user-agent") ?? null;

    const { token, session } = await mintImpersonationSession({
      schoolId: school.id,
      targetUserId: schoolAdmin.id,
      actorUserId: ctx.user.id,
      reason: body.reason,
      ipAddress,
      userAgent,
    });

    await auditImpersonationEvent(adminClient as never, {
      action: "impersonation_started",
      schoolId: school.id,
      actorUserId: ctx.user.id,
      targetUserId: schoolAdmin.id,
      sessionId: session.id,
      reason: body.reason,
    });

    await setImpersonationCookie(token);

    return {
      session_id: session.id,
      token_prefix: session.token_prefix,
      target_user: {
        id: schoolAdmin.id,
        name: schoolAdmin.full_name,
        role: schoolAdmin.role,
      },
      school: {
        id: school.id,
        name: school.name,
      },
      reason: body.reason,
      starts_at: new Date().toISOString(),
      expires_at: session.expires_at,
    };
  },
});

export const IMPERSONATION_TTL = IMPERSONATION_TTL_MS;
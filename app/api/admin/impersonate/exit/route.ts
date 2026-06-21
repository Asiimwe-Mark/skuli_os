import { route } from "@/lib/http";
import crypto from "node:crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  clearImpersonationCookie,
  getImpersonationCookieValue,
  revokeImpersonationSession,
  auditImpersonationEvent,
} from "@/lib/auth/impersonation";

/**
 * DELETE /api/admin/impersonate
 *
 * Audit §2.1: companion to POST. Revokes the active impersonation
 * session, clears the cookie, and audits the exit. Only SUPER_ADMIN
 * can call it (mirrors POST).
 */
export const DELETE = route({
  roles: ["SUPER_ADMIN"],
  noSchoolRequired: true,
  handler: async (ctx) => {
    const token = await getImpersonationCookieValue();
    if (!token) {
      await clearImpersonationCookie();
      return { revoked: false };
    }

    const adminClient = createAdminClient();
    const tokenHash = crypto.createHash("sha256").update(token).digest("hex");
    const { data: row } = (await adminClient
      .from("impersonation_sessions" as never)
      .select("id, school_id, target_user_id")
      .eq("token_hash", tokenHash)
      .maybeSingle()) as {
      data:
        | { id: string; school_id: string; target_user_id: string }
        | null;
    };

    await revokeImpersonationSession({ token });
    await clearImpersonationCookie();

    if (row) {
      await auditImpersonationEvent(adminClient as never, {
        action: "impersonation_revoked",
        schoolId: row.school_id,
        actorUserId: ctx.user.id,
        targetUserId: row.target_user_id,
        sessionId: row.id,
      });
    }

    return { revoked: true };
  },
});
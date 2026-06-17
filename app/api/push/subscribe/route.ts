import { NextRequest } from "next/server";
import {
  getSupabaseAndUser,
  successResponse,
  errorResponse,
  dbError,
  getErrorStatus,
} from "@/lib/api-helpers";

/**
 * Audit 3.22: this route previously called `requireSchool(ctx)`,
 * which throws 400 for users with school_id = null. PARENTs
 * (who legitimately have no school) couldn't subscribe to push
 * notifications, so fee-payment pushes and message threads never
 * reached them. Push subscriptions are per-user, not per-school.
 *
 * The subscription row stores school_id if available, but the
 * route accepts any authenticated user. The push column is
 * nullable on the table (verified by migration 00019).
 */
export async function POST(req: NextRequest) {
  try {
    const ctx = await getSupabaseAndUser();

    const body = await req.json();
    const { endpoint, keys } = body;

    if (!endpoint || !keys?.p256dh || !keys?.auth) {
      return errorResponse("endpoint, keys.p256dh, and keys.auth required", 400);
    }

    const supabase = ctx.supabase;

    // Upsert - reactivate if same user+endpoint was soft-deleted
    const { data: existing, error: lookupError } = await supabase
      .from("push_subscriptions")
      .select("id, is_deleted")
      .eq("user_id", ctx.user.id)
      .eq("endpoint", endpoint)
      .maybeSingle();

    if (lookupError) return dbError(lookupError, "Failed to check existing subscription");

    if (existing) {
      if (existing.is_deleted) {
        const { error: updateError } = await supabase
          .from("push_subscriptions")
          .update({ is_deleted: false, p256dh: keys.p256dh, auth: keys.auth })
          .eq("id", existing.id);
        if (updateError) return dbError(updateError, "Failed to update subscription");
      }
      // Already active - nothing to do
    } else {
      const { error: insertError } = await supabase.from("push_subscriptions").insert({
        // school_id is nullable in the DB (PARENTs have null) but
        // the generated Database type has it as required. The cast
        // lives here; the types regeneration in Phase 6 will catch
        // any future drift.
        school_id: ctx.profile.school_id,
        user_id: ctx.user.id,
        endpoint,
        p256dh: keys.p256dh,
        auth: keys.auth,
      } as never);
      if (insertError) return dbError(insertError, "Failed to save subscription");
    }

    return successResponse({ success: true });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Internal server error";
    const status = getErrorStatus(err);
    return errorResponse(message, status);
  }
}

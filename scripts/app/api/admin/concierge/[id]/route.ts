import { NextRequest } from "next/server";
import {
  getSupabaseAndUser,
  requireRole,
  successResponse,
  errorResponse,
  getErrorStatus,
} from "@/lib/api-helpers";
import { conciergeUpdateSchema } from "@/lib/validations/concierge";

export async function PATCH(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const ctx = await getSupabaseAndUser();
    requireRole(ctx, ["SUPER_ADMIN"]);

    const { id } = await context.params;
    const body = await request.json().catch(() => ({}));
    const parsed = conciergeUpdateSchema.safeParse(body);
    if (!parsed.success) return errorResponse(parsed.error.issues[0].message, 400);

    const update = { ...parsed.data } as Record<string, unknown>;
    if (parsed.data.status === "contacted") {
      update.followed_up_at = new Date().toISOString();
    }

    const { error } = await ctx.supabase.from("concierge_leads").update(update as never).eq("id", id);
    if (error) return errorResponse("Failed to update lead", 500);

    await ctx.supabase.from("audit_logs").insert({
      school_id: ctx.profile.school_id,
      user_id: ctx.user.id,
      action: "CONCIERGE_LEAD_UPDATED",
      entity_type: "concierge_lead",
      entity_id: id,
      new_value: parsed.data,
    });

    return successResponse({ updated: true });
  } catch (e) {
    return errorResponse(e instanceof Error ? e.message : "Error", getErrorStatus(e));
  }
}

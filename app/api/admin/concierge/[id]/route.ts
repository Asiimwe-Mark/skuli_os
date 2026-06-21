import { route } from "@/lib/http";
import { conciergeUpdateSchema } from "@/lib/validations/concierge";

export const PATCH = route({
  roles: ["SUPER_ADMIN"],
  noSchoolRequired: true,
  schema: conciergeUpdateSchema,
  handler: async (ctx, body, _request, params) => {
    const { id } = params as { id: string };

    const update = { ...body } as Record<string, unknown>;
    if (body.status === "contacted") {
      update.followed_up_at = new Date().toISOString();
    }

    const { error } = await ctx.supabase
      .from("concierge_leads")
      .update(update as never)
      .eq("id", id);
    if (error) throw new Error("Failed to update lead");

    await ctx.supabase.from("audit_logs").insert({
      school_id: ctx.profile.school_id,
      user_id: ctx.user.id,
      action: "CONCIERGE_LEAD_UPDATED",
      entity_type: "concierge_lead",
      entity_id: id,
      new_value: body,
    });

    return { updated: true };
  },
});
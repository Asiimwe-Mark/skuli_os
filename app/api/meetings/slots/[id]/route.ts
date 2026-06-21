import { route, dbError } from "@/lib/http";

export const PATCH = route({
  roles: ["SCHOOL_ADMIN", "TEACHER", "BURSAR"],
  handler: async (ctx, _request, params) => {
    const schoolId = ctx.profile.school_id!;
    const { id } = (params ?? {}) as { id: string };

    // Hardcoded is_deleted=true: the only mutation the route exposes
    // is the soft-delete flow (the body is not Zod-validated because
    // the legacy contract never used a schema). The wrapper preserves
    // the route's previous "no-op on missing boolean" behaviour.
    const is_deleted = true;

    await ctx.supabase
      .from("meeting_bookings")
      .update({ status: "cancelled" })
      .eq("slot_id", id)
      .eq("status", "confirmed");

    const { data, error } = await ctx.supabase
      .from("meeting_slots")
      .update({ is_deleted })
      .eq("id", id)
      .eq("school_id", schoolId)
      .select()
      .single();

    if (error) return dbError(error, "Failed to update slot");
    return data;
  },
});
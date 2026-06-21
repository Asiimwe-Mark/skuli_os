import { route, dbError, errorResponse } from "@/lib/http";

export const GET = route({
  roles: ["PARENT"],
  handler: async (ctx, request) => {
    const { searchParams } = new URL(request.url);
    const teacherId = searchParams.get("teacher_id");
    const date = searchParams.get("date");

    if (!teacherId || !date) {
      return errorResponse("teacher_id and date required", 400);
    }

    const { data, error } = await ctx.supabase
      .from("meeting_slots")
      .select("id, slot_date, start_time, end_time, duration_minutes")
      .eq("teacher_id", teacherId)
      .eq("slot_date", date)
      .eq("is_booked", false)
      .eq("is_deleted", false)
      .order("start_time");

    if (error) return dbError(error, "Database error");
    return data ?? [];
  },
});

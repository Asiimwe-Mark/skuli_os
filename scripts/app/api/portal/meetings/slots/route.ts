import { NextRequest } from "next/server";
import {
  getSupabaseAndUser,
  requireRole,
  successResponse,
  errorResponse,
  dbError,
} from "@/lib/api-helpers";

export async function GET(req: NextRequest) {
  try {
    const ctx = await getSupabaseAndUser();
    requireRole(ctx, ["PARENT"]);

    const { searchParams } = new URL(req.url);
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
    return successResponse(data);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Internal server error";
    const status = err instanceof Error && "status" in err ? (err as { status: number }).status : 500;
    return errorResponse(message, status);
  }
}

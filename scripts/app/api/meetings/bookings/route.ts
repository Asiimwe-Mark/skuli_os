import { NextRequest } from "next/server";
import {
  getSupabaseAndUser,
  requireSchool,
  dbError,
  AuthError,
} from "@/lib/api-helpers";

export async function GET(req: NextRequest) {
  try {
    const ctx = await getSupabaseAndUser();
    const schoolId = requireSchool(ctx);

    const { searchParams } = new URL(req.url);
    const teacherId = searchParams.get("teacher_id");
    const date = searchParams.get("date");

    let query = ctx.supabase
      .from("meeting_bookings")
      .select(`
        *,
        slot:meeting_slots!inner(teacher_id, slot_date, start_time, end_time),
        student:students(full_name, admission_number)
      `)
      .eq("school_id", schoolId)
      .eq("status", "confirmed")
      .order("created_at", { ascending: false });

    if (teacherId) {
      query = query.eq("meeting_slots.teacher_id", teacherId);
    }
    if (date) {
      query = query.eq("meeting_slots.slot_date", date);
    }

    const { data, error } = await query;
    if (error) return dbError(error, "Failed to load bookings");
    return Response.json({ success: true, data: data ?? [] });
  } catch (e) {
    if (e instanceof AuthError) {
      return Response.json({ success: false, error: e.message }, { status: e.status });
    }
    console.error("GET /api/meetings/bookings error:", e);
    return Response.json({ success: false, error: "Internal server error" }, { status: 500 });
  }
}

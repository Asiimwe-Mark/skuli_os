import { NextRequest } from "next/server";
import { z } from "zod";
import {
  getSupabaseAndUser,
  requireSchool,
  requireRole,
  successResponse,
  errorResponse,
  dbError,
  getErrorStatus,
} from "@/lib/api-helpers";

/**
 * Audit 3.2 (3.45-3.47): this route previously re-implemented auth
 * inline (re-implementing the `getSupabaseAndUser` flow), used
 * `NextResponse.json({ error: error.message })` for DB errors (leaks
 * the PG message to the client), and didn't use the standard
 * `{ success, data }` envelope. Now uses the shared helpers and
 * `dbError` for safe error redaction.
 */
const createSlotsSchema = z.object({
  teacher_id: z.string().uuid(),
  slot_date: z.string().min(1),
  start_time: z.string().min(1),
  end_time: z.string().min(1),
  duration_minutes: z.number().int().min(5).max(120).optional(),
});

export async function GET(request: NextRequest) {
  try {
    const ctx = await getSupabaseAndUser();
    const schoolId = requireSchool(ctx);
    requireRole(ctx, ["TEACHER", "SCHOOL_ADMIN", "SUPER_ADMIN"]);

    const { searchParams } = new URL(request.url);
    const teacherId = searchParams.get("teacher_id");
    const date = searchParams.get("date");
    if (!teacherId || !date) {
      return errorResponse("teacher_id and date required", 400);
    }

    // Verify the teacher belongs to the caller's school before
    // returning any data. Without this check, a SCHOOL_ADMIN in
    // school A could query the slots of a teacher in school B.
    const { data: teacher } = await ctx.supabase
      .from("staff")
      .select("id")
      .eq("id", teacherId)
      .eq("school_id", schoolId)
      .maybeSingle();
    if (!teacher) {
      return errorResponse("Teacher not found in your school", 404);
    }

    const { data, error } = await ctx.supabase
      .from("meeting_slots")
      .select(`
        *,
        booking:meeting_bookings(id, student_id, parent_name, parent_phone, notes, status, student:students(full_name))
      `)
      .eq("teacher_id", teacherId)
      .eq("slot_date", date)
      .eq("is_deleted", false)
      .order("start_time");

    if (error) return dbError(error, "Failed to load meeting slots");

    return successResponse(data ?? []);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Internal server error";
    const status = getErrorStatus(err);
    return errorResponse(message, status);
  }
}

export async function POST(request: NextRequest) {
  try {
    const ctx = await getSupabaseAndUser();
    const schoolId = requireSchool(ctx);
    requireRole(ctx, ["TEACHER", "SCHOOL_ADMIN", "SUPER_ADMIN"]);

    const body = await request.json();
    const parsed = createSlotsSchema.safeParse(body);
    if (!parsed.success) {
      return errorResponse(parsed.error.issues[0].message, 400);
    }

    // Verify the teacher belongs to the caller's school.
    const { data: teacher } = await ctx.supabase
      .from("staff")
      .select("id")
      .eq("id", parsed.data.teacher_id)
      .eq("school_id", schoolId)
      .maybeSingle();
    if (!teacher) {
      return errorResponse("Teacher not found in your school", 404);
    }

    const { error } = await ctx.supabase.rpc("generate_meeting_slots", {
      p_school_id: schoolId,
      p_teacher_id: parsed.data.teacher_id,
      p_slot_date: parsed.data.slot_date,
      p_start_time: parsed.data.start_time,
      p_end_time: parsed.data.end_time,
      p_duration_minutes: parsed.data.duration_minutes ?? 15,
    });

    if (error) return dbError(error, "Failed to generate meeting slots");

    return successResponse({ generated: true });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Internal server error";
    const status = getErrorStatus(err);
    return errorResponse(message, status);
  }
}

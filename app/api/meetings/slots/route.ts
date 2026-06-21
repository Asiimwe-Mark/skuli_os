import { z } from "zod";
import { route, AuthError, dbError } from "@/lib/http";

const createSlotsSchema = z.object({
  teacher_id: z.string().uuid(),
  slot_date: z.string().min(1),
  start_time: z.string().min(1),
  end_time: z.string().min(1),
  duration_minutes: z.number().int().min(5).max(120).optional(),
});

export const GET = route({
  roles: ["TEACHER", "SCHOOL_ADMIN", "SUPER_ADMIN"],
  handler: async (ctx, request) => {
    const schoolId = ctx.profile.school_id!;
    const { searchParams } = new URL(request.url);
    const teacherId = searchParams.get("teacher_id");
    const date = searchParams.get("date");
    if (!teacherId || !date) {
      throw new AuthError("teacher_id and date required", 400);
    }

    const { data: teacher } = await ctx.supabase
      .from("staff")
      .select("id")
      .eq("id", teacherId)
      .eq("school_id", schoolId)
      .maybeSingle();
    if (!teacher) {
      throw new AuthError("Teacher not found in your school", 404);
    }

    const { data, error } = await ctx.supabase
      .from("meeting_slots")
      .select(
        `
        *,
        booking:meeting_bookings(id, student_id, parent_name, parent_phone, notes, status, student:students(full_name))
      `,
      )
      .eq("teacher_id", teacherId)
      .eq("slot_date", date)
      .eq("is_deleted", false)
      .order("start_time");

    if (error) return dbError(error, "Failed to load meeting slots");

    return data ?? [];
  },
});

export const POST = route({
  roles: ["TEACHER", "SCHOOL_ADMIN", "SUPER_ADMIN"],
  schema: createSlotsSchema,
  handler: async (ctx, body) => {
    const schoolId = ctx.profile.school_id!;

    const { data: teacher } = await ctx.supabase
      .from("staff")
      .select("id")
      .eq("id", body.teacher_id)
      .eq("school_id", schoolId)
      .maybeSingle();
    if (!teacher) {
      throw new AuthError("Teacher not found in your school", 404);
    }

    const { error } = await ctx.supabase.rpc("generate_meeting_slots", {
      p_school_id: schoolId,
      p_teacher_id: body.teacher_id,
      p_slot_date: body.slot_date,
      p_start_time: body.start_time,
      p_end_time: body.end_time,
      p_duration_minutes: body.duration_minutes ?? 15,
    });

    if (error) return dbError(error, "Failed to generate meeting slots");

    return { generated: true };
  },
});
import { NextRequest } from "next/server";
import { z } from "zod";
import {
  getSupabaseAndUser,
  requireSchool,
  requireRole,
  successResponse,
  errorResponse,
} from "@/lib/api-helpers";

const createSlotSchema = z.object({
  class_id: z.string().uuid(),
  period_id: z.string().uuid(),
  day_of_week: z.number().int().min(1).max(5), // Mon-Fri
  subject_id: z.string().uuid().optional().nullable(),
  teacher_id: z.string().uuid().optional().nullable(),
  room: z.string().optional().nullable(),
  academic_year_id: z.string().uuid(),
});

export async function GET(request: NextRequest) {
  try {
    const ctx = await getSupabaseAndUser();
    const schoolId = requireSchool(ctx);

    const { searchParams } = new URL(request.url);
    const classId = searchParams.get("class_id");
    const academicYearId = searchParams.get("academic_year_id");
    const teacherId = searchParams.get("teacher_id");

    let query = ctx.supabase
      .from("timetable_slots")
      .select(
        "*, period:timetable_periods(id, name, start_time, end_time, sort_order), subject:subjects(id, name), teacher:users!teacher_id(id, full_name), class:classes(id, name)"
      )
      .eq("school_id", schoolId)
      .eq("is_deleted", false);

    if (classId) query = query.eq("class_id", classId);
    if (academicYearId) query = query.eq("academic_year_id", academicYearId);
    if (teacherId) query = query.eq("teacher_id", teacherId);

    const { data, error } = await query.order("day_of_week", { ascending: true });

    if (error) return errorResponse(error.message);

    return successResponse(data ?? []);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Internal server error";
    const status = err instanceof Error && "status" in err ? (err as any).status : 500;
    return errorResponse(message, status);
  }
}

export async function POST(request: NextRequest) {
  try {
    const ctx = await getSupabaseAndUser();
    const schoolId = requireSchool(ctx);
    requireRole(ctx, ["SCHOOL_ADMIN"]);

    const body = await request.json();
    const parsed = createSlotSchema.safeParse(body);
    if (!parsed.success) {
      return errorResponse(parsed.error.issues[0].message, 400);
    }

    // Check for teacher conflict: same teacher + period + day already assigned
    if (parsed.data.teacher_id) {
      const { data: conflict } = await ctx.supabase
        .from("timetable_slots")
        .select("id, class:classes(name), subject:subjects(name)")
        .eq("teacher_id", parsed.data.teacher_id)
        .eq("period_id", parsed.data.period_id)
        .eq("day_of_week", parsed.data.day_of_week)
        .eq("academic_year_id", parsed.data.academic_year_id)
        .eq("is_deleted", false)
        .neq("class_id", parsed.data.class_id)
        .maybeSingle();

      if (conflict) {
        const className = (conflict.class as any)?.name ?? "another class";
        const subjectName = (conflict.subject as any)?.name ?? "a subject";
        return errorResponse(
          `Teacher is already teaching ${subjectName} in ${className} at this time`,
          409
        );
      }
    }

    // Upsert: on conflict class_id+period_id+day_of_week+academic_year_id → update
    const { data: slot, error } = await ctx.supabase
      .from("timetable_slots")
      .upsert(
        {
          school_id: schoolId,
          class_id: parsed.data.class_id,
          period_id: parsed.data.period_id,
          day_of_week: parsed.data.day_of_week,
          subject_id: parsed.data.subject_id || null,
          teacher_id: parsed.data.teacher_id || null,
          room: parsed.data.room || null,
          academic_year_id: parsed.data.academic_year_id,
          is_deleted: false,
        } as any,
        {
          onConflict: "class_id,period_id,day_of_week,academic_year_id",
        }
      )
      .select()
      .single();

    if (error) return errorResponse(error.message, 400);

    return successResponse(slot, 201);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Internal server error";
    const status = err instanceof Error && "status" in err ? (err as any).status : 500;
    return errorResponse(message, status);
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const ctx = await getSupabaseAndUser();
    const schoolId = requireSchool(ctx);
    requireRole(ctx, ["SCHOOL_ADMIN"]);

    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");
    if (!id) return errorResponse("Missing id parameter", 400);

    const { data: existing } = await ctx.supabase
      .from("timetable_slots")
      .select("id")
      .eq("id", id)
      .eq("school_id", schoolId)
      .eq("is_deleted", false)
      .single();

    if (!existing) return errorResponse("Slot not found", 404);

    const { error } = await ctx.supabase
      .from("timetable_slots")
      .update({ is_deleted: true } as any)
      .eq("id", id);

    if (error) return errorResponse(error.message, 400);

    return successResponse({ deleted: true });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Internal server error";
    const status = err instanceof Error && "status" in err ? (err as any).status : 500;
    return errorResponse(message, status);
  }
}

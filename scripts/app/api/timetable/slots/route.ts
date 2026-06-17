import { NextRequest } from "next/server";
import type { Database } from "@/types/database";
import { z } from "zod";
import {
  getSupabaseAndUser,
  requireSchool,
  requireRole,
  successResponse,
  errorResponse,
  dbError,
  getErrorStatus } from "@/lib/api-helpers";

const createSlotSchema = z.object({
  class_id: z.string().uuid(),
  period_id: z.string().uuid(),
  day_of_week: z.number().int().min(1).max(5), // Mon-Fri
  subject_id: z.string().uuid().optional().nullable(),
  teacher_id: z.string().uuid().optional().nullable(),
  room: z.string().optional().nullable(),
  academic_year_id: z.string().uuid() });

export async function GET(request: NextRequest) {
  try {
    const ctx = await getSupabaseAndUser();
    const schoolId = requireSchool(ctx);
    // Audit 4.2, 4.4: Only admins, teachers, and super admins read the
    // timetable. BURSAR and PARENT should be 403'd, not silently
    // shown an empty list because `requireSchool` returned 400.
    requireRole(ctx, ["SCHOOL_ADMIN", "TEACHER", "SUPER_ADMIN"]);

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

    if (error) return dbError(error, "Database error");

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
    requireRole(ctx, ["SCHOOL_ADMIN"]);

    const body = await request.json();
    const parsed = createSlotSchema.safeParse(body);
    if (!parsed.success) {
      return errorResponse(parsed.error.issues[0].message, 400);
    }

    // Every FK supplied in the body must belong to the caller's school, otherwise
    // a slot could reference another tenant's class/teacher/subject/period/year.
    const fkChecks: { table: string; id: string | null | undefined; label: string }[] = [
      { table: "classes", id: parsed.data.class_id, label: "class" },
      { table: "timetable_periods", id: parsed.data.period_id, label: "period" },
      { table: "academic_years", id: parsed.data.academic_year_id, label: "academic year" },
      { table: "subjects", id: parsed.data.subject_id, label: "subject" },
      { table: "users", id: parsed.data.teacher_id, label: "teacher" },
    ];
    for (const fk of fkChecks) {
      if (!fk.id) continue;
      const { data: row } = await ctx.supabase
        .from(fk.table as "classes")
        .select("id")
        .eq("id", fk.id)
        .eq("school_id", schoolId)
        .maybeSingle();
      if (!row) return errorResponse(`Invalid ${fk.label} for this school`, 400);
    }

    // Check for teacher conflict: same teacher + period + day already assigned.
    // Scoped to this school so it never matches (or leaks the names of) another
    // school's slots.
    if (parsed.data.teacher_id) {
      const { data: conflict } = await ctx.supabase
        .from("timetable_slots")
        .select("id, class:classes(name), subject:subjects(name)")
        .eq("school_id", schoolId)
        .eq("teacher_id", parsed.data.teacher_id)
        .eq("period_id", parsed.data.period_id)
        .eq("day_of_week", parsed.data.day_of_week)
        .eq("academic_year_id", parsed.data.academic_year_id)
        .eq("is_deleted", false)
        .neq("class_id", parsed.data.class_id)
        .maybeSingle();

      if (conflict) {
        const className =
          (conflict.class as unknown as { name: string } | null)?.name ?? "another class";
        const subjectName =
          (conflict.subject as unknown as { name: string } | null)?.name ?? "a subject";
        return errorResponse(
          `Teacher is already teaching ${subjectName} in ${className} at this time`,
          409
        );
      }
    }

    // Upsert: on conflict class_id+period_id+day_of_week+academic_year_id -> update
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
          is_deleted: false } as unknown as Database["public"]["Tables"]["timetable_slots"]["Insert"],
        {
          onConflict: "class_id,period_id,day_of_week,academic_year_id" }
      )
      .select()
      .single();

    if (error) return dbError(error, "Database error");

    return successResponse(slot, 201);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Internal server error";
    const status = getErrorStatus(err);
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
      .update({ is_deleted: true } as unknown as Database["public"]["Tables"]["timetable_slots"]["Update"])
      .eq("id", id);

    if (error) return dbError(error, "Database error");

    return successResponse({ deleted: true });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Internal server error";
    const status = getErrorStatus(err);
    return errorResponse(message, status);
  }
}

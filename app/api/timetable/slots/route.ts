import type { Database } from "@/types/database";
import { z } from "zod";
import { route, AuthError, dbError } from "@/lib/http";

const createSlotSchema = z.object({
  class_id: z.string().uuid(),
  period_id: z.string().uuid(),
  day_of_week: z.number().int().min(1).max(5),
  subject_id: z.string().uuid().optional().nullable(),
  teacher_id: z.string().uuid().optional().nullable(),
  room: z.string().optional().nullable(),
  academic_year_id: z.string().uuid(),
});

export const GET = route({
  roles: ["SCHOOL_ADMIN", "TEACHER", "SUPER_ADMIN"],
  handler: async (ctx, request) => {
    const schoolId = ctx.profile.school_id!;
    const { searchParams } = new URL(request.url);
    const classId = searchParams.get("class_id");
    const academicYearId = searchParams.get("academic_year_id");
    const teacherId = searchParams.get("teacher_id");

    let query = ctx.supabase
      .from("timetable_slots")
      .select(
        "*, period:timetable_periods(id, name, start_time, end_time, sort_order), subject:subjects(id, name), teacher:users!teacher_id(id, full_name), class:classes(id, name)",
      )
      .eq("school_id", schoolId)
      .eq("is_deleted", false);

    if (classId) query = query.eq("class_id", classId);
    if (academicYearId) query = query.eq("academic_year_id", academicYearId);
    if (teacherId) query = query.eq("teacher_id", teacherId);

    const { data, error } = await query.order("day_of_week", { ascending: true });

    if (error) return dbError(error, "Database error");
    return data ?? [];
  },
});

export const POST = route({
  roles: ["SCHOOL_ADMIN"],
  schema: createSlotSchema,
  handler: async (ctx, body) => {
    const schoolId = ctx.profile.school_id!;

    const fkChecks: {
      table: string;
      id: string | null | undefined;
      label: string;
    }[] = [
      { table: "classes", id: body.class_id, label: "class" },
      { table: "timetable_periods", id: body.period_id, label: "period" },
      {
        table: "academic_years",
        id: body.academic_year_id,
        label: "academic year",
      },
      { table: "subjects", id: body.subject_id, label: "subject" },
      { table: "users", id: body.teacher_id, label: "teacher" },
    ];
    for (const fk of fkChecks) {
      if (!fk.id) continue;
      const { data: row } = await ctx.supabase
        .from(fk.table as "classes")
        .select("id")
        .eq("id", fk.id)
        .eq("school_id", schoolId)
        .maybeSingle();
      if (!row)
        throw new AuthError(`Invalid ${fk.label} for this school`, 400);
    }

    if (body.teacher_id) {
      const { data: conflict } = await ctx.supabase
        .from("timetable_slots")
        .select("id, class:classes(name), subject:subjects(name)")
        .eq("school_id", schoolId)
        .eq("teacher_id", body.teacher_id)
        .eq("period_id", body.period_id)
        .eq("day_of_week", body.day_of_week)
        .eq("academic_year_id", body.academic_year_id)
        .eq("is_deleted", false)
        .neq("class_id", body.class_id)
        .maybeSingle();

      if (conflict) {
        const className =
          (conflict.class as unknown as { name: string } | null)?.name ??
          "another class";
        const subjectName =
          (conflict.subject as unknown as { name: string } | null)?.name ??
          "a subject";
        throw new AuthError(
          `Teacher is already teaching ${subjectName} in ${className} at this time`,
          409,
        );
      }
    }

    const { data: slot, error } = await ctx.supabase
      .from("timetable_slots")
      .upsert(
        {
          school_id: schoolId,
          class_id: body.class_id,
          period_id: body.period_id,
          day_of_week: body.day_of_week,
          subject_id: body.subject_id || null,
          teacher_id: body.teacher_id || null,
          room: body.room || null,
          academic_year_id: body.academic_year_id,
          is_deleted: false,
        } as unknown as Database["public"]["Tables"]["timetable_slots"]["Insert"],
        { onConflict: "class_id,period_id,day_of_week,academic_year_id" },
      )
      .select()
      .single();

    if (error) return dbError(error, "Database error", 400);
    return slot;
  },
});

export const DELETE = route({
  roles: ["SCHOOL_ADMIN"],
  handler: async (ctx, request) => {
    const schoolId = ctx.profile.school_id!;
    const id = new URL(request.url).searchParams.get("id");
    if (!id) throw new AuthError("Missing id parameter", 400);

    const { data: existing } = await ctx.supabase
      .from("timetable_slots")
      .select("id")
      .eq("id", id)
      .eq("school_id", schoolId)
      .eq("is_deleted", false)
      .single();

    if (!existing) throw new AuthError("Slot not found", 404);

    const { error } = await ctx.supabase
      .from("timetable_slots")
      .update({
        is_deleted: true,
      } as unknown as Database["public"]["Tables"]["timetable_slots"]["Update"])
      .eq("id", id);

    if (error) return dbError(error, "Database error", 400);
    return { deleted: true };
  },
});
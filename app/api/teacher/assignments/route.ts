import type { Database } from "@/types/database";
import { z } from "zod";
import { route, AuthError, dbError } from "@/lib/http";

const createAssignmentsSchema = z.object({
  teacher_id: z.string().uuid(),
  assignments: z
    .array(
      z.object({
        class_id: z.string().uuid(),
        subject_id: z.string().uuid().optional().nullable(),
        is_class_teacher: z.boolean().optional().default(false),
      }),
    )
    .min(1),
});

export const GET = route({
  roles: ["SCHOOL_ADMIN", "TEACHER", "SUPER_ADMIN"],
  handler: async (ctx, request) => {
    const schoolId = ctx.profile.school_id!;
    const { searchParams } = new URL(request.url);
    const teacherId = searchParams.get("teacher_id");

    let query = ctx.supabase
      .from("teacher_class_assignments")
      .select("*, class:classes(id, name, stream), subject:subjects(id, name)")
      .eq("school_id", schoolId)
      .eq("is_deleted", false);

    if (teacherId) query = query.eq("teacher_id", teacherId);

    const { data, error } = await query.order("created_at", { ascending: false });

    if (error) return dbError(error, "Database error");
    return data ?? [];
  },
});

export const POST = route({
  roles: ["SCHOOL_ADMIN"],
  schema: createAssignmentsSchema,
  handler: async (ctx, body) => {
    const schoolId = ctx.profile.school_id!;

    const { data: teacher } = await ctx.supabase
      .from("users")
      .select("id")
      .eq("id", body.teacher_id)
      .eq("school_id", schoolId)
      .maybeSingle();
    if (!teacher)
      throw new AuthError("Teacher not found in this school", 404);

    const classIds = Array.from(
      new Set(body.assignments.map((a) => a.class_id)),
    );
    const subjectIds = Array.from(
      new Set(
        body.assignments
          .map((a) => a.subject_id)
          .filter((s): s is string => !!s),
      ),
    );

    const { data: validClasses } = await ctx.supabase
      .from("classes")
      .select("id")
      .eq("school_id", schoolId)
      .in("id", classIds);
    const foundClassIds = new Set(
      (validClasses ?? []).map((c: { id: string }) => c.id),
    );
    for (const cid of classIds) {
      if (!foundClassIds.has(cid)) {
        throw new AuthError("Invalid class for this school", 400);
      }
    }

    if (subjectIds.length > 0) {
      const { data: validSubjects } = await ctx.supabase
        .from("subjects")
        .select("id")
        .eq("school_id", schoolId)
        .in("id", subjectIds);
      const foundSubjectIds = new Set(
        (validSubjects ?? []).map((s: { id: string }) => s.id),
      );
      for (const sid of subjectIds) {
        if (!foundSubjectIds.has(sid)) {
          throw new AuthError("Invalid subject for this school", 400);
        }
      }
    }

    await ctx.supabase
      .from("teacher_class_assignments")
      .update({
        is_deleted: true,
      } as unknown as Database["public"]["Tables"]["teacher_class_assignments"]["Update"])
      .eq("teacher_id", body.teacher_id)
      .eq("school_id", schoolId);

    const rows = body.assignments.map((a) => ({
      teacher_id: body.teacher_id,
      class_id: a.class_id,
      subject_id: a.subject_id || null,
      is_class_teacher: a.is_class_teacher,
      school_id: schoolId,
      is_deleted: false,
    }));

    const { data: inserted, error } = await ctx.supabase
      .from("teacher_class_assignments")
      .insert(
        rows as unknown as Database["public"]["Tables"]["teacher_class_assignments"]["Insert"],
      )
      .select();

    if (error) return dbError(error, "Database error", 400);
    return { assigned: inserted?.length ?? 0 };
  },
});

export const DELETE = route({
  roles: ["SCHOOL_ADMIN"],
  handler: async (ctx, request) => {
    const schoolId = ctx.profile.school_id!;
    const { searchParams } = new URL(request.url);
    const teacherId = searchParams.get("teacher_id");
    const classId = searchParams.get("class_id");
    const subjectId = searchParams.get("subject_id");

    if (!teacherId || !classId) {
      throw new AuthError("Missing teacher_id or class_id", 400);
    }

    let query = ctx.supabase
      .from("teacher_class_assignments")
      .update({
        is_deleted: true,
      } as unknown as Database["public"]["Tables"]["teacher_class_assignments"]["Update"])
      .eq("teacher_id", teacherId)
      .eq("class_id", classId)
      .eq("school_id", schoolId);

    if (subjectId) {
      query = query.eq("subject_id", subjectId);
    }

    const { error } = await query;

    if (error) return dbError(error, "Database error", 400);
    return { deleted: true };
  },
});
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

const createAssignmentsSchema = z.object({
  teacher_id: z.string().uuid(),
  assignments: z.array(
    z.object({
      class_id: z.string().uuid(),
      subject_id: z.string().uuid().optional().nullable(),
      is_class_teacher: z.boolean().optional().default(false) })
  ).min(1) });

export async function GET(request: NextRequest) {
  try {
    const ctx = await getSupabaseAndUser();
    const schoolId = requireSchool(ctx);
    requireRole(ctx, ["SCHOOL_ADMIN", "TEACHER", "SUPER_ADMIN"]);

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
    const parsed = createAssignmentsSchema.safeParse(body);
    if (!parsed.success) {
      return errorResponse(parsed.error.issues[0].message, 400);
    }

    const { teacher_id, assignments } = parsed.data;

    // The teacher must belong to this school.
    const { data: teacher } = await ctx.supabase
      .from("users")
      .select("id")
      .eq("id", teacher_id)
      .eq("school_id", schoolId)
      .maybeSingle();
    if (!teacher) return errorResponse("Teacher not found in this school", 404);

    // Audit 4.10: previously every class/subject was validated with a
    // separate round-trip in a for-loop. For 20 assignments that's
    // 20 + (subjects) round-trips. Now we collect the unique IDs and
    // validate them with two single .in() queries. Worst case: 3
    // round-trips (teacher + classes + subjects) regardless of how
    // many assignments the client sends.
    const classIds = Array.from(new Set(assignments.map((a) => a.class_id)));
    const subjectIds = Array.from(
      new Set(assignments.map((a) => a.subject_id).filter((s): s is string => !!s)),
    );

    const { data: validClasses } = await ctx.supabase
      .from("classes")
      .select("id")
      .eq("school_id", schoolId)
      .in("id", classIds);
    const foundClassIds = new Set((validClasses ?? []).map((c: { id: string }) => c.id));
    for (const cid of classIds) {
      if (!foundClassIds.has(cid)) {
        return errorResponse("Invalid class for this school", 400);
      }
    }

    if (subjectIds.length > 0) {
      const { data: validSubjects } = await ctx.supabase
        .from("subjects")
        .select("id")
        .eq("school_id", schoolId)
        .in("id", subjectIds);
      const foundSubjectIds = new Set((validSubjects ?? []).map((s: { id: string }) => s.id));
      for (const sid of subjectIds) {
        if (!foundSubjectIds.has(sid)) {
          return errorResponse("Invalid subject for this school", 400);
        }
      }
    }

    // Soft delete existing assignments for this teacher
    await ctx.supabase
      .from("teacher_class_assignments")
      .update({ is_deleted: true } as unknown as Database["public"]["Tables"]["teacher_class_assignments"]["Update"])
      .eq("teacher_id", teacher_id)
      .eq("school_id", schoolId);

    // Insert new assignments
    const rows = assignments.map((a) => ({
      teacher_id,
      class_id: a.class_id,
      subject_id: a.subject_id || null,
      is_class_teacher: a.is_class_teacher,
      school_id: schoolId,
      is_deleted: false }));

    const { data: inserted, error } = await ctx.supabase
      .from("teacher_class_assignments")
      .insert(rows as unknown as Database["public"]["Tables"]["teacher_class_assignments"]["Insert"])
      .select();

    if (error) return dbError(error, "Database error");

    return successResponse({ assigned: inserted?.length ?? 0 });
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
    const teacherId = searchParams.get("teacher_id");
    const classId = searchParams.get("class_id");
    const subjectId = searchParams.get("subject_id");

    if (!teacherId || !classId) {
      return errorResponse("Missing teacher_id or class_id", 400);
    }

    let query = ctx.supabase
      .from("teacher_class_assignments")
      .update({ is_deleted: true } as unknown as Database["public"]["Tables"]["teacher_class_assignments"]["Update"])
      .eq("teacher_id", teacherId)
      .eq("class_id", classId)
      .eq("school_id", schoolId);

    if (subjectId) {
      query = query.eq("subject_id", subjectId);
    }

    const { error } = await query;

    if (error) return dbError(error, "Database error");

    return successResponse({ deleted: true });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Internal server error";
    const status = getErrorStatus(err);
    return errorResponse(message, status);
  }
}

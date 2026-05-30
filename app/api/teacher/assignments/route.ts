import { NextRequest } from "next/server";
import { z } from "zod";
import {
  getSupabaseAndUser,
  requireSchool,
  requireRole,
  successResponse,
  errorResponse,
} from "@/lib/api-helpers";

const createAssignmentsSchema = z.object({
  teacher_id: z.string().uuid(),
  assignments: z.array(
    z.object({
      class_id: z.string().uuid(),
      subject_id: z.string().uuid().optional().nullable(),
      is_class_teacher: z.boolean().optional().default(false),
    })
  ).min(1),
});

export async function GET(request: NextRequest) {
  try {
    const ctx = await getSupabaseAndUser();
    const schoolId = requireSchool(ctx);

    const { searchParams } = new URL(request.url);
    const teacherId = searchParams.get("teacher_id");

    let query = ctx.supabase
      .from("teacher_class_assignments")
      .select("*, class:classes(id, name, stream), subject:subjects(id, name)")
      .eq("school_id", schoolId)
      .eq("is_deleted", false);

    if (teacherId) query = query.eq("teacher_id", teacherId);

    const { data, error } = await query.order("created_at", { ascending: false });

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
    const parsed = createAssignmentsSchema.safeParse(body);
    if (!parsed.success) {
      return errorResponse(parsed.error.issues[0].message, 400);
    }

    const { teacher_id, assignments } = parsed.data;

    // Soft delete existing assignments for this teacher
    await ctx.supabase
      .from("teacher_class_assignments")
      .update({ is_deleted: true } as any)
      .eq("teacher_id", teacher_id)
      .eq("school_id", schoolId);

    // Insert new assignments
    const rows = assignments.map((a) => ({
      teacher_id,
      class_id: a.class_id,
      subject_id: a.subject_id || null,
      is_class_teacher: a.is_class_teacher,
      school_id: schoolId,
      is_deleted: false,
    }));

    const { data: inserted, error } = await ctx.supabase
      .from("teacher_class_assignments")
      .insert(rows as any)
      .select();

    if (error) return errorResponse(error.message, 400);

    return successResponse({ assigned: inserted?.length ?? 0 });
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
    const teacherId = searchParams.get("teacher_id");
    const classId = searchParams.get("class_id");
    const subjectId = searchParams.get("subject_id");

    if (!teacherId || !classId) {
      return errorResponse("Missing teacher_id or class_id", 400);
    }

    let query = ctx.supabase
      .from("teacher_class_assignments")
      .update({ is_deleted: true } as any)
      .eq("teacher_id", teacherId)
      .eq("class_id", classId)
      .eq("school_id", schoolId);

    if (subjectId) {
      query = query.eq("subject_id", subjectId);
    }

    const { error } = await query;

    if (error) return errorResponse(error.message, 400);

    return successResponse({ deleted: true });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Internal server error";
    const status = err instanceof Error && "status" in err ? (err as any).status : 500;
    return errorResponse(message, status);
  }
}

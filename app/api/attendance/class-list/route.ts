import { NextRequest } from "next/server";
import {
  getSupabaseAndUser,
  requireSchool,
  requireRole,
  successResponse,
  errorResponse,
} from "@/lib/api-helpers";

export async function GET(_request: NextRequest) {
  try {
    const ctx = await getSupabaseAndUser();
    const schoolId = requireSchool(ctx);
    requireRole(ctx, ["TEACHER", "SCHOOL_ADMIN", "SUPER_ADMIN"]);

    // Fetch teacher's homeroom class assignments with student lists
    const { data: assignments, error: assignErr } = await ctx.supabase
      .from("teacher_class_assignments")
      .select(
        `
        class_id,
        is_class_teacher,
        class:classes(id, name, stream)
      `
      )
      .eq("teacher_id", ctx.user.id)
      .eq("is_class_teacher", true)
      .eq("is_deleted", false);

    if (assignErr) return errorResponse(assignErr.message);

    const classes = assignments ?? [];

    // For each homeroom class, fetch enrolled students
    const result = await Promise.all(
      classes.map(async (a: any) => {
        const { data: enrollments } = await ctx.supabase
          .from("class_enrollments")
          .select("student_id, students(id, full_name, admission_number)")
          .eq("class_id", a.class_id)
          .eq("is_deleted", false);

        return {
          classId: a.class_id,
          className: a.class?.name ?? "Unknown",
          stream: a.class?.stream ?? null,
          students: (enrollments ?? []).map((e: any) => ({
            id: e.student_id,
            name: e.students?.full_name ?? "Unknown",
            admission_number: e.students?.admission_number ?? "",
          })),
        };
      })
    );

    return successResponse({ classes: result });
  } catch (err: unknown) {
    const message =
      err instanceof Error ? err.message : "Internal server error";
    const status =
      err instanceof Error && "status" in err ? (err as any).status : 500;
    return errorResponse(message, status);
  }
}

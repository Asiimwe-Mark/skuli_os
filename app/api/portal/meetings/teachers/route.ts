import { NextRequest } from "next/server";
import {
  getSupabaseAndUser,
  requireRole,
  successResponse,
  errorResponse,
} from "@/lib/api-helpers";

export async function GET(req: NextRequest) {
  try {
    const ctx = await getSupabaseAndUser();
    requireRole(ctx, ["PARENT"]);

    const { searchParams } = new URL(req.url);
    const studentId = searchParams.get("student_id");

    if (!studentId) {
      return errorResponse("student_id required", 400);
    }

    // SECURITY (audit H-2): verify parent_students link BEFORE doing
    // any other read. The previous version had no auth check at all
    // — any authenticated parent could pass any student_id and read
    // that student's class teacher. parent_students is the only
    // authority on which students a parent can read.
    const { data: parentLink } = await ctx.supabase
      .from("parent_students")
      .select("student_id")
      .eq("parent_id", ctx.user.id)
      .eq("student_id", studentId)
      .maybeSingle();

    if (!parentLink) {
      return errorResponse("Not linked to this student", 403);
    }

    const { data: student } = await ctx.supabase
      .from("students")
      .select("current_class_id, classes(class_teacher_id, name)")
      .eq("id", studentId)
      .single();

    if (!student?.current_class_id) {
      return successResponse([]);
    }

    const classData = student.classes as Record<string, unknown> | null;
    const classTeacherId = classData?.class_teacher_id as string | null;

    if (!classTeacherId) {
      return successResponse([]);
    }

    const { data: staff } = await ctx.supabase
      .from("staff")
      .select("id, full_name, role_title")
      .eq("user_id", classTeacherId)
      .eq("is_active", true)
      .single();

    if (!staff) return successResponse([]);
    return successResponse([staff]);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Internal server error";
    const status = err instanceof Error && "status" in err ? (err as { status: number }).status : 500;
    return errorResponse(message, status);
  }
}

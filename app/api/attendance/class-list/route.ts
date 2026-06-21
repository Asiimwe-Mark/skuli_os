import { route, dbError, errorResponse } from "@/lib/http";

export const GET = route({
  roles: ["TEACHER", "SCHOOL_ADMIN", "SUPER_ADMIN"],
  handler: async (ctx, request) => {
    const schoolId = ctx.profile.school_id!;

    const { searchParams } = new URL(request.url);
    const classId = searchParams.get("class_id");

    if (!classId) return errorResponse("class_id is required", 400);

    // Verify class belongs to this school before reading enrollments.
    const { data: cls, error: clsErr } = await ctx.supabase
      .from("classes")
      .select("id")
      .eq("id", classId)
      .eq("school_id", schoolId)
      .maybeSingle();

    if (clsErr) return dbError(clsErr, "Database error");
    if (!cls) return errorResponse("Class not found", 404);

    const { data: enrollments, error } = await ctx.supabase
      .from("class_enrollments")
      .select("student_id, students(id, full_name, admission_number)")
      .eq("class_id", classId);

    if (error) return dbError(error, "Database error");

    type StudentJoin = { id: string; full_name: string; admission_number: string };
    const students = (enrollments ?? []).map((e) => {
      const s = (Array.isArray(e.students) ? e.students[0] : e.students) as
        | StudentJoin
        | null
        | undefined;
      return {
        id: s?.id ?? "",
        full_name: s?.full_name ?? "Unknown",
        admission_number: s?.admission_number ?? "",
        student_id: e.student_id,
      };
    });

    return { students };
  },
});

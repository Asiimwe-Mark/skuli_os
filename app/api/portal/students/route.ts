import {
  getSupabaseAndUser,
  requireRole,
  successResponse,
  errorResponse,
  getErrorStatus,
} from "@/lib/api-helpers";

interface LinkedStudent {
  student_id: string;
  student: {
    id: string;
    full_name: string;
    admission_number: string;
    class: { id: string; name: string } | null;
    school: { id: string; name: string; motto: string | null } | null;
  };
}

interface StudentRow {
  id: string;
  full_name: string | null;
  admission_number: string | null;
  // The class and school joins come back as objects (or null) from
  // PostgREST — typed here so the formatter below can stay strict.
  class: { id: string; name: string } | null;
  school: { id: string; name: string; motto: string | null } | null;
}

export async function GET() {
  try {
    const ctx = await getSupabaseAndUser();
    requireRole(ctx, ["PARENT"]);

    // SECURITY (audit H-2): parent_students is the SOLE authority on
    // which students belong to which parent. The previous
    // implementation also matched on `students.parent_phone` /
    // `students.parent_email`, which let a parent who happened to
    // share a phone/email with another parent's child see and pay
    // for that child. Phone and email are mutable, not unique, and
    // can be reassigned. We no longer fall back to a phone/email
    // match — the link table is the contract.
    const { data: parentLinks, error: linksError } = await ctx.supabase
      .from("parent_students")
      .select("student_id")
      .eq("parent_id", ctx.user.id);

    if (linksError) {
      return errorResponse("Failed to load linked students", 500);
    }

    const studentIds = (parentLinks ?? []).map((l) => l.student_id);
    if (studentIds.length === 0) {
      return successResponse({ students: [] });
    }

    const studentSelect =
      "id, full_name, admission_number, current_class_id, class:current_class_id(id, name), school:schools(id, name, motto)";

    const { data: students, error: studentsError } = await ctx.supabase
      .from("students")
      .select(studentSelect)
      .in("id", studentIds)
      .eq("is_deleted", false);

    if (studentsError) return errorResponse("Failed to load students", 500);

    const rows = (students ?? []) as StudentRow[];
    const formatted: LinkedStudent[] = rows.map((s) => ({
      student_id: s.id,
      student: {
        id: s.id,
        full_name: s.full_name ?? "",
        admission_number: s.admission_number ?? "",
        class: s.class ?? null,
        school: s.school ?? null,
      },
    }));

    return successResponse({ students: formatted });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Internal server error";
    const status = getErrorStatus(err);
    return errorResponse(message, status);
  }
}

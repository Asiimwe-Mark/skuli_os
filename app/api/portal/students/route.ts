import { route } from "@/lib/http";

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
  class: { id: string; name: string } | null;
  school: { id: string; name: string; motto: string | null } | null;
}

export const GET = route({
  roles: ["PARENT"],
  handler: async (ctx) => {
    // SECURITY (audit H-2): parent_students is the SOLE authority on
    // which students belong to which parent.
    const { data: parentLinks, error: linksError } = await ctx.supabase
      .from("parent_students")
      .select("student_id")
      .eq("parent_id", ctx.user.id);

    if (linksError) {
      throw new Error("Failed to load linked students");
    }

    const studentIds = (parentLinks ?? []).map((l) => l.student_id);
    if (studentIds.length === 0) {
      return { students: [] };
    }

    const studentSelect =
      "id, full_name, admission_number, current_class_id, class:current_class_id(id, name), school:schools(id, name, motto)";

    const { data: students, error: studentsError } = await ctx.supabase
      .from("students")
      .select(studentSelect)
      .in("id", studentIds)
      .eq("is_deleted", false);

    if (studentsError) {
      throw new Error("Failed to load students");
    }

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

    return { students: formatted };
  },
});
import {
  getSupabaseAndUser,
  requireRole,
  successResponse,
  errorResponse,
} from "@/lib/api-helpers";

export async function GET() {
  try {
    const ctx = await getSupabaseAndUser();
    requireRole(ctx, ["PARENT"]);

    // Find students linked to this parent via parent_phone or parent_email
    const { data: user } = await ctx.supabase
      .from("users")
      .select("phone, email")
      .eq("id", ctx.user.id)
      .single();

    let students: any[] = [];

    if (user?.phone) {
      const { data } = await ctx.supabase
        .from("students")
        .select(
          "id, first_name:full_name, last_name, admission_number, current_class_id, class:current_class_id(id, name), school:schools(id, name, motto)"
        )
        .eq("parent_phone", user.phone)
        .eq("is_deleted", false);
      students = data ?? [];
    }

    if (user?.email && students.length === 0) {
      const { data } = await ctx.supabase
        .from("students")
        .select(
          "id, first_name:full_name, last_name, admission_number, current_class_id, class:current_class_id(id, name), school:schools(id, name, motto)"
        )
        .eq("parent_email", user.email)
        .eq("is_deleted", false);
      students = data ?? [];
    }

    // Also check parent_students table
    const { data: parentLinks } = await ctx.supabase
      .from("parent_students")
      .select("student_id")
      .eq("parent_user_id", ctx.user.id);

    if (parentLinks && parentLinks.length > 0) {
      const linkedIds = parentLinks.map((l: any) => l.student_id);
      const existingIds = new Set(students.map((s: any) => s.id));
      const missingIds = linkedIds.filter((id: string) => !existingIds.has(id));

      if (missingIds.length > 0) {
        const { data: linked } = await ctx.supabase
          .from("students")
          .select(
            "id, first_name:full_name, last_name, admission_number, current_class_id, class:current_class_id(id, name), school:schools(id, name, motto)"
          )
          .in("id", missingIds)
          .eq("is_deleted", false);
        students = [...students, ...(linked ?? [])];
      }
    }

    // Format for PortalContext
    const formatted = students.map((s: any) => ({
      student_id: s.id,
      student: {
        id: s.id,
        first_name: s.first_name ?? "",
        last_name: s.last_name ?? "",
        admission_number: s.admission_number ?? "",
        class: s.class ?? null,
        school: s.school ?? null,
      },
    }));

    return successResponse({ students: formatted });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Internal server error";
    const status = err instanceof Error && "status" in err ? (err as any).status : 500;
    return errorResponse(message, status);
  }
}

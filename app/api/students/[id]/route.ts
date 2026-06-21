import type { Database } from "@/types/database";
import { updateStudentSchema } from "@/lib/validations/student";
import { route, errorResponse, dbError } from "@/lib/http";

export const GET = route({
  roles: ["SCHOOL_ADMIN", "BURSAR", "TEACHER", "SUPER_ADMIN"],
  handler: async (ctx, _request, params) => {
    const schoolId = ctx.profile.school_id!;
    const { id } = params ?? {};

    if (!id) {
      return errorResponse("Student ID is required", 400);
    }

    const { data: student, error } = await ctx.supabase
      .from("students")
      .select(`
        *,
        current_class:classes(id, name, level, stream),
        class_enrollments(
          id,
          class_id,
          term_id,
          academic_year_id,
          class:classes(id, name),
          term:terms(id, name, academic_year_id)
        )
      `)
      .eq("id", id)
      .eq("school_id", schoolId)
      .eq("is_deleted", false)
      .single();

    if (error || !student) {
      return errorResponse("Student not found", 404);
    }

    return student;
  },
});

export const PATCH = route({
  roles: ["SCHOOL_ADMIN", "BURSAR", "SUPER_ADMIN"],
  handler: async (ctx, request, params) => {
    const schoolId = ctx.profile.school_id!;
    const { id } = params ?? {};

    if (!id) {
      return errorResponse("Student ID is required", 400);
    }

    // Fetch existing student for audit comparison
    const { data: existing } = await ctx.supabase
      .from("students")
      .select("*")
      .eq("id", id)
      .eq("school_id", schoolId)
      .eq("is_deleted", false)
      .single() as { data: Record<string, unknown> | null };

    if (!existing) {
      return errorResponse("Student not found", 404);
    }

    const body = await request.json();
    const parsed = updateStudentSchema.safeParse({ ...body, id });
    if (!parsed.success) {
      return errorResponse(parsed.error.issues[0].message, 400);
    }

    const { id: _id, ...updateData } = parsed.data;
    void _id;

    const { data: student, error } = await ctx.supabase
      .from("students")
      .update(updateData as unknown as Database["public"]["Tables"]["students"]["Update"])
      .eq("id", id)
      .eq("school_id", schoolId)
      .select()
      .single();

    if (error) return dbError(error, "Database error", 400);

    // If the class assignment changed, keep class_enrollments in sync so
    // attendance and marks sheets reflect the new placement immediately.
    // Without this, the dashboard's "Students" KPI updated but the
    // attendance page kept showing the student in their old class.
    if (
      student &&
      parsed.data.current_class_id &&
      parsed.data.current_class_id !== (existing as { current_class_id: string | null }).current_class_id
    ) {
      const { data: term } = await ctx.supabase
        .from("terms")
        .select("id, academic_year_id")
        .eq("school_id", schoolId)
        .eq("is_current", true)
        .single() as { data: { id: string; academic_year_id: string } | null };

      if (term) {
        // Upsert so a previously-promoted student in a different term is
        // either updated (if same term) or left alone.
        await ctx.supabase.from("class_enrollments").upsert(
          {
            student_id: id,
            class_id: parsed.data.current_class_id,
            term_id: term.id,
            academic_year_id: term.academic_year_id,
          } as unknown as Database["public"]["Tables"]["class_enrollments"]["Insert"],
          { onConflict: "student_id,term_id" }
        );
      }
    }

    // Audit log
    await ctx.supabase.from("audit_logs").insert({
      school_id: schoolId,
      user_id: ctx.user.id,
      action: "student_updated",
      entity_type: "student",
      entity_id: id,
      old_value: { name: (existing as { full_name: string }).full_name, status: (existing as { status: string }).status },
      new_value: updateData,
    } as unknown as Database["public"]["Tables"]["audit_logs"]["Insert"]);

    return student;
  },
});

export const DELETE = route({
  roles: ["SCHOOL_ADMIN", "SUPER_ADMIN"],
  handler: async (ctx, _request, params) => {
    const schoolId = ctx.profile.school_id!;
    const { id } = params ?? {};

    if (!id) {
      return errorResponse("Student ID is required", 400);
    }

    const { data: existing } = await ctx.supabase
      .from("students")
      .select("id, full_name, admission_number")
      .eq("id", id)
      .eq("school_id", schoolId)
      .eq("is_deleted", false)
      .single() as { data: { id: string; full_name: string; admission_number: string } | null };

    if (!existing) {
      return errorResponse("Student not found", 404);
    }

    // Soft delete
    const { error } = await ctx.supabase
      .from("students")
      .update({ is_deleted: true, status: "left" })
      .eq("id", id)
      .eq("school_id", schoolId);

    if (error) return dbError(error, "Database error");

    // Audit log
    await ctx.supabase.from("audit_logs").insert({
      school_id: schoolId,
      user_id: ctx.user.id,
      action: "student_deleted",
      entity_type: "student",
      entity_id: id,
      old_value: { name: existing.full_name, admission: existing.admission_number },
    } as unknown as Database["public"]["Tables"]["audit_logs"]["Insert"]);

    return { deleted: true };
  },
});

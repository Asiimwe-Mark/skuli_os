import { updateStudentSchema } from "@/lib/validations/student";
import { route, errorResponse, dbError } from "@/lib/http";
import { writeAuditLog } from "@/lib/audit-log";
import { invalidateSchoolAsync } from "@/lib/api-cache";
import { scopedQuery } from "@/lib/http/scoped";

export const GET = route({
  roles: ["SCHOOL_ADMIN", "BURSAR", "TEACHER", "SUPER_ADMIN"],
  handler: async (ctx, _request, params) => {
    const { id } = params ?? {};
    if (!id) {
      return errorResponse("Student ID is required", 400);
    }

    const { data: student, error } = await scopedQuery(ctx, "students")
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
      .eq("is_deleted", false)
      .maybeSingle();

    if (error || !student) {
      return errorResponse("Student not found", 404);
    }
    return student;
  },
});

export const PATCH = route({
  roles: ["SCHOOL_ADMIN", "BURSAR", "SUPER_ADMIN"],
  handler: async (ctx, request, params) => {
    const { id } = params ?? {};
    if (!id) {
      return errorResponse("Student ID is required", 400);
    }

    const { data: existing } = await scopedQuery(ctx, "students")
      .select("*")
      .eq("id", id)
      .eq("is_deleted", false)
      .maybeSingle() as { data: Record<string, unknown> | null };

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

    const { data: student, error } = await scopedQuery(ctx, "students")
      .update(updateData as never)
      .eq("id", id)
      .select()
      .single();

    if (error) return dbError(error, "Database error", 400);

    if (
      student &&
      parsed.data.current_class_id &&
      parsed.data.current_class_id !== (existing as { current_class_id: string | null }).current_class_id
    ) {
      const { data: term } = await scopedQuery(ctx, "terms")
        .select("id, academic_year_id")
        .eq("is_current", true)
        .maybeSingle() as { data: { id: string; academic_year_id: string } | null };

      if (term) {
        await ctx.supabase.from("class_enrollments").upsert(
          {
            student_id: id,
            class_id: parsed.data.current_class_id,
            term_id: term.id,
            academic_year_id: term.academic_year_id,
          } as never,
          { onConflict: "student_id,term_id" }
        );
      }
    }

    await writeAuditLog(ctx.supabase, {
      school_id: ctx.schoolId,
      user_id: ctx.user.id,
      action: "student_updated",
      entity_type: "student",
      entity_id: id,
      old_value: { name: (existing as { full_name: string }).full_name, status: (existing as { status: string }).status },
      new_value: updateData as Record<string, unknown>,
    });

    void invalidateSchoolAsync(ctx.schoolId);
    return student;
  },
});

export const DELETE = route({
  roles: ["SCHOOL_ADMIN", "SUPER_ADMIN"],
  handler: async (ctx, _request, params) => {
    const { id } = params ?? {};
    if (!id) {
      return errorResponse("Student ID is required", 400);
    }

    const { data: existing } = await scopedQuery(ctx, "students")
      .select("id, full_name, admission_number")
      .eq("id", id)
      .eq("is_deleted", false)
      .maybeSingle() as { data: { id: string; full_name: string; admission_number: string } | null };

    if (!existing) {
      return errorResponse("Student not found", 404);
    }

    const { error } = await scopedQuery(ctx, "students")
      .update({ is_deleted: true, status: "left" } as never)
      .eq("id", id);

    if (error) return dbError(error, "Database error");

    await writeAuditLog(ctx.supabase, {
      school_id: ctx.schoolId,
      user_id: ctx.user.id,
      action: "student_deleted",
      entity_type: "student",
      entity_id: id,
      old_value: { name: existing.full_name, admission: existing.admission_number },
    });

    void invalidateSchoolAsync(ctx.schoolId);
    return { deleted: true };
  },
});
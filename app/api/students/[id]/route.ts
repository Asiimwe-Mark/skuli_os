import { NextRequest } from "next/server";
import type { Database } from "@/types/database";
import { updateStudentSchema } from "@/lib/validations/student";
import {
  getSupabaseAndUser,
  requireSchool,
  requireRole,
  successResponse,
  errorResponse,
} from "@/lib/api-helpers";

type StudentRow = Database["public"]["Tables"]["students"]["Row"];
type ClassRow = Database["public"]["Tables"]["classes"]["Row"];
type TermRow = Database["public"]["Tables"]["terms"]["Row"];
type ClassEnrollmentRow = Database["public"]["Tables"]["class_enrollments"]["Row"];

type EnrollmentWithJoins = ClassEnrollmentRow & {
  class: Pick<ClassRow, "id" | "name"> | null;
  term: Pick<TermRow, "id" | "name" | "academic_year_id"> | null;
};

type StudentWithJoins = StudentRow & {
  current_class: Pick<ClassRow, "id" | "name" | "level" | "stream"> | null;
  class_enrollments: EnrollmentWithJoins[];
};

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function GET(request: NextRequest, { params }: RouteContext) {
  try {
    const ctx = await getSupabaseAndUser();
    const schoolId = requireSchool(ctx);
    const { id } = await params;

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
      .single() as { data: any; error: any };

    if (error || !student) {
      return errorResponse("Student not found", 404);
    }

    return successResponse(student);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Internal server error";
    const status = err instanceof Error && "status" in err ? (err as any).status : 500;
    return errorResponse(message, status);
  }
}

export async function PATCH(request: NextRequest, { params }: RouteContext) {
  try {
    const ctx = await getSupabaseAndUser();
    const schoolId = requireSchool(ctx);
    requireRole(ctx, ["SCHOOL_ADMIN", "BURSAR", "SUPER_ADMIN"]);
    const { id } = await params;

    // Fetch existing student for audit comparison
    const { data: existing } = await ctx.supabase
      .from("students")
      .select("*")
      .eq("id", id)
      .eq("school_id", schoolId)
      .eq("is_deleted", false)
      .single() as { data: Record<string, any> | null };

    if (!existing) {
      return errorResponse("Student not found", 404);
    }

    const body = await request.json();
    const parsed = updateStudentSchema.safeParse({ ...body, id });
    if (!parsed.success) {
      return errorResponse(parsed.error.issues[0].message, 400);
    }

    const { id: _id, ...updateData } = parsed.data;

    const { data: student, error } = await ctx.supabase
      .from("students")
      .update(updateData as any)
      .eq("id", id)
      .eq("school_id", schoolId)
      .select()
      .single() as { data: any; error: any };

    if (error) return errorResponse(error.message, 400);

    // Audit log
    await ctx.supabase.from("audit_logs").insert({
      school_id: schoolId,
      user_id: ctx.user.id,
      action: "student_updated",
      entity_type: "student",
      entity_id: id,
      old_value: { name: existing!.full_name, status: existing!.status },
      new_value: updateData,
    } as any);

    return successResponse(student);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Internal server error";
    const status = err instanceof Error && "status" in err ? (err as any).status : 500;
    return errorResponse(message, status);
  }
}

export async function DELETE(request: NextRequest, { params }: RouteContext) {
  try {
    const ctx = await getSupabaseAndUser();
    const schoolId = requireSchool(ctx);
    requireRole(ctx, ["SCHOOL_ADMIN", "SUPER_ADMIN"]);
    const { id } = await params;

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

    if (error) return errorResponse(error.message);

    // Audit log
    await ctx.supabase.from("audit_logs").insert({
      school_id: schoolId,
      user_id: ctx.user.id,
      action: "student_deleted",
      entity_type: "student",
      entity_id: id,
      old_value: { name: existing.full_name, admission: existing.admission_number },
    } as any);

    return successResponse({ deleted: true });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Internal server error";
    const status = err instanceof Error && "status" in err ? (err as any).status : 500;
    return errorResponse(message, status);
  }
}

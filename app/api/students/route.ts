import { NextRequest } from "next/server";
import type { Database } from "@/types/database";
import { createStudentSchema } from "@/lib/validations/student";
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

type StudentWithClass = StudentRow & {
  current_class: Pick<ClassRow, "id" | "name"> | null;
};

export async function GET(request: NextRequest) {
  try {
    const ctx = await getSupabaseAndUser();
    const schoolId = requireSchool(ctx);

    const { searchParams } = new URL(request.url);
    const classId = searchParams.get("class_id");
    const status = searchParams.get("status");
    const search = searchParams.get("search");
    const page = parseInt(searchParams.get("page") || "1", 10);
    const limit = Math.min(parseInt(searchParams.get("limit") || "50", 10), 200);
    const from = (page - 1) * limit;
    const to = from + limit - 1;

    let query = ctx.supabase
      .from("students")
      .select("*, current_class:classes(id, name)", { count: "exact" })
      .eq("school_id", schoolId)
      .eq("is_deleted", false);

    if (classId) query = query.eq("current_class_id", classId);
    if (status) query = query.eq("status", status);
    if (search) {
      query = query.or(
        `full_name.ilike.%${search}%,admission_number.ilike.%${search}%,parent_phone.ilike.%${search}%`
      );
    }

    const { data, error, count } = await query
      .order("created_at", { ascending: false })
      .range(from, to);

    if (error) return errorResponse(error.message);

    return successResponse({
      students: data ?? [],
      total: count ?? 0,
      page,
      limit,
      totalPages: Math.ceil((count ?? 0) / limit),
    });
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
    requireRole(ctx, ["SCHOOL_ADMIN", "BURSAR", "SUPER_ADMIN"]);

    const body = await request.json();
    const parsed = createStudentSchema.safeParse(body);
    if (!parsed.success) {
      return errorResponse(parsed.error.issues[0].message, 400);
    }

    // Generate admission number if not provided
    let admissionNumber = parsed.data.admission_number;
    if (!admissionNumber) {
      const { count } = await ctx.supabase
        .from("students")
        .select("*", { count: "exact", head: true })
        .eq("school_id", schoolId);
      const seq = (count ?? 0) + 1;
      admissionNumber = `ADM-${String(seq).padStart(5, "0")}`;
    }

    const { data: student, error } = await ctx.supabase
      .from("students")
      .insert({
        school_id: schoolId,
        admission_number: admissionNumber,
        full_name: parsed.data.full_name,
        date_of_birth: parsed.data.date_of_birth ?? null,
        gender: parsed.data.gender ?? null,
        photo_url: parsed.data.photo_url ?? null,
        parent_name: parsed.data.parent_name,
        parent_phone: parsed.data.parent_phone,
        parent_email: parsed.data.parent_email ?? null,
        parent_nid: parsed.data.parent_nid ?? null,
        current_class_id: parsed.data.current_class_id,
        enrollment_date: parsed.data.enrollment_date,
        status: "active",
      })
      .select()
      .single() as { data: { id: string } | null; error: any };

    if (error) return errorResponse(error.message, 400);

    // Create class enrollment for the current term
    if (student && parsed.data.current_class_id) {
      const { data: term } = await ctx.supabase
        .from("terms")
        .select("id, academic_year_id")
        .eq("school_id", schoolId)
        .eq("is_current", true)
        .single() as { data: { id: string; academic_year_id: string } | null };

      if (term) {
        await ctx.supabase.from("class_enrollments").insert({
          student_id: student!.id,
          class_id: parsed.data.current_class_id,
          term_id: term.id,
          academic_year_id: term.academic_year_id,
        } as any);
      }
    }

    // Audit log
    await ctx.supabase.from("audit_logs").insert({
      school_id: schoolId,
      user_id: ctx.user.id,
      action: "student_created",
      entity_type: "student",
      entity_id: student?.id,
      new_value: { name: parsed.data.full_name, admission: admissionNumber },
    } as any);

    return successResponse(student, 201);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Internal server error";
    const status = err instanceof Error && "status" in err ? (err as any).status : 500;
    return errorResponse(message, status);
  }
}

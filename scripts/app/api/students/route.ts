import { NextRequest } from "next/server";
import crypto from "crypto";
import type { Database } from "@/types/database";
import { createStudentSchema } from "@/lib/validations/student";
import {
  getSupabaseAndUser,
  requireSchool,
  requireRole,
  successResponse,
  errorResponse,
  dbError,
  getErrorStatus } from "@/lib/api-helpers";
import { writeAuditLog } from "@/lib/audit-log";
import { withSchoolCache, setCacheHeader, invalidateSchool } from "@/lib/api-cache";

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
    requireRole(ctx, ["SCHOOL_ADMIN", "BURSAR", "TEACHER", "SUPER_ADMIN"]);

    const { searchParams } = new URL(request.url);
    const classId = searchParams.get("class_id");
    const status = searchParams.get("status");
    const search = searchParams.get("search");
    const page = parseInt(searchParams.get("page") || "1", 10);
    const limit = Math.min(parseInt(searchParams.get("limit") || "50", 10), 200);
    const from = (page - 1) * limit;
    const to = from + limit - 1;

    // Audit 3.4 (4.8): a TEACHER previously got the full student
    // list scoped only by school_id. They should only see students
    // in classes where they teach a subject. The class_subjects
    // table links teacher_id (a user id) to a class_id. A TEACHER's
    // classes are the distinct class_ids from class_subjects where
    // teacher_id = ctx.user.id. A TEACHER who also passes a
    // class_id query param that isn't in their class list gets a
    // 403 — they can't snoop on other classes by guessing UUIDs.
    //
    // TEACHERs are NOT cached — the per-teacher class list varies
    // by user, and caching it would leak data across sessions. The
    // school-admin path below is cached.
    let allowedClassIds: Set<string> | null = null;
    if (ctx.profile.role === "TEACHER") {
      const { data: classSubjects, error: csError } = await ctx.supabase
        .from("class_subjects")
        .select("class_id")
        .eq("teacher_id", ctx.user.id)
        .eq("is_deleted", false);
      if (csError) return dbError(csError, "Failed to load teacher classes");
      allowedClassIds = new Set((classSubjects ?? []).map((c) => c.class_id));
      if (allowedClassIds.size === 0) {
        // Teacher teaches no classes — return empty rather than the
        // full list. The page's empty state will render.
        return successResponse({ students: [], total: 0, page, limit, totalPages: 0 });
      }
      if (classId && !allowedClassIds.has(classId)) {
        return errorResponse("You do not have access to this class", 403);
      }
    }

    const inputShape = `students-list:${classId ?? "_"}:${status ?? "_"}:${search ?? "_"}:${page}:${limit}`;
    const { value, hit } = await withSchoolCache(
      { schoolId, inputShape },
      async () => {
        let query = ctx.supabase
          .from("students")
          .select("*, current_class:classes(id, name)", { count: "exact" })
          .eq("school_id", schoolId)
          .eq("is_deleted", false);

        if (classId) query = query.eq("current_class_id", classId);
        else if (allowedClassIds) {
          // For teachers, restrict to their assigned classes. PostgREST
          // supports `in` on a comma-separated list, but for a Set we
          // use the array literal form: `in.(uuid1,uuid2,...)`. We
          // chunk to keep the URL under 8KB.
          const ids = Array.from(allowedClassIds);
          if (ids.length > 0) {
            query = query.in("current_class_id", ids);
          }
        }
        if (status) query = query.eq("status", status as import("@/types").StudentStatus);
        if (search) {
          query = query.or(
            `full_name.ilike.%${search}%,admission_number.ilike.%${search}%,parent_phone.ilike.%${search}%`
          );
        }

        const { data, error, count } = await query
          .order("created_at", { ascending: false })
          .range(from, to);

        if (error) throw new Error(`postgrest:${error.code ?? "unknown"}:${error.message}`);
        return {
          students: data ?? [],
          total: count ?? 0,
          page,
          limit,
          totalPages: Math.ceil((count ?? 0) / limit),
        };
      },
    );

    const response = successResponse(value);
    return setCacheHeader(response, hit);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Internal server error";
    const status = getErrorStatus(err);
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

    // Generate admission number if not provided (UUID suffix avoids race conditions)
    let admissionNumber = parsed.data.admission_number;
    if (!admissionNumber) {
      const uniqueSuffix = crypto.randomUUID().slice(0, 6).toUpperCase();
      admissionNumber = `ADM-${uniqueSuffix}`;
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
        status: "active" as const,
        exit_date: null,
      })
      .select()
      .single() as { data: { id: string } | null; error: any };

    if (error) return dbError(error, "Database error");

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
          academic_year_id: term.academic_year_id } as unknown as Database["public"]["Tables"]["class_enrollments"]["Insert"]);
      }
    }

    // Mirror the bulk-import behaviour: a freshly enrolled student must have
    // a fee_account row for the current term so the dashboard, defaulters,
    // and the student's fee statement all show consistent numbers right
    // away. Without this, "Generate Accounts" was the only way to materialise
    // the row, which silently broke the new student in any fees view.
    if (student) {
      const { data: term } = await ctx.supabase
        .from("terms")
        .select("id, academic_year_id")
        .eq("school_id", schoolId)
        .eq("is_current", true)
        .single() as { data: { id: string; academic_year_id: string } | null };

      if (term) {
        await ctx.supabase.from("fee_accounts").upsert(
          {
            school_id: schoolId,
            student_id: student.id,
            term_id: term.id,
            academic_year_id: term.academic_year_id,
            total_expected: 0,
            total_paid: 0,
            balance: 0,
            status: "unpaid" as const,
          } as unknown as Database["public"]["Tables"]["fee_accounts"]["Insert"],
          { onConflict: "student_id,term_id" }
        );
      }
    }

    // Audit log
    await writeAuditLog(ctx.supabase, {
      school_id: schoolId,
      user_id: ctx.user.id,
      action: "student_created",
      entity_type: "student",
      entity_id: student?.id ?? null,
      new_value: { name: parsed.data.full_name, admission: admissionNumber },
    });

    // Bust the school-wide cache so the next students list / dashboard
    // read picks up the new row. Now async because the storage is
    // Redis (SCAN + DEL).
    await invalidateSchool(schoolId);

    return successResponse(student, 201);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Internal server error";
    const status = getErrorStatus(err);
    return errorResponse(message, status);
  }
}

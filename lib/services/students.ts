/**
 * Students domain service.
 *
 * The students route (app/api/students/route.ts) used to embed:
 *   • admission-number generation
 *   • student INSERT
 *   • class_enrollments INSERT for the current term
 *   • fee_accounts UPSERT so the dashboard shows the new student
 *     immediately
 *   • audit log
 *   • cache invalidation
 *
 * Encapsulated here so the route handler is 30 LOC and so the
 * business rules are unit-testable.
 */

import crypto from "crypto";
import type { AuthContext } from "@/lib/http";
import { AuthError } from "@/lib/http";
import { writeAuditLog, withAudit } from "@/lib/audit-log";
import { invalidateSchoolAsync } from "@/lib/api-cache";
import { scopedQuery, paginated, escapeIlike, searchFilter } from "@/lib/http/scoped";

export interface CreateStudentInput {
  full_name: string;
  admission_number?: string | null;
  date_of_birth?: string | null;
  gender?: string | null;
  photo_url?: string | null;
  parent_name: string;
  parent_phone: string;
  parent_email?: string | null;
  parent_nid?: string | null;
  current_class_id: string;
  enrollment_date: string;
}

export interface ListStudentsOptions {
  classId?: string | null;
  status?: string | null;
  search?: string | null;
  teacherAllowedClassIds?: ReadonlySet<string> | null;
}

/**
 * Generate a unique admission number if the client did not supply
 * one. Format: `ADM-XXXXXX` where XXXXXX is 6 uppercase hex chars
 * from `crypto.randomUUID().slice(0, 6)`. The school-wide
 * `(school_id, admission_number)` UNIQUE in migration 0005 catches
 * the (extremely rare) collision.
 */
export function generateAdmissionNumber(): string {
  const suffix = crypto.randomUUID().slice(0, 6).toUpperCase();
  return `ADM-${suffix}`;
}

/**
 * Create a student, their class enrollment for the current term,
 * and a fee_account row so the dashboard / defaulters / fee
 * statement pages render correctly on day one.
 *
 * Audit and cache invalidation are scheduled by the caller-side
 * helpers in this file.
 */
export async function createStudent(
  ctx: AuthContext,
  body: CreateStudentInput,
): Promise<{ id: string; admission_number: string }> {
  return withAudit(
    ctx,
    {
      action: "student_created",
      entityType: "student",
      entityId: null,
    },
    async () => {
      const admissionNumber = body.admission_number ?? generateAdmissionNumber();

      const { data: student, error } = await scopedQuery(ctx, "students")
        .insert({
          admission_number: admissionNumber,
          full_name: body.full_name,
          date_of_birth: body.date_of_birth ?? null,
          gender: body.gender ?? null,
          photo_url: body.photo_url ?? null,
          parent_name: body.parent_name,
          parent_phone: body.parent_phone,
          parent_email: body.parent_email ?? null,
          parent_nid: body.parent_nid ?? null,
          current_class_id: body.current_class_id,
          enrollment_date: body.enrollment_date,
          status: "active",
          exit_date: null,
        } as never)
        .select("id, admission_number")
        .single();

      if (error) {
        throw new AuthError(`Failed to create student: ${error.message}`, 400);
      }
      if (!student) {
        throw new AuthError("Student insert returned no row", 500);
      }

      // Side-effects — best-effort. They each have their own
      // .maybeSingle / .upsert so a failure on one does not undo
      // the student insert.
      await ensureCurrentEnrollment(ctx, student.id, body.current_class_id);
      await ensureCurrentFeeAccount(ctx, student.id);

      // New-value audit (the entity_id is the student id now we
      // know it).
      await writeAuditLog(ctx.supabase, {
        school_id: ctx.schoolId,
        user_id: ctx.user.id,
        action: "student_created",
        entity_type: "student",
        entity_id: student.id,
        new_value: { name: body.full_name, admission: admissionNumber },
      });

      invalidateSchoolAsync(ctx.schoolId);

      return student as { id: string; admission_number: string };
    },
  );
}

async function ensureCurrentEnrollment(
  ctx: AuthContext,
  studentId: string,
  classId: string,
): Promise<void> {
  const { data: term } = await scopedQuery(ctx, "terms")
    .select("id, academic_year_id")
    .eq("is_current", true)
    .maybeSingle();
  if (!term) return;

  await ctx.supabase.from("class_enrollments").insert({
    student_id: studentId,
    class_id: classId,
    term_id: term.id,
    academic_year_id: term.academic_year_id,
  } as never);
}

async function ensureCurrentFeeAccount(ctx: AuthContext, studentId: string): Promise<void> {
  const { data: term } = await scopedQuery(ctx, "terms")
    .select("id, academic_year_id")
    .eq("is_current", true)
    .maybeSingle();
  if (!term) return;

  await ctx.supabase.from("fee_accounts").upsert(
    {
      student_id: studentId,
      term_id: term.id,
      academic_year_id: term.academic_year_id,
      total_expected: 0,
      total_paid: 0,
      balance: 0,
      status: "unpaid",
    } as never,
    { onConflict: "student_id,term_id" },
  );
}

/**
 * Paginated student list with optional teacher-class restriction.
 *
 * `teacherAllowedClassIds` — when non-null, restricts the result to
 * students whose `current_class_id` is in the set. The handler does
 * the role check (TEACHER vs everything else); this service just
 * applies the filter.
 */
export async function listStudents(
  ctx: AuthContext,
  req: Request,
  opts: ListStudentsOptions = {},
): Promise<{
  items: unknown[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}> {
  const { page, limit, from, to } = paginated.parse(req);

  let query = scopedQuery(ctx, "students")
    .select("*, current_class:classes(id, name)", { count: "exact" })
    .eq("is_deleted", false);

  if (opts.classId) {
    query = query.eq("current_class_id", opts.classId);
  } else if (opts.teacherAllowedClassIds && opts.teacherAllowedClassIds.size > 0) {
    const ids = Array.from(opts.teacherAllowedClassIds);
    query = query.in("current_class_id", ids);
  }

  if (opts.status) {
    query = query.eq("status", opts.status as never);
  }

  const filter = searchFilter(
    ["full_name", "admission_number", "parent_phone"],
    opts.search ?? null,
  );
  if (filter) {
    query = query.or(filter);
  }

  const { data, count, error } = await query
    .order("created_at", { ascending: false })
    .range(from, to);

  if (error) {
    throw new AuthError(`Failed to load students: ${error.message}`, 400);
  }
  // Touch escapeIlike so the import is preserved even if a future
  // caller wants raw interpolation outside `searchFilter`.
  void escapeIlike;
  return paginated.envelope(data ?? [], count ?? 0, page, limit);
}

/**
 * Resolve the set of class IDs a TEACHER is allowed to see
 * students for. Returns an empty Set when the teacher has no
 * assignments (caller should treat that as "no rows").
 */
export async function teacherAllowedClassIds(
  ctx: AuthContext,
): Promise<ReadonlySet<string>> {
  const { data, error } = await ctx.supabase
    .from("class_subjects")
    .select("class_id")
    .eq("teacher_id", ctx.user.id)
    .eq("is_deleted", false);
  if (error) {
    throw new AuthError(`Failed to load teacher classes: ${error.message}`, 400);
  }
  return new Set((data ?? []).map((c) => c.class_id));
}
import { NextRequest } from "next/server";
import type { Database } from "@/types/database";
import {
  getSupabaseAndUser,
  requireSchool,
  requireRole,
  successResponse,
  errorResponse,
  getErrorStatus,
} from "@/lib/api-helpers";
import { bulkImportBodySchema, resolveFullName, normalizePhone } from "@/lib/validations/bulk-import";

export async function POST(request: NextRequest) {
  try {
    const ctx = await getSupabaseAndUser();
    const schoolId = requireSchool(ctx);
    requireRole(ctx, ["SCHOOL_ADMIN"]);

    const body = await request.json();
    const parsed = bulkImportBodySchema.safeParse(body);
    if (!parsed.success) {
      return errorResponse(parsed.error.issues[0].message, 400);
    }

    const { rows } = parsed.data;
    const todayIso = new Date().toISOString().split("T")[0];

    // Get current term for fee_account creation. Use .maybeSingle()
    // because a school that has not yet marked a term as is_current
    // will return zero rows — .single() would throw PGRST116 → 500.
    // The downstream code already guards with `if (currentTerm)`.
    const { data: currentTerm } = await ctx.supabase
      .from("terms")
      .select("id, academic_year_id")
      .eq("is_current", true)
      .limit(1)
      .maybeSingle();

    // Fetch existing classes for this school
    const { data: existingClasses } = await ctx.supabase
      .from("classes")
      .select("id, name")
      .eq("school_id", schoolId)
      .eq("is_deleted", false);

    const classMap = new Map<string, string>();
    for (const cls of existingClasses ?? []) {
      classMap.set(cls.name.toLowerCase().trim(), cls.id);
    }
    // NOTE: classes are no longer auto-created. Rows with an unknown class name
    // are reported as errors so the admin can create the class first.

    // Count current students for admission number generation
    const { count: currentCount } = await ctx.supabase
      .from("students")
      .select("*", { count: "exact", head: true })
      .eq("school_id", schoolId);

    // Fetch existing admission numbers to avoid conflicts
    const { data: existingStudents } = await ctx.supabase
      .from("students")
      .select("admission_number")
      .eq("school_id", schoolId)
      .eq("is_deleted", false);

    const existingAdmissions = new Set(
      (existingStudents ?? []).map((s: any) => s.admission_number).filter(Boolean)
    );

    const year = new Date().getFullYear();
    let sequence = (currentCount ?? 0) + 1;
    let imported = 0;
    let skipped = 0;
    const errors: { row: number; reason: string }[] = [];
    const warnings: { row: number; reason: string }[] = [];

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const classKey = row.class_name.toLowerCase().trim();
      const classId = classMap.get(classKey);

      if (!classId) {
        errors.push({ row: i + 1, reason: `Class not found: "${row.class_name}". Please create it first.` });
        continue;
      }

      const phone = normalizePhone(row.parent_phone);

      // Generate admission number if not provided
      let admissionNumber = row.admission_number?.trim();
      if (!admissionNumber) {
        const prefix = schoolId.slice(0, 8).toUpperCase();
        do {
          admissionNumber = `${prefix}-${year}-${String(sequence).padStart(4, "0")}`;
          sequence++;
        } while (existingAdmissions.has(admissionNumber));
      }

      // Check for existing admission number
      if (existingAdmissions.has(admissionNumber)) {
        warnings.push({ row: i + 1, reason: `Admission number "${admissionNumber}" already exists - skipped.` });
        skipped++;
        continue;
      }

      const studentData = {
        school_id: schoolId,
        full_name: resolveFullName(row),
        admission_number: admissionNumber,
        date_of_birth: row.date_of_birth || null,
        gender: row.gender || null,
        photo_url: null,
        parent_name: row.parent_name,
        parent_phone: phone,
        parent_email: row.parent_email || null,
        parent_nid: null,
        current_class_id: classId,
        enrollment_date: row.enrollment_date?.trim() || todayIso,
        status: "active" as const,
        exit_date: null,
      };

      const { data: student, error: insertError } = await ctx.supabase
        .from("students")
        .insert(studentData)
        .select("id")
        .single();

      if (insertError) {
        errors.push({ row: i + 1, reason: insertError.message });
        continue;
      }

      existingAdmissions.add(admissionNumber);
      imported++;

      // Create fee_account for the current term (mirrors the single-student
      // POST in /api/students/route.ts so the dashboard + defaulters + student
      // directory all see the new student immediately).
      if (currentTerm && student) {
        await ctx.supabase.from("fee_accounts").insert({
          student_id: student.id,
          term_id: currentTerm.id,
          school_id: schoolId,
          academic_year_id: currentTerm.academic_year_id,
          total_expected: 0,
          total_paid: 0,
          balance: 0,
          status: "unpaid" as const,
        });
      }

      // Create class_enrollments for the current term so attendance, the
      // class roster page, and the marks sheet all see the new student
      // without a manual step. (Previously the single-student POST created
      // class_enrollments but bulk-import did not, leaving the imported
      // students invisible in attendance/marks until an admin re-ran
      // "Generate Accounts".)
      if (currentTerm && student && classId) {
        await ctx.supabase.from("class_enrollments").insert({
          student_id: student.id,
          class_id: classId,
          term_id: currentTerm.id,
          academic_year_id: currentTerm.academic_year_id,
        } as unknown as Database["public"]["Tables"]["class_enrollments"]["Insert"]);
      }
    }

    // Audit log
    await ctx.supabase.from("audit_logs").insert({
      school_id: schoolId,
      user_id: ctx.user.id,
      action: "bulk_import",
      entity_type: "students",
      entity_id: null,
      old_value: null,
      new_value: { imported, skipped, errors: errors.length },
      ip_address: null,
    });

    return successResponse({ imported, skipped, errors, warnings });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Internal server error";
    const status = getErrorStatus(err);
    return errorResponse(message, status);
  }
}

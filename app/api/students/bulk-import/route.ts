import { NextRequest } from "next/server";
import { z } from "zod";
import {
  getSupabaseAndUser,
  requireSchool,
  requireRole,
  successResponse,
  errorResponse,
} from "@/lib/api-helpers";

const rowSchema = z.object({
  first_name: z.string().min(1),
  last_name: z.string().min(1),
  class_name: z.string().min(1),
  date_of_birth: z.string().optional(),
  gender: z.enum(["male", "female", "other"]).optional(),
  parent_name: z.string().min(1),
  parent_phone: z.string().min(1),
  admission_number: z.string().optional(),
  parent_email: z.string().email().optional().or(z.literal("")),
  address: z.string().optional(),
  district: z.string().optional(),
});

const bodySchema = z.object({
  rows: z.array(rowSchema).min(1).max(5000),
});

function normalizePhone(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  if (digits.startsWith("256") && digits.length === 12) return `+${digits}`;
  if (digits.startsWith("0") && digits.length === 10) return `+256${digits.slice(1)}`;
  if (digits.length === 9 && (digits.startsWith("7") || digits.startsWith("3")))
    return `+256${digits}`;
  return `+${digits}`;
}

export async function POST(request: NextRequest) {
  try {
    const ctx = await getSupabaseAndUser();
    const schoolId = requireSchool(ctx);
    requireRole(ctx, ["SCHOOL_ADMIN"]);

    const body = await request.json();
    const parsed = bodySchema.safeParse(body);
    if (!parsed.success) {
      return errorResponse(parsed.error.issues[0].message, 400);
    }

    const { rows } = parsed.data;

    // Get current term for fee_account creation
    const { data: currentTerm } = await ctx.supabase
      .from("terms")
      .select("id")
      .eq("is_current", true)
      .limit(1)
      .single();

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

    // Resolve missing class names — create them
    const classNamesNeeded = [...new Set(rows.map((r) => r.class_name.toLowerCase().trim()))];
    for (const name of classNamesNeeded) {
      if (!classMap.has(name)) {
        const { data: newClass, error } = await ctx.supabase
          .from("classes")
          .insert({ school_id: schoolId, name: rows.find((r) => r.class_name.toLowerCase().trim() === name)!.class_name })
          .select("id, name")
          .single();
        if (!error && newClass) {
          classMap.set(name, newClass.id);
        }
      }
    }

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

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const classKey = row.class_name.toLowerCase().trim();
      const classId = classMap.get(classKey);

      if (!classId) {
        errors.push({ row: i + 1, reason: `Could not resolve class "${row.class_name}"` });
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
        skipped++;
        continue;
      }

      const studentData: Record<string, unknown> = {
        school_id: schoolId,
        full_name: `${row.first_name} ${row.last_name}`.trim(),
        admission_number: admissionNumber,
        date_of_birth: row.date_of_birth || null,
        gender: row.gender || null,
        parent_name: row.parent_name,
        parent_phone: phone,
        parent_email: row.parent_email || null,
        current_class_id: classId,
        enrollment_date: new Date().toISOString().split("T")[0],
        status: "active",
      };

      if (row.address) studentData.address = row.address;
      if (row.district) studentData.district = row.district;

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

      // Create fee_account for current term
      if (currentTerm && student) {
        await ctx.supabase.from("fee_accounts").insert({
          student_id: student.id,
          term_id: currentTerm.id,
          school_id: schoolId,
          amount_due: 0,
          amount_paid: 0,
          balance: 0,
        });
      }
    }

    // Audit log
    await ctx.supabase.from("audit_logs").insert({
      school_id: schoolId,
      user_id: ctx.user.id,
      action: "bulk_import",
      entity_type: "students",
      new_value: { imported, skipped, errors: errors.length },
    });

    return successResponse({ imported, skipped, errors });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Internal server error";
    const status = err instanceof Error && "status" in err ? (err as { status: number }).status : 500;
    return errorResponse(message, status);
  }
}

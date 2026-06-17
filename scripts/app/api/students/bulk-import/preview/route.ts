import { NextRequest } from "next/server";
import {
  getSupabaseAndUser,
  requireSchool,
  requireRole,
  successResponse,
  errorResponse,
  getErrorStatus,
} from "@/lib/api-helpers";
import { bulkImportBodySchema, resolveFullName } from "@/lib/validations/bulk-import";

// POST: validate rows without inserting. Returns per-row validity, errors and warnings.
export async function POST(request: NextRequest) {
  try {
    const ctx = await getSupabaseAndUser();
    const schoolId = requireSchool(ctx);
    requireRole(ctx, ["SCHOOL_ADMIN"]);

    const body = await request.json();
    const parsed = bulkImportBodySchema.safeParse(body);
    if (!parsed.success) return errorResponse(parsed.error.issues[0].message, 400);
    const { rows } = parsed.data;

    const { data: classes } = await ctx.supabase
      .from("classes")
      .select("name")
      .eq("school_id", schoolId)
      .eq("is_deleted", false);
    const classNames = new Set((classes ?? []).map((c) => c.name.toLowerCase().trim()));

    const { data: students } = await ctx.supabase
      .from("students")
      .select("admission_number")
      .eq("school_id", schoolId)
      .eq("is_deleted", false);
    const existingAdmissions = new Set(
      (students ?? []).map((s) => s.admission_number).filter(Boolean) as string[]
    );

    const errors: { row: number; reason: string }[] = [];
    const warnings: { row: number; reason: string }[] = [];

    rows.forEach((row, i) => {
      const rowNum = i + 1;
      if (!classNames.has(row.class_name.toLowerCase().trim())) {
        errors.push({ row: rowNum, reason: `Class not found: "${row.class_name}". Please create it first.` });
      }
      const adm = row.admission_number?.trim();
      if (adm && existingAdmissions.has(adm)) {
        warnings.push({ row: rowNum, reason: `Admission number "${adm}" already exists - will be skipped.` });
      }
      if (!resolveFullName(row)) {
        errors.push({ row: rowNum, reason: "Missing name" });
      }
    });

    return successResponse({
      total: rows.length,
      validCount: rows.length - errors.length,
      errors,
      warnings,
    });
  } catch (e) {
    return errorResponse(e instanceof Error ? e.message : "Error", getErrorStatus(e));
  }
}

import { route } from "@/lib/http";
import { bulkImportBodySchema, resolveFullName } from "@/lib/validations/bulk-import";

// POST: validate rows without inserting. Returns per-row validity, errors and warnings.
export const POST = route({
  roles: ["SCHOOL_ADMIN"],
  schema: bulkImportBodySchema,
  handler: async (ctx, body) => {
    const schoolId = ctx.profile.school_id!;
    const { rows } = body;

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
      (students ?? [])
        .map((s: { admission_number: string | null }) => s.admission_number)
        .filter((v): v is string => Boolean(v))
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

    return {
      total: rows.length,
      validCount: rows.length - errors.length,
      errors,
      warnings,
    };
  },
});

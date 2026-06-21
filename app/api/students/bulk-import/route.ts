import type { Database } from "@/types/database";
import { route, errorResponse } from "@/lib/http";
import { bulkImportBodySchema, resolveFullName, normalizePhone } from "@/lib/validations/bulk-import";
import { checkRateLimitAsync } from "@/lib/utils/rate-limit";

// §10.5: bulk imports are the natural amplification primitive for
// accidental (or malicious) database load. We split into chunks of
// at most 50 rows per round-trip and rate-limit to 4 bulk calls /
// hour per school. The import was previously a 1-by-1 row loop with
// 3 writes per row; for a 500-row import that is 1500 round-trips.
const BULK_INSERT_CHUNK_SIZE = 50;
const BULK_IMPORT_HOURLY_LIMIT = 4;
const BULK_IMPORT_WINDOW_MS = 60 * 60 * 1000;

export const POST = route({
  roles: ["SCHOOL_ADMIN"],
  schema: bulkImportBodySchema,
  handler: async (ctx, body) => {
    const schoolId = ctx.profile.school_id!;

    // §5.2: per-school rate limit on bulk imports. Even when the
    // upstream UI rate-limits on a button click, a hand-rolled
    // client could loop. 4/hour is generous for legitimate use.
    const rl = await checkRateLimitAsync(
      `bulk-import:${schoolId}`,
      BULK_IMPORT_HOURLY_LIMIT,
      BULK_IMPORT_WINDOW_MS,
    );
    if (!rl.success) {
      return errorResponse(
        "Too many bulk imports. Please wait before trying again.",
        429,
      );
    }

    const { rows } = body;
    const todayIso = new Date().toISOString().split("T")[0];

    const { data: currentTerm } = await ctx.supabase
      .from("terms")
      .select("id, academic_year_id")
      .eq("is_current", true)
      .limit(1)
      .maybeSingle();

    const { data: existingClasses } = await ctx.supabase
      .from("classes")
      .select("id, name")
      .eq("school_id", schoolId)
      .eq("is_deleted", false);

    const classMap = new Map<string, string>();
    for (const cls of existingClasses ?? []) {
      classMap.set(cls.name.toLowerCase().trim(), cls.id);
    }

    const { count: currentCount } = await ctx.supabase
      .from("students")
      .select("*", { count: "exact", head: true })
      .eq("school_id", schoolId);

    const { data: existingStudents } = await ctx.supabase
      .from("students")
      .select("admission_number")
      .eq("school_id", schoolId)
      .eq("is_deleted", false);

    const existingAdmissions = new Set(
      (existingStudents ?? [])
        .map((s: { admission_number: string | null }) => s.admission_number)
        .filter((v): v is string => Boolean(v))
    );

    const year = new Date().getFullYear();
    let sequence = (currentCount ?? 0) + 1;
    let imported = 0;
    let skipped = 0;
    const errors: { row: number; reason: string }[] = [];
    const warnings: { row: number; reason: string }[] = [];

    // Buffer rows that pass the per-row validation, then flush them
    // in chunks. Anything that fails per-row (missing class, dup
    // admission number) is reported but not re-tried.
    type PendingInsert = {
      index: number;
      studentRow: Database["public"]["Tables"]["students"]["Insert"];
      classId: string;
    };
    const pending: PendingInsert[] = [];

    const flushChunk = async (chunk: PendingInsert[]): Promise<void> => {
      if (chunk.length === 0) return;
      const studentRows = chunk.map((p) => p.studentRow);

      const { data: inserted, error: insertError } = await ctx.supabase
        .from("students")
        .insert(studentRows as unknown as Database["public"]["Tables"]["students"]["Insert"][])
        .select("id, admission_number, current_class_id");

      if (insertError || !inserted) {
        // Whole chunk failed — report the failure against the first
        // row; subsequent rows are reported with the same reason so
        // the admin knows the entire chunk was rejected.
        for (const p of chunk) {
          errors.push({ row: p.index + 1, reason: insertError?.message ?? "Bulk insert failed" });
        }
        return;
      }

      imported += inserted.length;

      // Build a quick lookup from admission_number to the inserted
      // student, so the fee_account + class_enrollment inserts can
      // be issued in a second round-trip chunk.
      const byAdmission = new Map(
        inserted.map((row) => [row.admission_number, row]),
      );

      if (currentTerm) {
        const feeRows = chunk
          .map((p) => {
            const ins = byAdmission.get(p.studentRow.admission_number as string);
            if (!ins) return null;
            return {
              student_id: ins.id,
              term_id: currentTerm.id,
              school_id: schoolId,
              academic_year_id: currentTerm.academic_year_id,
              total_expected: 0,
              total_paid: 0,
              balance: 0,
              status: "unpaid" as const,
            };
          })
          .filter(Boolean) as Database["public"]["Tables"]["fee_accounts"]["Insert"][];

        const enrollRows = chunk
          .map((p) => {
            const ins = byAdmission.get(p.studentRow.admission_number as string);
            if (!ins) return null;
            return {
              student_id: ins.id,
              class_id: p.classId,
              term_id: currentTerm.id,
              academic_year_id: currentTerm.academic_year_id,
            };
          })
          .filter(Boolean) as Database["public"]["Tables"]["class_enrollments"]["Insert"][];

        // Each sub-insert is itself a single chunk. Fee-accounts and
        // enrollments go in parallel so the chunked import is two
        // round-trips per chunk, not 1 + 1 + 1.
        const results = await Promise.all([
          feeRows.length > 0
            ? ctx.supabase.from("fee_accounts").insert(feeRows)
            : Promise.resolve({ error: null }),
          enrollRows.length > 0
            ? ctx.supabase
                .from("class_enrollments")
                .insert(enrollRows as unknown as Database["public"]["Tables"]["class_enrollments"]["Insert"][])
            : Promise.resolve({ error: null }),
        ]);
        for (const r of results) {
          if (r?.error) {
            // Don't roll back the students — they were inserted
            // successfully and rolling them back would leave the
            // counter out of sync. Surface a warning instead.
            warnings.push({ row: 0, reason: `Follow-up insert warning: ${r.error.message}` });
          }
        }
      }
    };

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const classKey = row.class_name.toLowerCase().trim();
      const classId = classMap.get(classKey);

      if (!classId) {
        errors.push({ row: i + 1, reason: `Class not found: "${row.class_name}". Please create it first.` });
        continue;
      }

      const phone = normalizePhone(row.parent_phone);

      let admissionNumber = row.admission_number?.trim();
      if (!admissionNumber) {
        const prefix = schoolId.slice(0, 8).toUpperCase();
        do {
          admissionNumber = `${prefix}-${year}-${String(sequence).padStart(4, "0")}`;
          sequence++;
        } while (existingAdmissions.has(admissionNumber));
      }

      if (existingAdmissions.has(admissionNumber)) {
        warnings.push({ row: i + 1, reason: `Admission number "${admissionNumber}" already exists - skipped.` });
        skipped++;
        continue;
      }

      existingAdmissions.add(admissionNumber);

      const studentData: Database["public"]["Tables"]["students"]["Insert"] = {
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
        status: "active",
        exit_date: null,
      };

      pending.push({ index: i, studentRow: studentData, classId });

      if (pending.length >= BULK_INSERT_CHUNK_SIZE) {
        await flushChunk(pending);
        pending.length = 0;
      }
    }

    // Flush the tail of the buffer.
    if (pending.length > 0) {
      await flushChunk(pending);
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

    return { imported, skipped, errors, warnings };
  },
});

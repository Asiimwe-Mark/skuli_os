import { NextRequest } from "next/server";
import type { Database } from "@/types/database";
import { generateFeeAccountsSchema } from "@/lib/validations/fees";
import {
  getSupabaseAndUser,
  requireSchool,
  requireRole,
  successResponse,
  errorResponse, getErrorStatus } from "@/lib/api-helpers";

type FeeStructureRow = Database["public"]["Tables"]["fee_structures"]["Row"];
type TermRow = Database["public"]["Tables"]["terms"]["Row"];
type ClassEnrollmentRow = Database["public"]["Tables"]["class_enrollments"]["Row"];
type FeeAccountRow = Database["public"]["Tables"]["fee_accounts"]["Row"];
type FeeAccountInsert = Database["public"]["Tables"]["fee_accounts"]["Insert"];
type AuditLogInsert = Database["public"]["Tables"]["audit_logs"]["Insert"];

export async function POST(request: NextRequest) {
  try {
    const ctx = await getSupabaseAndUser();
    const schoolId = requireSchool(ctx);
    requireRole(ctx, ["SCHOOL_ADMIN", "BURSAR"]);

    const body = await request.json();
    const parsed = generateFeeAccountsSchema.safeParse(body);
    if (!parsed.success) {
      return errorResponse(parsed.error.issues[0].message, 400);
    }

    // Get fee structures for this term
    let structuresQuery = ctx.supabase
      .from("fee_structures")
      .select("*")
      .eq("school_id", schoolId)
      .eq("term_id", parsed.data.term_id)
      .eq("is_deleted", false);

    if (parsed.data.class_id) {
      // The class must belong to this school before we use it to filter.
      const { data: cls } = await ctx.supabase
        .from("classes")
        .select("id")
        .eq("id", parsed.data.class_id)
        .eq("school_id", schoolId)
        .maybeSingle();
      if (!cls) {
        return errorResponse("Invalid class for this school", 400);
      }
      structuresQuery = structuresQuery.or(
        `class_id.is.null,class_id.eq.${parsed.data.class_id}`
      );
    }

    const { data: structures } = await structuresQuery as { data: { class_id: string | null; amount: number }[] | null };
    if (!structures || structures.length === 0) {
      return errorResponse("No fee structures found for this term", 400);
    }

    // Get academic year for the term
    const { data: term } = await ctx.supabase
      .from("terms")
      .select("academic_year_id")
      .eq("id", parsed.data.term_id)
      .eq("school_id", schoolId)
      .single() as { data: { academic_year_id: string } | null };

    if (!term) {
      return errorResponse("Invalid term for this school", 400);
    }

    // Get enrolled students for this term. The class_enrollments table
    // does not have a school_id column (it inherits tenancy through
    // students and terms), so we scope the result set in code after the
    // query to make sure no cross-tenant rows are ever written to a
    // fee_account.
    let enrollmentsQuery = ctx.supabase
      .from("class_enrollments")
      .select("student_id, class_id, student:students(school_id)")
      .eq("term_id", parsed.data.term_id);

    if (parsed.data.class_id) {
      enrollmentsQuery = enrollmentsQuery.eq("class_id", parsed.data.class_id);
    }

    const { data: rawEnrollments } = await enrollmentsQuery as {
      data: { student_id: string; class_id: string; student?: { school_id: string } | { school_id: string }[] | null }[] | null;
    };
    // Tenancy guard: drop any enrollments whose student belongs to a
    // different school. The earlier query had no school_id filter (the
    // class_enrollments table does not have one), so we must enforce it
    // here before writing fee_account rows.
    const enrollments = (rawEnrollments || []).filter((e) => {
      const s = Array.isArray(e.student) ? e.student[0] : e.student;
      return s?.school_id === schoolId;
    });
    if (enrollments.length === 0) {
      return errorResponse("No enrolled students found for this term", 400);
    }

    // Create fee accounts for each enrolled student
    let created = 0;
    let skipped = 0;

    for (const enrollment of enrollments) {
      // Check if fee account already exists
      const { data: existing } = await ctx.supabase
        .from("fee_accounts")
        .select("id")
        .eq("student_id", enrollment.student_id)
        .eq("term_id", parsed.data.term_id)
        .eq("school_id", schoolId)
        .single() as { data: { id: string } | null };

      if (existing) {
        skipped++;
        continue;
      }

      // Sum applicable fee structures (global ones + class-specific ones)
      const applicable = structures.filter(
        (s) => s.class_id === null || s.class_id === enrollment.class_id
      );
      const totalExpected = applicable.reduce((sum, s) => sum + s.amount, 0);

      if (totalExpected <= 0) continue;

      const { data: newAccount, error } = await ctx.supabase.from("fee_accounts").insert({
        school_id: schoolId,
        student_id: enrollment.student_id,
        term_id: parsed.data.term_id,
        academic_year_id: term!.academic_year_id,
        total_expected: totalExpected,
        total_paid: 0,
        balance: totalExpected,
        status: "unpaid" } as unknown as Database["public"]["Tables"]["fee_accounts"]["Insert"]).select("id").single();

      if (!error && newAccount) {
        // Recalculate to apply any discounts
        await ctx.supabase.rpc("recalculate_fee_account", {
          p_account_id: newAccount.id });
        created++;
      }
    }

    // Audit log
    await ctx.supabase.from("audit_logs").insert({
      school_id: schoolId,
      user_id: ctx.user.id,
      action: "fee_accounts_generated",
      entity_type: "fee_account",
      new_value: { term_id: parsed.data.term_id, created, skipped } } as unknown as Database["public"]["Tables"]["audit_logs"]["Insert"]);

    return successResponse({ created, skipped });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Internal server error";
    const status = getErrorStatus(err);
    return errorResponse(message, status);
  }
}

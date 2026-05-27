import { NextRequest } from "next/server";
import type { Database } from "@/types/database";
import { generateFeeAccountsSchema } from "@/lib/validations/fees";
import {
  getSupabaseAndUser,
  requireSchool,
  requireRole,
  successResponse,
  errorResponse,
} from "@/lib/api-helpers";

type FeeStructureRow = Database["public"]["Tables"]["fee_structures"]["Row"];
type TermRow = Database["public"]["Tables"]["terms"]["Row"];
type ClassEnrollmentRow = Database["public"]["Tables"]["class_enrollments"]["Row"];
type FeeAccountRow = Database["public"]["Tables"]["fee_accounts"]["Row"];

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

    // Get enrolled students for this term
    let enrollmentsQuery = ctx.supabase
      .from("class_enrollments")
      .select("student_id, class_id")
      .eq("term_id", parsed.data.term_id);

    if (parsed.data.class_id) {
      enrollmentsQuery = enrollmentsQuery.eq("class_id", parsed.data.class_id);
    }

    const { data: enrollments } = await enrollmentsQuery as { data: { student_id: string; class_id: string }[] | null };
    if (!enrollments || enrollments.length === 0) {
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

      const { error } = await ctx.supabase.from("fee_accounts").insert({
        school_id: schoolId,
        student_id: enrollment.student_id,
        term_id: parsed.data.term_id,
        academic_year_id: term!.academic_year_id,
        total_expected: totalExpected,
        total_paid: 0,
        balance: totalExpected,
        status: "unpaid",
      } as any);

      if (!error) created++;
    }

    // Audit log
    await ctx.supabase.from("audit_logs").insert({
      school_id: schoolId,
      user_id: ctx.user.id,
      action: "fee_accounts_generated",
      entity_type: "fee_account",
      new_value: { term_id: parsed.data.term_id, created, skipped },
    } as any);

    return successResponse({ created, skipped });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Internal server error";
    const status = err instanceof Error && "status" in err ? (err as any).status : 500;
    return errorResponse(message, status);
  }
}

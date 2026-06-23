import { generateFeeAccountsSchema } from "@/lib/validations/fees";
import { route, errorResponse } from "@/lib/http";
import { writeAuditLog } from "@/lib/audit-log";
import { invalidateSchoolAsync } from "@/lib/api-cache";

export const POST = route({
  roles: ["SCHOOL_ADMIN", "BURSAR"],
  schema: generateFeeAccountsSchema,
  handler: async (ctx, body) => {
    let structuresQuery = ctx.supabase
      .from("fee_structures")
      .select("*")
      .eq("school_id", ctx.schoolId)
      .eq("term_id", body.term_id)
      .eq("is_deleted", false);

    if (body.class_id) {
      const { data: cls } = await ctx.supabase
        .from("classes")
        .select("id")
        .eq("id", body.class_id)
        .eq("school_id", ctx.schoolId)
        .maybeSingle();
      if (!cls) {
        return errorResponse("Invalid class for this school", 400);
      }
      structuresQuery = structuresQuery.or(
        `class_id.is.null,class_id.eq.${body.class_id}`
      );
    }

    const { data: structures } = await structuresQuery as { data: { class_id: string | null; amount: number }[] | null };
    if (!structures || structures.length === 0) {
      return errorResponse("No fee structures found for this term", 400);
    }

    const { data: term } = await ctx.supabase
      .from("terms")
      .select("academic_year_id")
      .eq("id", body.term_id)
      .eq("school_id", ctx.schoolId)
      .maybeSingle() as { data: { academic_year_id: string } | null };

    if (!term) {
      return errorResponse("Invalid term for this school", 400);
    }

    let enrollmentsQuery = ctx.supabase
      .from("class_enrollments")
      .select("student_id, class_id, student:students(school_id)")
      .eq("term_id", body.term_id);

    if (body.class_id) {
      enrollmentsQuery = enrollmentsQuery.eq("class_id", body.class_id);
    }

    const { data: rawEnrollments } = await enrollmentsQuery as {
      data: { student_id: string; class_id: string; student?: { school_id: string } | { school_id: string }[] | null }[] | null;
    };
    const enrollments = (rawEnrollments || []).filter((e) => {
      const s = Array.isArray(e.student) ? e.student[0] : e.student;
      return s?.school_id === ctx.schoolId;
    });
    if (enrollments.length === 0) {
      return errorResponse("No enrolled students found for this term", 400);
    }

    let created = 0;
    let skipped = 0;

    for (const enrollment of enrollments) {
      const { data: existing } = await ctx.supabase
        .from("fee_accounts")
        .select("id")
        .eq("student_id", enrollment.student_id)
        .eq("term_id", body.term_id)
        .eq("school_id", ctx.schoolId)
        .maybeSingle() as { data: { id: string } | null };

      if (existing) {
        skipped++;
        continue;
      }

      const applicable = structures.filter(
        (s) => s.class_id === null || s.class_id === enrollment.class_id
      );
      const totalExpected = applicable.reduce((sum, s) => sum + s.amount, 0);

      if (totalExpected <= 0) continue;

      const { data: newAccount, error } = await ctx.supabase.from("fee_accounts").insert({
        school_id: ctx.schoolId,
        student_id: enrollment.student_id,
        term_id: body.term_id,
        academic_year_id: term.academic_year_id,
        total_expected: totalExpected,
        total_paid: 0,
        balance: totalExpected,
        status: "unpaid",
      } as never).select("id").single();

      if (!error && newAccount) {
        await ctx.supabase.rpc("recalculate_fee_account", {
          p_account_id: newAccount.id,
        });
        created++;
      }
    }

    await writeAuditLog(ctx.supabase, {
      school_id: ctx.schoolId,
      user_id: ctx.user.id,
      action: "fee_accounts_generated",
      entity_type: "fee_account",
      entity_id: null,
      new_value: { term_id: body.term_id, created, skipped },
    });

    void invalidateSchoolAsync(ctx.schoolId);

    return { created, skipped };
  },
});
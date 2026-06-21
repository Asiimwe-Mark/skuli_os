import type { Database } from "@/types/database";
import { applyDiscountSchema } from "@/lib/validations/fees";
import { route, errorResponse, dbError } from "@/lib/http";

export const GET = route({
  roles: ["SCHOOL_ADMIN", "BURSAR", "SUPER_ADMIN"],
  handler: async (ctx, request) => {
    const schoolId = ctx.profile.school_id!;

    const { searchParams } = new URL(request.url);
    const studentId = searchParams.get("student_id");
    const discountId = searchParams.get("discount_id");

    let query = ctx.supabase
      .from("student_discounts")
      .select(`
        *,
        discount:fee_discounts(*),
        student:students(full_name, current_class_id, classes(name))
      `)
      .eq("school_id", schoolId)
      .eq("is_deleted", false)
      .order("created_at", { ascending: false });

    if (studentId) query = query.eq("student_id", studentId);
    if (discountId) query = query.eq("discount_id", discountId);

    const { data, error } = await query;

    if (error) return dbError(error, "Database error");

    // Pre-existing inline `: any` casts on data joins; migration guide
    // §7.6 puts these out of scope for the wrapper refactor.
    /* eslint-disable @typescript-eslint/no-explicit-any */
    const result = (data || []).map((sd: any) => ({
      ...sd,
      student_name: sd.student?.full_name,
      student_class: sd.student?.classes?.name,
    }));
    /* eslint-enable @typescript-eslint/no-explicit-any */

    return result;
  },
});

export const POST = route({
  roles: ["SCHOOL_ADMIN", "BURSAR"],
  schema: applyDiscountSchema,
  handler: async (ctx, body) => {
    const schoolId = ctx.profile.school_id!;

    // Both FKs must belong to this school. Discounts feed recalculate_fee_account,
    // so an unscoped student_id/discount_id would be a cross-tenant financial gap.
    const { data: discStudent } = await ctx.supabase
      .from("students")
      .select("id")
      .eq("id", body.student_id)
      .eq("school_id", schoolId)
      .eq("is_deleted", false)
      .maybeSingle();
    if (!discStudent) return errorResponse("Student not found in this school", 404);

    const { data: discount } = await ctx.supabase
      .from("fee_discounts")
      .select("id")
      .eq("id", body.discount_id)
      .eq("school_id", schoolId)
      .maybeSingle();
    if (!discount) return errorResponse("Discount not found in this school", 404);

    // Check for duplicate (student + discount + term). term_id is
    // nullable, so a discount applied across all terms is a row
    // with term_id IS NULL — not term_id = ''. PostgREST's .is()
    // is the correct filter for null comparisons.
    let existingQuery = ctx.supabase
      .from("student_discounts")
      .select("id")
      .eq("student_id", body.student_id)
      .eq("discount_id", body.discount_id)
      .eq("is_deleted", false);
    existingQuery = body.term_id
      ? existingQuery.eq("term_id", body.term_id)
      : existingQuery.is("term_id", null);
    const { data: existing } = await existingQuery.maybeSingle();

    if (existing) {
      return errorResponse("This discount is already applied to this student for this term", 400);
    }

    const { data, error } = await ctx.supabase
      .from("student_discounts")
      .insert({
        school_id: schoolId,
        student_id: body.student_id,
        discount_id: body.discount_id,
        term_id: body.term_id ?? null,
        approved_by: ctx.user.id,
        note: body.note ?? null,
      } as unknown as Database["public"]["Tables"]["student_discounts"]["Insert"])
      .select()
      .single();

    if (error) return dbError(error, "Database error");

    // Recalculate fee accounts for affected terms
    if (body.term_id) {
      // Specific term - recalculate that account
      const { data: account } = await ctx.supabase
        .from("fee_accounts")
        .select("id")
        .eq("student_id", body.student_id)
        .eq("term_id", body.term_id)
        .eq("is_deleted", false)
        .maybeSingle();

      if (account) {
        await ctx.supabase.rpc("recalculate_fee_account", {
          p_account_id: account.id,
        });
      }
    } else {
      // All terms - recalculate all accounts for this student
      const { data: accounts } = await ctx.supabase
        .from("fee_accounts")
        .select("id")
        .eq("student_id", body.student_id)
        .eq("is_deleted", false);

      if (accounts) {
        for (const account of accounts) {
          await ctx.supabase.rpc("recalculate_fee_account", {
            p_account_id: account.id,
          });
        }
      }
    }

    // Audit log
    await ctx.supabase.from("audit_logs").insert({
      school_id: schoolId,
      user_id: ctx.user.id,
      action: "discount_applied",
      entity_type: "student_discount",
      entity_id: data.id,
      new_value: body,
    } as unknown as Database["public"]["Tables"]["audit_logs"]["Insert"]);

    return data;
  },
});

export const DELETE = route({
  roles: ["SCHOOL_ADMIN", "BURSAR"],
  handler: async (ctx, request) => {
    const schoolId = ctx.profile.school_id!;
    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");

    if (!id) return errorResponse("Student discount ID is required", 400);

    // Get the discount before deleting (for recalculation)
    const { data: studentDiscount } = await ctx.supabase
      .from("student_discounts")
      .select("student_id, term_id")
      .eq("id", id)
      .eq("school_id", schoolId)
      .single();

    if (!studentDiscount) return errorResponse("Discount not found", 404);

    const { error } = await ctx.supabase
      .from("student_discounts")
      .update({ is_deleted: true } as unknown as Database["public"]["Tables"]["student_discounts"]["Update"])
      .eq("id", id)
      .eq("school_id", schoolId);

    if (error) return dbError(error, "Database error");

    // Recalculate affected fee accounts
    if (studentDiscount.term_id) {
      const { data: account } = await ctx.supabase
        .from("fee_accounts")
        .select("id")
        .eq("student_id", studentDiscount.student_id)
        .eq("term_id", studentDiscount.term_id)
        .eq("is_deleted", false)
        .maybeSingle();

      if (account) {
        await ctx.supabase.rpc("recalculate_fee_account", {
          p_account_id: account.id,
        });
      }
    } else {
      const { data: accounts } = await ctx.supabase
        .from("fee_accounts")
        .select("id")
        .eq("student_id", studentDiscount.student_id)
        .eq("is_deleted", false);

      if (accounts) {
        for (const account of accounts) {
          await ctx.supabase.rpc("recalculate_fee_account", {
            p_account_id: account.id,
          });
        }
      }
    }

    return { deleted: true };
  },
});

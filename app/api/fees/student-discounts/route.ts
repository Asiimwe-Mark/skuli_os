import { applyDiscountSchema } from "@/lib/validations/fees";
import { route, errorResponse, dbError } from "@/lib/http";
import { writeAuditLog } from "@/lib/audit-log";
import { invalidateSchoolAsync } from "@/lib/api-cache";

export const GET = route({
  roles: ["SCHOOL_ADMIN", "BURSAR", "SUPER_ADMIN"],
  handler: async (ctx, request) => {
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
      .eq("school_id", ctx.schoolId)
      .eq("is_deleted", false)
      .order("created_at", { ascending: false });

    if (studentId) query = query.eq("student_id", studentId);
    if (discountId) query = query.eq("discount_id", discountId);

    const { data, error } = await query;

    if (error) return dbError(error, "Database error");

    const result = (data || []).map((sd) => {
      const student = Array.isArray(sd.student) ? sd.student[0] : sd.student;
      return {
        ...sd,
        student_name: student?.full_name,
        student_class: (Array.isArray(student?.classes) ? student?.classes[0] : student?.classes)?.name,
      };
    });

    return result;
  },
});

export const POST = route({
  roles: ["SCHOOL_ADMIN", "BURSAR"],
  schema: applyDiscountSchema,
  handler: async (ctx, body) => {
    const { data: discStudent } = await ctx.supabase
      .from("students")
      .select("id")
      .eq("id", body.student_id)
      .eq("school_id", ctx.schoolId)
      .eq("is_deleted", false)
      .maybeSingle();
    if (!discStudent) return errorResponse("Student not found in this school", 404);

    const { data: discount } = await ctx.supabase
      .from("fee_discounts")
      .select("id")
      .eq("id", body.discount_id)
      .eq("school_id", ctx.schoolId)
      .maybeSingle();
    if (!discount) return errorResponse("Discount not found in this school", 404);

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
        school_id: ctx.schoolId,
        student_id: body.student_id,
        discount_id: body.discount_id,
        term_id: body.term_id ?? null,
        note: body.note ?? null,
      } as never)
      .select()
      .single();

    if (error) return dbError(error, "Database error");

    if (body.term_id) {
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

    await writeAuditLog(ctx.supabase, {
      school_id: ctx.schoolId,
      user_id: ctx.user.id,
      action: "discount_applied",
      entity_type: "student_discount",
      entity_id: data?.id ?? null,
      new_value: body as Record<string, unknown>,
    });

    void invalidateSchoolAsync(ctx.schoolId);

    return data;
  },
});

export const DELETE = route({
  roles: ["SCHOOL_ADMIN", "BURSAR"],
  handler: async (ctx, request) => {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");

    if (!id) return errorResponse("Student discount ID is required", 400);

    const { data: studentDiscount } = await ctx.supabase
      .from("student_discounts")
      .select("student_id, term_id")
      .eq("id", id)
      .eq("school_id", ctx.schoolId)
      .single();

    if (!studentDiscount) return errorResponse("Discount not found", 404);

    const { error } = await ctx.supabase
      .from("student_discounts")
      .update({ is_deleted: true } as never)
      .eq("id", id)
      .eq("school_id", ctx.schoolId);

    if (error) return dbError(error, "Database error");

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

    void invalidateSchoolAsync(ctx.schoolId);
    return { deleted: true };
  },
});
import { NextRequest } from "next/server";
import { applyDiscountSchema } from "@/lib/validations/fees";
import {
  getSupabaseAndUser,
  requireSchool,
  requireRole,
  successResponse,
  errorResponse,
} from "@/lib/api-helpers";

export async function GET(request: NextRequest) {
  try {
    const ctx = await getSupabaseAndUser();
    const schoolId = requireSchool(ctx);

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

    if (error) return errorResponse(error.message, 500);

    // Transform joined data
    const result = (data || []).map((sd: any) => ({
      ...sd,
      student_name: sd.student?.full_name,
      student_class: sd.student?.classes?.name,
    }));

    return successResponse(result);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Internal server error";
    const status = err instanceof Error && "status" in err ? (err as any).status : 500;
    return errorResponse(message, status);
  }
}

export async function POST(request: NextRequest) {
  try {
    const ctx = await getSupabaseAndUser();
    const schoolId = requireSchool(ctx);
    requireRole(ctx, ["SCHOOL_ADMIN", "BURSAR"]);

    const body = await request.json();
    const parsed = applyDiscountSchema.safeParse(body);
    if (!parsed.success) {
      return errorResponse(parsed.error.issues[0].message, 400);
    }

    // Check for duplicate (student + discount + term)
    const { data: existing } = await ctx.supabase
      .from("student_discounts")
      .select("id")
      .eq("student_id", parsed.data.student_id)
      .eq("discount_id", parsed.data.discount_id)
      .eq("term_id", parsed.data.term_id ?? null)
      .eq("is_deleted", false)
      .maybeSingle();

    if (existing) {
      return errorResponse("This discount is already applied to this student for this term", 400);
    }

    const { data, error } = await ctx.supabase
      .from("student_discounts")
      .insert({
        school_id: schoolId,
        student_id: parsed.data.student_id,
        discount_id: parsed.data.discount_id,
        term_id: parsed.data.term_id ?? null,
        approved_by: ctx.user.id,
        note: parsed.data.note ?? null,
      } as any)
      .select()
      .single();

    if (error) return errorResponse(error.message, 500);

    // Recalculate fee accounts for affected terms
    if (parsed.data.term_id) {
      // Specific term — recalculate that account
      const { data: account } = await ctx.supabase
        .from("fee_accounts")
        .select("id")
        .eq("student_id", parsed.data.student_id)
        .eq("term_id", parsed.data.term_id)
        .eq("is_deleted", false)
        .maybeSingle();

      if (account) {
        await ctx.supabase.rpc("recalculate_fee_account", {
          p_account_id: account.id,
        });
      }
    } else {
      // All terms — recalculate all accounts for this student
      const { data: accounts } = await ctx.supabase
        .from("fee_accounts")
        .select("id")
        .eq("student_id", parsed.data.student_id)
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
      new_value: parsed.data,
    } as any);

    return successResponse(data);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Internal server error";
    const status = err instanceof Error && "status" in err ? (err as any).status : 500;
    return errorResponse(message, status);
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const ctx = await getSupabaseAndUser();
    const schoolId = requireSchool(ctx);
    requireRole(ctx, ["SCHOOL_ADMIN", "BURSAR"]);

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
      .update({ is_deleted: true } as any)
      .eq("id", id)
      .eq("school_id", schoolId);

    if (error) return errorResponse(error.message, 500);

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

    return successResponse({ deleted: true });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Internal server error";
    const status = err instanceof Error && "status" in err ? (err as any).status : 500;
    return errorResponse(message, status);
  }
}

import type { Database } from "@/types/database";
import { createExpenseSchema } from "@/lib/validations/fees";
import { route, errorResponse, dbError } from "@/lib/http";

export const GET = route({
  roles: ["SCHOOL_ADMIN", "BURSAR", "SUPER_ADMIN"],
  handler: async (ctx, request) => {
    const schoolId = ctx.profile.school_id!;

    const { searchParams } = new URL(request.url);
    const termId = searchParams.get("term_id");
    const categoryId = searchParams.get("category_id");
    const dateFrom = searchParams.get("date_from");
    const dateTo = searchParams.get("date_to");

    let query = ctx.supabase
      .from("expenses")
      .select(`
        *,
        expense_categories (name),
        users!recorded_by (full_name)
      `)
      .eq("school_id", schoolId)
      .eq("is_deleted", false)
      .order("expense_date", { ascending: false });

    if (termId) query = query.eq("term_id", termId);
    if (categoryId) query = query.eq("category_id", categoryId);
    if (dateFrom) query = query.gte("expense_date", dateFrom);
    if (dateTo) query = query.lte("expense_date", dateTo);

    const { data, error } = await query;

    if (error) return dbError(error, "Database error");

    return data || [];
  },
});

export const POST = route({
  roles: ["SCHOOL_ADMIN", "BURSAR", "SUPER_ADMIN"],
  schema: createExpenseSchema,
  handler: async (ctx, body) => {
    const schoolId = ctx.profile.school_id!;

    // Body-supplied FKs must belong to the caller's school.
    if (body.category_id) {
      const { data: cat } = await ctx.supabase
        .from("expense_categories")
        .select("id")
        .eq("id", body.category_id)
        .eq("school_id", schoolId)
        .maybeSingle();
      if (!cat) return errorResponse("Invalid expense category for this school", 400);
    }
    if (body.term_id) {
      const { data: term } = await ctx.supabase
        .from("terms")
        .select("id")
        .eq("id", body.term_id)
        .eq("school_id", schoolId)
        .maybeSingle();
      if (!term) return errorResponse("Invalid term for this school", 400);
    }

    const { data, error } = await ctx.supabase
      .from("expenses")
      .insert({
        school_id: schoolId,
        category_id: body.category_id ?? null,
        term_id: body.term_id ?? null,
        description: body.description,
        amount: body.amount,
        expense_date: body.expense_date,
        payment_method: body.payment_method,
        receipt_number: body.receipt_number ?? null,
        recorded_by: ctx.user.id,
        notes: body.notes ?? null,
      } as unknown as Database["public"]["Tables"]["expenses"]["Insert"])
      .select(`
        *,
        expense_categories (name),
        users!recorded_by (full_name)
      `)
      .single();

    if (error) return dbError(error, "Database error");

    return data;
  },
});

export const PATCH = route({
  roles: ["SCHOOL_ADMIN", "BURSAR", "SUPER_ADMIN"],
  schema: createExpenseSchema.partial(),
  handler: async (ctx, body, request) => {
    const schoolId = ctx.profile.school_id!;

    // The body arrives without an id (Zod has no `id` field). Pull it
    // from the URL or query string — the legacy call sites pass ?id=…
    // alongside the JSON body.
    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");
    if (!id) return errorResponse("Expense ID is required", 400);

    const { data, error } = await ctx.supabase
      .from("expenses")
      .update(body as unknown as Database["public"]["Tables"]["expenses"]["Update"])
      .eq("id", id)
      .eq("school_id", schoolId)
      .eq("is_deleted", false)
      .select(`
        *,
        expense_categories (name),
        users!recorded_by (full_name)
      `)
      .single();

    if (error) return dbError(error, "Database error");

    return data;
  },
});

export const DELETE = route({
  roles: ["SCHOOL_ADMIN", "BURSAR", "SUPER_ADMIN"],
  handler: async (ctx, request) => {
    const schoolId = ctx.profile.school_id!;
    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");

    if (!id) return errorResponse("Expense ID is required", 400);

    const { error } = await ctx.supabase
      .from("expenses")
      .update({ is_deleted: true } as unknown as Database["public"]["Tables"]["expenses"]["Update"])
      .eq("id", id)
      .eq("school_id", schoolId);

    if (error) return dbError(error, "Database error");

    return { deleted: true };
  },
});

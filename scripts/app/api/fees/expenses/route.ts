import { NextRequest } from "next/server";
import type { Database } from "@/types/database";
import { createExpenseSchema } from "@/lib/validations/fees";
import {
  getSupabaseAndUser,
  requireSchool,
  requireRole,
  successResponse,
  errorResponse,
  dbError,
  getErrorStatus } from "@/lib/api-helpers";

export async function GET(request: NextRequest) {
  try {
    const ctx = await getSupabaseAndUser();
    const schoolId = requireSchool(ctx);
    requireRole(ctx, ["SCHOOL_ADMIN", "BURSAR", "SUPER_ADMIN"]);

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

    return successResponse(data || []);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Internal server error";
    const status = getErrorStatus(err);
    return errorResponse(message, status);
  }
}

export async function POST(request: NextRequest) {
  try {
    const ctx = await getSupabaseAndUser();
    const schoolId = requireSchool(ctx);
    requireRole(ctx, ["SCHOOL_ADMIN", "BURSAR", "SUPER_ADMIN"]);

    const body = await request.json();
    const parsed = createExpenseSchema.safeParse(body);
    if (!parsed.success) {
      return errorResponse(parsed.error.issues[0].message, 400);
    }

    // Body-supplied FKs must belong to the caller's school.
    if (parsed.data.category_id) {
      const { data: cat } = await ctx.supabase
        .from("expense_categories")
        .select("id")
        .eq("id", parsed.data.category_id)
        .eq("school_id", schoolId)
        .maybeSingle();
      if (!cat) return errorResponse("Invalid expense category for this school", 400);
    }
    if (parsed.data.term_id) {
      const { data: term } = await ctx.supabase
        .from("terms")
        .select("id")
        .eq("id", parsed.data.term_id)
        .eq("school_id", schoolId)
        .maybeSingle();
      if (!term) return errorResponse("Invalid term for this school", 400);
    }

    const { data, error } = await ctx.supabase
      .from("expenses")
      .insert({
        school_id: schoolId,
        category_id: parsed.data.category_id ?? null,
        term_id: parsed.data.term_id ?? null,
        description: parsed.data.description,
        amount: parsed.data.amount,
        expense_date: parsed.data.expense_date,
        payment_method: parsed.data.payment_method,
        receipt_number: parsed.data.receipt_number ?? null,
        recorded_by: ctx.user.id,
        notes: parsed.data.notes ?? null } as unknown as Database["public"]["Tables"]["expenses"]["Insert"])
      .select(`
        *,
        expense_categories (name),
        users!recorded_by (full_name)
      `)
      .single();

    if (error) return dbError(error, "Database error");

    return successResponse(data);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Internal server error";
    const status = getErrorStatus(err);
    return errorResponse(message, status);
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const ctx = await getSupabaseAndUser();
    const schoolId = requireSchool(ctx);
    requireRole(ctx, ["SCHOOL_ADMIN", "BURSAR", "SUPER_ADMIN"]);

    const body = await request.json();
    const { id, ...updates } = body;

    if (!id) return errorResponse("Expense ID is required", 400);

    const parsed = createExpenseSchema.partial().safeParse(updates);
    if (!parsed.success) {
      return errorResponse(parsed.error.issues[0].message, 400);
    }

    const { data, error } = await ctx.supabase
      .from("expenses")
      .update(parsed.data as unknown as Database["public"]["Tables"]["expenses"]["Update"])
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

    return successResponse(data);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Internal server error";
    const status = getErrorStatus(err);
    return errorResponse(message, status);
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const ctx = await getSupabaseAndUser();
    const schoolId = requireSchool(ctx);
    requireRole(ctx, ["SCHOOL_ADMIN", "BURSAR", "SUPER_ADMIN"]);

    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");

    if (!id) return errorResponse("Expense ID is required", 400);

    const { error } = await ctx.supabase
      .from("expenses")
      .update({ is_deleted: true } as unknown as Database["public"]["Tables"]["expenses"]["Update"])
      .eq("id", id)
      .eq("school_id", schoolId);

    if (error) return dbError(error, "Database error");

    return successResponse({ deleted: true });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Internal server error";
    const status = getErrorStatus(err);
    return errorResponse(message, status);
  }
}

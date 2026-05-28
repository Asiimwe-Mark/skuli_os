import { NextRequest } from "next/server";
import { createExpenseCategorySchema } from "@/lib/validations/fees";
import {
  getSupabaseAndUser,
  requireSchool,
  requireRole,
  successResponse,
  errorResponse,
} from "@/lib/api-helpers";

export async function GET() {
  try {
    const ctx = await getSupabaseAndUser();
    const schoolId = requireSchool(ctx);
    requireRole(ctx, ["SCHOOL_ADMIN", "BURSAR", "SUPER_ADMIN"]);

    const { data: categories, error } = await ctx.supabase
      .from("expense_categories")
      .select("*")
      .eq("school_id", schoolId)
      .eq("is_deleted", false)
      .order("name");

    if (!categories) return successResponse([]);

    // Get expense counts per category
    const categoryIds = categories.map((c) => c.id);
    const { data: countData } = await ctx.supabase
      .from("expenses")
      .select("category_id")
      .in("category_id", categoryIds)
      .eq("is_deleted", false);

    const countMap = new Map<string, number>();
    countData?.forEach((e) => {
      countMap.set(e.category_id, (countMap.get(e.category_id) || 0) + 1);
    });

    const result = categories.map((c) => ({
      ...c,
      expense_count: countMap.get(c.id) || 0,
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
    requireRole(ctx, ["SCHOOL_ADMIN", "BURSAR", "SUPER_ADMIN"]);

    const body = await request.json();
    const parsed = createExpenseCategorySchema.safeParse(body);
    if (!parsed.success) {
      return errorResponse(parsed.error.issues[0].message, 400);
    }

    const { data, error } = await ctx.supabase
      .from("expense_categories")
      .insert({
        school_id: schoolId,
        name: parsed.data.name,
      } as any)
      .select()
      .single();

    if (error) {
      if (error.code === "23505") {
        return errorResponse("A category with this name already exists", 409);
      }
      return errorResponse(error.message, 500);
    }

    return successResponse(data);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Internal server error";
    const status = err instanceof Error && "status" in err ? (err as any).status : 500;
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

    if (!id) return errorResponse("Category ID is required", 400);

    const parsed = createExpenseCategorySchema.partial().safeParse(updates);
    if (!parsed.success) {
      return errorResponse(parsed.error.issues[0].message, 400);
    }

    const { data, error } = await ctx.supabase
      .from("expense_categories")
      .update(parsed.data as any)
      .eq("id", id)
      .eq("school_id", schoolId)
      .eq("is_deleted", false)
      .select()
      .single();

    if (error) return errorResponse(error.message, 500);

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
    requireRole(ctx, ["SCHOOL_ADMIN", "BURSAR", "SUPER_ADMIN"]);

    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");

    if (!id) return errorResponse("Category ID is required", 400);

    // Check if category has linked expenses
    const { count } = await ctx.supabase
      .from("expenses")
      .select("id", { count: "exact", head: true })
      .eq("category_id", id)
      .eq("is_deleted", false);

    if (count && count > 0) {
      // Unlink expenses from this category first
      await ctx.supabase
        .from("expenses")
        .update({ category_id: null } as any)
        .eq("category_id", id)
        .eq("is_deleted", false);
    }

    const { error } = await ctx.supabase
      .from("expense_categories")
      .update({ is_deleted: true } as any)
      .eq("id", id)
      .eq("school_id", schoolId);

    if (error) return errorResponse(error.message, 500);

    return successResponse({ deleted: true });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Internal server error";
    const status = err instanceof Error && "status" in err ? (err as any).status : 500;
    return errorResponse(message, status);
  }
}

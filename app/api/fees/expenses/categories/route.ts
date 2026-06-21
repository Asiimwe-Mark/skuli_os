import type { Database } from "@/types/database";
import { createExpenseCategorySchema } from "@/lib/validations/fees";
import { route, errorResponse, dbError } from "@/lib/http";

export const GET = route({
  roles: ["SCHOOL_ADMIN", "BURSAR", "SUPER_ADMIN"],
  handler: async (ctx) => {
    const schoolId = ctx.profile.school_id!;

    const { data: categories, error } = await ctx.supabase
      .from("expense_categories")
      .select("*")
      .eq("school_id", schoolId)
      .eq("is_deleted", false)
      .order("name");

    if (error) return dbError(error, "Database error");
    if (!categories) return [];

    // Get expense counts per category
    const categoryIds = categories.map((c) => c.id);
    const { data: countData } = await ctx.supabase
      .from("expenses")
      .select("category_id")
      .in("category_id", categoryIds)
      .eq("is_deleted", false);

    const countMap = new Map<string, number>();
    countData?.forEach((e) => {
      if (e.category_id) {
        countMap.set(e.category_id, (countMap.get(e.category_id) || 0) + 1);
      }
    });

    return categories.map((c) => ({
      ...c,
      expense_count: countMap.get(c.id) || 0,
    }));
  },
});

export const POST = route({
  roles: ["SCHOOL_ADMIN", "BURSAR", "SUPER_ADMIN"],
  schema: createExpenseCategorySchema,
  handler: async (ctx, body) => {
    const schoolId = ctx.profile.school_id!;

    const { data, error } = await ctx.supabase
      .from("expense_categories")
      .insert({
        school_id: schoolId,
        name: body.name,
      } as unknown as Database["public"]["Tables"]["expense_categories"]["Insert"])
      .select()
      .single();

    if (error) {
      if (error.code === "23505") {
        return errorResponse("A category with this name already exists", 409);
      }
      return dbError(error, "Database error");
    }

    return data;
  },
});

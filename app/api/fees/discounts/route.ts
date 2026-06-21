import type { Database } from "@/types/database";
import { createDiscountSchema } from "@/lib/validations/fees";
import { route, dbError } from "@/lib/http";

export const GET = route({
  roles: ["SCHOOL_ADMIN", "BURSAR"],
  handler: async (ctx) => {
    const schoolId = ctx.profile.school_id!;

    const { data: discounts, error } = await ctx.supabase
      .from("fee_discounts")
      .select("*")
      .eq("school_id", schoolId)
      .eq("is_deleted", false)
      .order("created_at", { ascending: false });

    if (error) return dbError(error, "Database error");
    if (!discounts) return [];

    // Get student counts per discount
    const discountIds = discounts.map((d) => d.id);
    const { data: countData } = await ctx.supabase
      .from("student_discounts")
      .select("discount_id")
      .in("discount_id", discountIds)
      .eq("is_deleted", false);

    const countMap = new Map<string, number>();
    countData?.forEach((sd) => {
      countMap.set(sd.discount_id, (countMap.get(sd.discount_id) || 0) + 1);
    });

    return discounts.map((d) => ({
      ...d,
      student_count: countMap.get(d.id) || 0,
    }));
  },
});

export const POST = route({
  roles: ["SCHOOL_ADMIN", "BURSAR"],
  schema: createDiscountSchema,
  handler: async (ctx, body) => {
    const schoolId = ctx.profile.school_id!;

    const { data, error } = await ctx.supabase
      .from("fee_discounts")
      .insert({
        school_id: schoolId,
        name: body.name,
        discount_type: body.discount_type,
        value: body.value,
        max_amount: body.max_amount ?? null,
        is_recurring: body.is_recurring,
      } as unknown as Database["public"]["Tables"]["fee_discounts"]["Insert"])
      .select()
      .single();

    if (error) return dbError(error, "Database error");

    // Audit log
    await ctx.supabase.from("audit_logs").insert({
      school_id: schoolId,
      user_id: ctx.user.id,
      action: "discount_created",
      entity_type: "fee_discount",
      entity_id: data.id,
      new_value: body,
    } as unknown as Database["public"]["Tables"]["audit_logs"]["Insert"]);

    return data;
  },
});

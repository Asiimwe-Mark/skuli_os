import { NextRequest } from "next/server";
import { createDiscountSchema } from "@/lib/validations/fees";
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
    requireRole(ctx, ["SCHOOL_ADMIN", "BURSAR"]);

    const { data: discounts, error } = await ctx.supabase
      .from("fee_discounts")
      .select("*")
      .eq("school_id", schoolId)
      .eq("is_deleted", false)
      .order("created_at", { ascending: false });

    if (!discounts) return successResponse([]);

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

    const result = discounts.map((d) => ({
      ...d,
      student_count: countMap.get(d.id) || 0,
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
    const parsed = createDiscountSchema.safeParse(body);
    if (!parsed.success) {
      return errorResponse(parsed.error.issues[0].message, 400);
    }

    const { data, error } = await ctx.supabase
      .from("fee_discounts")
      .insert({
        school_id: schoolId,
        name: parsed.data.name,
        discount_type: parsed.data.discount_type,
        value: parsed.data.value,
        max_amount: parsed.data.max_amount ?? null,
        is_recurring: parsed.data.is_recurring,
      } as any)
      .select()
      .single();

    if (error) return errorResponse(error.message, 500);

    // Audit log
    await ctx.supabase.from("audit_logs").insert({
      school_id: schoolId,
      user_id: ctx.user.id,
      action: "discount_created",
      entity_type: "fee_discount",
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

export async function PATCH(request: NextRequest) {
  try {
    const ctx = await getSupabaseAndUser();
    const schoolId = requireSchool(ctx);
    requireRole(ctx, ["SCHOOL_ADMIN", "BURSAR"]);

    const body = await request.json();
    const { id, ...updates } = body;

    if (!id) return errorResponse("Discount ID is required", 400);

    const parsed = createDiscountSchema.partial().safeParse(updates);
    if (!parsed.success) {
      return errorResponse(parsed.error.issues[0].message, 400);
    }

    const { data, error } = await ctx.supabase
      .from("fee_discounts")
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
    requireRole(ctx, ["SCHOOL_ADMIN", "BURSAR"]);

    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");

    if (!id) return errorResponse("Discount ID is required", 400);

    const { error } = await ctx.supabase
      .from("fee_discounts")
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

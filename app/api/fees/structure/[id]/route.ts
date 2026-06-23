import { route, errorResponse, dbError } from "@/lib/http";
import { writeAuditLog } from "@/lib/audit-log";
import { invalidateSchoolAsync } from "@/lib/api-cache";

export const PATCH = route({
  roles: ["SCHOOL_ADMIN", "BURSAR", "SUPER_ADMIN"],
  handler: async (ctx, request, params) => {
    const { id } = params ?? {};
    if (!id) {
      return errorResponse("Fee structure ID required", 400);
    }

    const { data: existing } = await ctx.supabase
      .from("fee_structures")
      .select("*")
      .eq("id", id)
      .eq("school_id", ctx.schoolId)
      .eq("is_deleted", false)
      .single() as { data: Record<string, unknown> | null };

    if (!existing) {
      return errorResponse("Fee structure not found", 404);
    }

    const body = await request.json();

    const allowedFields: Record<string, unknown> = {};
    if (body.name !== undefined) allowedFields.name = body.name;
    if (body.amount !== undefined) {
      if (typeof body.amount !== "number" || body.amount <= 0) {
        return errorResponse("Amount must be a positive number", 400);
      }
      allowedFields.amount = body.amount;
    }
    if (body.is_mandatory !== undefined) allowedFields.is_mandatory = body.is_mandatory;
    if (body.class_id !== undefined) {
      if (body.class_id !== null) {
        const { data: cls } = await ctx.supabase
          .from("classes")
          .select("id")
          .eq("id", body.class_id)
          .eq("school_id", ctx.schoolId)
          .maybeSingle();
        if (!cls) {
          return errorResponse("Invalid class for this school", 400);
        }
      }
      allowedFields.class_id = body.class_id;
    }

    if (Object.keys(allowedFields).length === 0) {
      return errorResponse("No valid fields to update", 400);
    }

    const { data, error } = await ctx.supabase
      .from("fee_structures")
      .update(allowedFields as never)
      .eq("id", id)
      .eq("school_id", ctx.schoolId)
      .select()
      .single();

    if (error) return dbError(error, "Database error");

    await writeAuditLog(ctx.supabase, {
      school_id: ctx.schoolId,
      user_id: ctx.user.id,
      action: "fee_structure_updated",
      entity_type: "fee_structure",
      entity_id: id,
      old_value: { name: (existing as { name: string }).name, amount: (existing as { amount: number }).amount },
      new_value: allowedFields,
    });

    void invalidateSchoolAsync(ctx.schoolId);
    return data;
  },
});

export const DELETE = route({
  roles: ["SCHOOL_ADMIN", "BURSAR", "SUPER_ADMIN"],
  handler: async (ctx, _request, params) => {
    const { id } = params ?? {};
    if (!id) {
      return errorResponse("Fee structure ID required", 400);
    }

    const { data: existing } = await ctx.supabase
      .from("fee_structures")
      .select("id, name, amount")
      .eq("id", id)
      .eq("school_id", ctx.schoolId)
      .eq("is_deleted", false)
      .single() as { data: { id: string; name: string; amount: number } | null };

    if (!existing) {
      return errorResponse("Fee structure not found", 404);
    }

    const { error } = await ctx.supabase
      .from("fee_structures")
      .update({ is_deleted: true })
      .eq("id", id)
      .eq("school_id", ctx.schoolId);

    if (error) return dbError(error, "Database error");

    await writeAuditLog(ctx.supabase, {
      school_id: ctx.schoolId,
      user_id: ctx.user.id,
      action: "fee_structure_deleted",
      entity_type: "fee_structure",
      entity_id: id,
      old_value: { name: existing.name, amount: existing.amount },
    });

    void invalidateSchoolAsync(ctx.schoolId);
    return { deleted: true };
  },
});
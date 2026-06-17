import { NextRequest } from "next/server";
import type { Database } from "@/types/database";
import {
  getSupabaseAndUser,
  requireSchool,
  requireRole,
  successResponse,
  errorResponse,
  dbError,
  getErrorStatus } from "@/lib/api-helpers";

type FeeStructureRow = Database["public"]["Tables"]["fee_structures"]["Row"];

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function PATCH(request: NextRequest, { params }: RouteContext) {
  try {
    const ctx = await getSupabaseAndUser();
    const schoolId = requireSchool(ctx);
    requireRole(ctx, ["SCHOOL_ADMIN", "BURSAR", "SUPER_ADMIN"]);
    const { id } = await params;

    const { data: existing } = await ctx.supabase
      .from("fee_structures")
      .select("*")
      .eq("id", id)
      .eq("school_id", schoolId)
      .eq("is_deleted", false)
      .single() as { data: Record<string, any> | null };

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
      // A class_id from the body must belong to the caller's school. Otherwise a
      // fee structure could be repointed at another tenant's class (cross-tenant
      // FK reference). null is allowed (school-wide fee).
      if (body.class_id !== null) {
        const { data: cls } = await ctx.supabase
          .from("classes")
          .select("id")
          .eq("id", body.class_id)
          .eq("school_id", schoolId)
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
      .update(allowedFields as unknown as Database["public"]["Tables"]["fee_structures"]["Update"])
      .eq("id", id)
      .eq("school_id", schoolId)
      .select()
      .single();

    if (error) return dbError(error, "Database error");

    // Audit log
    await ctx.supabase.from("audit_logs").insert({
      school_id: schoolId,
      user_id: ctx.user.id,
      action: "fee_structure_updated",
      entity_type: "fee_structure",
      entity_id: id,
      old_value: { name: existing.name, amount: existing.amount },
      new_value: allowedFields } as unknown as Database["public"]["Tables"]["audit_logs"]["Insert"]);

    return successResponse(data);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Internal server error";
    const status = getErrorStatus(err);
    return errorResponse(message, status);
  }
}

export async function DELETE(request: NextRequest, { params }: RouteContext) {
  try {
    const ctx = await getSupabaseAndUser();
    const schoolId = requireSchool(ctx);
    requireRole(ctx, ["SCHOOL_ADMIN", "BURSAR", "SUPER_ADMIN"]);
    const { id } = await params;

    const { data: existing } = await ctx.supabase
      .from("fee_structures")
      .select("id, name, amount")
      .eq("id", id)
      .eq("school_id", schoolId)
      .eq("is_deleted", false)
      .single() as { data: { id: string; name: string; amount: number } | null };

    if (!existing) {
      return errorResponse("Fee structure not found", 404);
    }

    // Soft delete
    const { error } = await ctx.supabase
      .from("fee_structures")
      .update({ is_deleted: true })
      .eq("id", id)
      .eq("school_id", schoolId);

    if (error) return dbError(error, "Database error");

    // Audit log
    await ctx.supabase.from("audit_logs").insert({
      school_id: schoolId,
      user_id: ctx.user.id,
      action: "fee_structure_deleted",
      entity_type: "fee_structure",
      entity_id: id,
      old_value: { name: existing.name, amount: existing.amount } } as unknown as Database["public"]["Tables"]["audit_logs"]["Insert"]);

    return successResponse({ deleted: true });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Internal server error";
    const status = getErrorStatus(err);
    return errorResponse(message, status);
  }
}

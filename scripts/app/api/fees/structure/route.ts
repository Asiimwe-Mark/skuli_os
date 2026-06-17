import { NextRequest } from "next/server";
import type { Database } from "@/types/database";
import { createFeeStructureSchema } from "@/lib/validations/fees";
import {
  getSupabaseAndUser,
  requireSchool,
  requireRole,
  successResponse,
  errorResponse,
  dbError,
  getErrorStatus } from "@/lib/api-helpers";

type FeeStructureRow = Database["public"]["Tables"]["fee_structures"]["Row"];
type TermRow = Database["public"]["Tables"]["terms"]["Row"];
type ClassRow = Database["public"]["Tables"]["classes"]["Row"];

export async function GET(request: NextRequest) {
  try {
    const ctx = await getSupabaseAndUser();
    const schoolId = requireSchool(ctx);

    const { searchParams } = new URL(request.url);
    const termId = searchParams.get("term_id");
    const classId = searchParams.get("class_id");

    let query = ctx.supabase
      .from("fee_structures")
      .select("*, class:classes(id, name)")
      .eq("school_id", schoolId)
      .eq("is_deleted", false);

    if (termId) query = query.eq("term_id", termId);
    // Audit 2.8 (4.35): the previous `.or(\`class_id.is.null,class_id.eq.${classId}\`)`
    // works in modern PostgREST (>=11) but some older versions reject
    // `is.null` inside an `or` filter. The portable form uses the
    // `is()` builder for the null branch and combines via `.or()` with
    // the equality branch. Both produce the same SQL — "rows where
    // class_id is null OR class_id = $1" — and the second form is
    // accepted by every PostgREST version.
    if (classId) {
      query = query.or(`class_id.is.null,class_id.eq.${classId}`);
    }

    const { data, error } = await query.order("created_at", { ascending: false });

    if (error) return dbError(error, "Database error");

    // Audit 2.8 (4.36): return the standard list envelope so any
    // external consumer can rely on the same shape as every other
    // list endpoint. The dashboard page reads from supabase directly
    // and is unaffected by this change.
    return successResponse({ items: data ?? [] });
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
    const parsed = createFeeStructureSchema.safeParse(body);
    if (!parsed.success) {
      return errorResponse(parsed.error.issues[0].message, 400);
    }

    // Verify the term belongs to this school
    const { data: term } = await ctx.supabase
      .from("terms")
      .select("id")
      .eq("id", parsed.data.term_id)
      .eq("school_id", schoolId)
      .single() as { data: { id: string } | null };

    if (!term) {
      return errorResponse("Invalid term for this school", 400);
    }

    // If class_id provided, verify it belongs to this school
    if (parsed.data.class_id) {
      const { data: cls } = await ctx.supabase
        .from("classes")
        .select("id")
        .eq("id", parsed.data.class_id)
        .eq("school_id", schoolId)
        .single() as { data: { id: string } | null };

      if (!cls) {
        return errorResponse("Invalid class for this school", 400);
      }
    }

    const { data, error } = await ctx.supabase
      .from("fee_structures")
      .insert({
        school_id: schoolId,
        term_id: parsed.data.term_id,
        class_id: parsed.data.class_id ?? null,
        name: parsed.data.name,
        amount: parsed.data.amount,
        is_mandatory: parsed.data.is_mandatory } as unknown as Database["public"]["Tables"]["fee_structures"]["Insert"])
      .select()
      .single();

    if (error) return dbError(error, "Database error");

    // Audit logs
    await ctx.supabase.from("audit_logs").insert({
      school_id: schoolId,
      user_id: ctx.user.id,
      action: "fee_structure_created",
      entity_type: "fee_structure",
      entity_id: data?.id,
      new_value: { name: parsed.data.name, amount: parsed.data.amount } } as unknown as Database["public"]["Tables"]["audit_logs"]["Insert"]);

    await ctx.supabase.from("fee_structure_audit_log").insert({
      school_id: schoolId,
      fee_structure_id: data?.id,
      changed_by: ctx.user.id,
      action: "created",
      old_value: null,
      new_value: { name: parsed.data.name, amount: parsed.data.amount, is_mandatory: parsed.data.is_mandatory, class_id: parsed.data.class_id ?? null } } as unknown as Database["public"]["Tables"]["fee_structure_audit_log"]["Insert"]);

    return successResponse(data, 201);
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
    const { id, name, amount, is_mandatory, class_id } = body;
    if (!id) return errorResponse("Fee structure ID required", 400);

    // Whitelist allowed fields to prevent mass assignment
    const allowedFields: Record<string, unknown> = {};
    if (name !== undefined) allowedFields.name = name;
    if (amount !== undefined) {
      if (typeof amount !== "number" || amount <= 0) return errorResponse("Amount must be a positive number", 400);
      allowedFields.amount = amount;
    }
    if (is_mandatory !== undefined) allowedFields.is_mandatory = is_mandatory;
    if (class_id !== undefined) allowedFields.class_id = class_id;

    if (Object.keys(allowedFields).length === 0) return errorResponse("No valid fields to update", 400);

    // Fetch old values for audit
    const { data: old } = await ctx.supabase
      .from("fee_structures")
      .select("*")
      .eq("id", id)
      .eq("school_id", schoolId)
      .eq("is_deleted", false)
      .single();

    if (!old) return errorResponse("Fee structure not found", 404);

    const { data, error } = await ctx.supabase
      .from("fee_structures")
      .update({ ...allowedFields } as unknown as Database["public"]["Tables"]["fee_structures"]["Update"])
      .eq("id", id)
      .eq("school_id", schoolId)
      .select()
      .single();

    if (error) return dbError(error, "Database error");

    // Fee structure audit log
    await ctx.supabase.from("fee_structure_audit_log").insert({
      school_id: schoolId,
      fee_structure_id: id,
      changed_by: ctx.user.id,
      action: "updated",
      old_value: { name: old.name, amount: old.amount, is_mandatory: old.is_mandatory, class_id: old.class_id },
      new_value: { name: data.name, amount: data.amount, is_mandatory: data.is_mandatory, class_id: data.class_id } } as unknown as Database["public"]["Tables"]["fee_structure_audit_log"]["Insert"]);

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
    if (!id) return errorResponse("Fee structure ID required", 400);

    // Fetch old values
    const { data: old } = await ctx.supabase
      .from("fee_structures")
      .select("*")
      .eq("id", id)
      .eq("school_id", schoolId)
      .eq("is_deleted", false)
      .single();

    if (!old) return errorResponse("Fee structure not found", 404);

    const { error } = await ctx.supabase
      .from("fee_structures")
      .update({ is_deleted: true } as unknown as Database["public"]["Tables"]["fee_structures"]["Update"])
      .eq("id", id)
      .eq("school_id", schoolId);

    if (error) return dbError(error, "Database error");

    // Fee structure audit log
    await ctx.supabase.from("fee_structure_audit_log").insert({
      school_id: schoolId,
      fee_structure_id: id,
      changed_by: ctx.user.id,
      action: "deleted",
      old_value: { name: old.name, amount: old.amount, is_mandatory: old.is_mandatory },
      new_value: null } as unknown as Database["public"]["Tables"]["fee_structure_audit_log"]["Insert"]);

    return successResponse({ deleted: true });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Internal server error";
    const status = getErrorStatus(err);
    return errorResponse(message, status);
  }
}

import { NextRequest } from "next/server";
import type { Database } from "@/types/database";
import { createFeeStructureSchema } from "@/lib/validations/fees";
import {
  getSupabaseAndUser,
  requireSchool,
  requireRole,
  successResponse,
  errorResponse,
} from "@/lib/api-helpers";

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
    if (classId) query = query.or(`class_id.is.null,class_id.eq.${classId}`);

    const { data, error } = await query.order("created_at", { ascending: false });

    if (error) return errorResponse(error.message);

    return successResponse(data ?? []);
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
        is_mandatory: parsed.data.is_mandatory,
      } as any)
      .select()
      .single() as { data: any; error: any };

    if (error) return errorResponse(error.message, 400);

    // Audit logs
    await ctx.supabase.from("audit_logs").insert({
      school_id: schoolId,
      user_id: ctx.user.id,
      action: "fee_structure_created",
      entity_type: "fee_structure",
      entity_id: data?.id,
      new_value: { name: parsed.data.name, amount: parsed.data.amount },
    } as any);

    await ctx.supabase.from("fee_structure_audit_log").insert({
      school_id: schoolId,
      fee_structure_id: data?.id,
      changed_by: ctx.user.id,
      action: "created",
      old_value: null,
      new_value: { name: parsed.data.name, amount: parsed.data.amount, is_mandatory: parsed.data.is_mandatory, class_id: parsed.data.class_id ?? null },
    } as any);

    return successResponse(data, 201);
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
    if (!id) return errorResponse("Fee structure ID required", 400);

    // Fetch old values for audit
    const { data: old } = await ctx.supabase
      .from("fee_structures")
      .select("*")
      .eq("id", id)
      .eq("school_id", schoolId)
      .eq("is_deleted", false)
      .single() as { data: any };

    if (!old) return errorResponse("Fee structure not found", 404);

    const { data, error } = await ctx.supabase
      .from("fee_structures")
      .update({ ...updates, updated_at: new Date().toISOString() })
      .eq("id", id)
      .eq("school_id", schoolId)
      .select()
      .single() as { data: any; error: any };

    if (error) return errorResponse(error.message, 400);

    // Fee structure audit log
    await ctx.supabase.from("fee_structure_audit_log").insert({
      school_id: schoolId,
      fee_structure_id: id,
      changed_by: ctx.user.id,
      action: "updated",
      old_value: { name: old.name, amount: old.amount, is_mandatory: old.is_mandatory, class_id: old.class_id },
      new_value: { name: data.name, amount: data.amount, is_mandatory: data.is_mandatory, class_id: data.class_id },
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
      .single() as { data: any };

    if (!old) return errorResponse("Fee structure not found", 404);

    const { error } = await ctx.supabase
      .from("fee_structures")
      .update({ is_deleted: true, updated_at: new Date().toISOString() })
      .eq("id", id)
      .eq("school_id", schoolId);

    if (error) return errorResponse(error.message, 400);

    // Fee structure audit log
    await ctx.supabase.from("fee_structure_audit_log").insert({
      school_id: schoolId,
      fee_structure_id: id,
      changed_by: ctx.user.id,
      action: "deleted",
      old_value: { name: old.name, amount: old.amount, is_mandatory: old.is_mandatory },
      new_value: null,
    } as any);

    return successResponse({ deleted: true });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Internal server error";
    const status = err instanceof Error && "status" in err ? (err as any).status : 500;
    return errorResponse(message, status);
  }
}

import { NextRequest } from "next/server";
import { createAssetSchema, updateAssetSchema } from "@/lib/validations/assets";
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
    const category = searchParams.get("category");
    const search = searchParams.get("search");

    let query = ctx.supabase
      .from("assets")
      .select(`
        *,
        users!assigned_to (id, full_name)
      `)
      .eq("school_id", schoolId)
      .eq("is_deleted", false)
      .order("name");

    if (category && category !== "all") {
      query = query.eq("category", category);
    }
    if (search) {
      query = query.or(`name.ilike.%${search}%,asset_code.ilike.%${search}%,location.ilike.%${search}%`);
    }

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
    const parsed = createAssetSchema.safeParse(body);
    if (!parsed.success) {
      return errorResponse(parsed.error.issues[0].message, 400);
    }

    // If assigning to a user, that user must belong to this school.
    if (parsed.data.assigned_to) {
      const { data: assignee } = await ctx.supabase
        .from("users")
        .select("id")
        .eq("id", parsed.data.assigned_to)
        .eq("school_id", schoolId)
        .maybeSingle();
      if (!assignee) return errorResponse("Assigned user not found in this school", 400);
    }

    const { data, error } = await ctx.supabase
      .from("assets")
      .insert({
        school_id: schoolId,
        name: parsed.data.name,
        asset_code: parsed.data.asset_code ?? null,
        category: parsed.data.category ?? null,
        purchase_date: parsed.data.purchase_date ?? null,
        purchase_price: parsed.data.purchase_price ?? null,
        current_value: parsed.data.current_value ?? parsed.data.purchase_price ?? null,
        condition: parsed.data.condition,
        location: parsed.data.location ?? null,
        assigned_to: parsed.data.assigned_to ?? null,
        notes: parsed.data.notes ?? null })
      .select(`
        *,
        users!assigned_to (id, full_name)
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
    const parsed = updateAssetSchema.safeParse(body);
    if (!parsed.success) {
      return errorResponse(parsed.error.issues[0].message, 400);
    }

    const { id, ...updates } = parsed.data;

    // If reassigning to a user, that user must belong to this school.
    if (updates.assigned_to) {
      const { data: assignee } = await ctx.supabase
        .from("users")
        .select("id")
        .eq("id", updates.assigned_to)
        .eq("school_id", schoolId)
        .maybeSingle();
      if (!assignee) return errorResponse("Assigned user not found in this school", 400);
    }

    const { data, error } = await ctx.supabase
      .from("assets")
      .update(updates)
      .eq("id", id)
      .eq("school_id", schoolId)
      .eq("is_deleted", false)
      .select(`
        *,
        users!assigned_to (id, full_name)
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

    if (!id) return errorResponse("Asset ID is required", 400);

    const { error } = await ctx.supabase
      .from("assets")
      .update({ is_deleted: true })
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

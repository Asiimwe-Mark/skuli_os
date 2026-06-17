import { NextRequest } from "next/server";
import { createMaintenanceSchema } from "@/lib/validations/assets";
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
    const assetId = searchParams.get("asset_id");

    let query = ctx.supabase
      .from("asset_maintenance")
      .select(`
        *,
        assets (name, asset_code)
      `)
      .eq("school_id", schoolId)
      .order("maintenance_date", { ascending: false });

    if (assetId) {
      query = query.eq("asset_id", assetId);
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
    const parsed = createMaintenanceSchema.safeParse(body);
    if (!parsed.success) {
      return errorResponse(parsed.error.issues[0].message, 400);
    }

    // Verify the asset belongs to the caller's school. Without this check
    // any authenticated bursar could write a maintenance row for an asset
    // owned by another school simply by passing its UUID.
    const { data: asset, error: assetErr } = await ctx.supabase
      .from("assets")
      .select("id")
      .eq("id", parsed.data.asset_id)
      .eq("school_id", schoolId)
      .maybeSingle();

    if (assetErr) return dbError(assetErr, "Database error");
    if (!asset) return errorResponse("Asset not found in this school", 404);

    const { data, error } = await ctx.supabase
      .from("asset_maintenance")
      .insert({
        asset_id: parsed.data.asset_id,
        school_id: schoolId,
        maintenance_date: parsed.data.maintenance_date,
        description: parsed.data.description,
        cost: parsed.data.cost ?? null,
        next_service_date: parsed.data.next_service_date ?? null,
        performed_by: parsed.data.performed_by ?? null })
      .select(`
        *,
        assets (name, asset_code)
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

import { createMaintenanceSchema } from "@/lib/validations/assets";
import { route, AuthError, dbError } from "@/lib/http";

export const GET = route({
  roles: ["SCHOOL_ADMIN", "BURSAR", "SUPER_ADMIN"],
  handler: async (ctx, request) => {
    const schoolId = ctx.profile.school_id!;
    const { searchParams } = new URL(request.url);
    const assetId = searchParams.get("asset_id");

    let query = ctx.supabase
      .from("asset_maintenance")
      .select(
        `
        *,
        assets (name, asset_code)
      `,
      )
      .eq("school_id", schoolId)
      .order("maintenance_date", { ascending: false });

    if (assetId) {
      query = query.eq("asset_id", assetId);
    }

    const { data, error } = await query;

    if (error) return dbError(error, "Database error");

    return data || [];
  },
});

export const POST = route({
  roles: ["SCHOOL_ADMIN", "BURSAR", "SUPER_ADMIN"],
  schema: createMaintenanceSchema,
  handler: async (ctx, body) => {
    const schoolId = ctx.profile.school_id!;

    const { data: asset, error: assetErr } = await ctx.supabase
      .from("assets")
      .select("id")
      .eq("id", body.asset_id)
      .eq("school_id", schoolId)
      .maybeSingle();

    if (assetErr) return dbError(assetErr, "Database error");
    if (!asset)
      throw new AuthError("Asset not found in this school", 404);

    const { data, error } = await ctx.supabase
      .from("asset_maintenance")
      .insert({
        asset_id: body.asset_id,
        school_id: schoolId,
        maintenance_date: body.maintenance_date,
        description: body.description,
        cost: body.cost ?? null,
        next_service_date: body.next_service_date ?? null,
        performed_by: body.performed_by ?? null,
      })
      .select(
        `
        *,
        assets (name, asset_code)
      `,
      )
      .single();

    if (error) return dbError(error, "Database error");

    return data;
  },
});
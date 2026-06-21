import { createAssetSchema, updateAssetSchema } from "@/lib/validations/assets";
import { route, AuthError, dbError } from "@/lib/http";

export const GET = route({
  roles: ["SCHOOL_ADMIN", "BURSAR", "SUPER_ADMIN"],
  handler: async (ctx, request) => {
    const schoolId = ctx.profile.school_id!;
    const { searchParams } = new URL(request.url);
    const category = searchParams.get("category");
    const search = searchParams.get("search");

    let query = ctx.supabase
      .from("assets")
      .select(
        `
        *,
        users!assigned_to (id, full_name)
      `,
      )
      .eq("school_id", schoolId)
      .eq("is_deleted", false)
      .order("name");

    if (category && category !== "all") {
      query = query.eq("category", category);
    }
    if (search) {
      query = query.or(
        `name.ilike.%${search}%,asset_code.ilike.%${search}%,location.ilike.%${search}%`,
      );
    }

    const { data, error } = await query;

    if (error) return dbError(error, "Database error");

    return data || [];
  },
});

export const POST = route({
  roles: ["SCHOOL_ADMIN", "BURSAR", "SUPER_ADMIN"],
  schema: createAssetSchema,
  handler: async (ctx, body) => {
    const schoolId = ctx.profile.school_id!;

    if (body.assigned_to) {
      const { data: assignee } = await ctx.supabase
        .from("users")
        .select("id")
        .eq("id", body.assigned_to)
        .eq("school_id", schoolId)
        .maybeSingle();
      if (!assignee)
        throw new AuthError("Assigned user not found in this school", 400);
    }

    const { data, error } = await ctx.supabase
      .from("assets")
      .insert({
        school_id: schoolId,
        name: body.name,
        asset_code: body.asset_code ?? null,
        category: body.category ?? null,
        purchase_date: body.purchase_date ?? null,
        purchase_price: body.purchase_price ?? null,
        current_value: body.current_value ?? body.purchase_price ?? null,
        condition: body.condition,
        location: body.location ?? null,
        assigned_to: body.assigned_to ?? null,
        notes: body.notes ?? null,
      })
      .select(
        `
        *,
        users!assigned_to (id, full_name)
      `,
      )
      .single();

    if (error) return dbError(error, "Database error");

    return data;
  },
});

export const PATCH = route({
  roles: ["SCHOOL_ADMIN", "BURSAR", "SUPER_ADMIN"],
  schema: updateAssetSchema,
  handler: async (ctx, body) => {
    const schoolId = ctx.profile.school_id!;
    const { id, ...updates } = body;

    if (updates.assigned_to) {
      const { data: assignee } = await ctx.supabase
        .from("users")
        .select("id")
        .eq("id", updates.assigned_to)
        .eq("school_id", schoolId)
        .maybeSingle();
      if (!assignee)
        throw new AuthError("Assigned user not found in this school", 400);
    }

    const { data, error } = await ctx.supabase
      .from("assets")
      .update(updates)
      .eq("id", id)
      .eq("school_id", schoolId)
      .eq("is_deleted", false)
      .select(
        `
        *,
        users!assigned_to (id, full_name)
      `,
      )
      .single();

    if (error) return dbError(error, "Database error");

    return data;
  },
});

export const DELETE = route({
  roles: ["SCHOOL_ADMIN", "BURSAR", "SUPER_ADMIN"],
  handler: async (ctx, request) => {
    const schoolId = ctx.profile.school_id!;
    const id = new URL(request.url).searchParams.get("id");

    if (!id) throw new AuthError("Asset ID is required", 400);

    const { error } = await ctx.supabase
      .from("assets")
      .update({ is_deleted: true })
      .eq("id", id)
      .eq("school_id", schoolId);

    if (error) return dbError(error, "Database error");

    return { deleted: true };
  },
});
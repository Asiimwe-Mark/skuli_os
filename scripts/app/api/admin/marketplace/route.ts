import { NextRequest } from "next/server";
import {
  getSupabaseAndUser,
  requireRole,
  successResponse,
  errorResponse,
  getErrorStatus,
} from "@/lib/api-helpers";
import {
  createMarketplaceTemplateSchema,
  updateMarketplaceTemplateSchema,
} from "@/lib/validations/marketplace";

export async function GET() {
  try {
    const ctx = await getSupabaseAndUser();
    requireRole(ctx, ["SUPER_ADMIN"]);
    const { data, error } = await ctx.supabase
      .from("marketplace_templates")
      .select("id, category, name, description, body, variables, tags, use_count, is_featured, is_deleted, created_at")
      .eq("is_deleted", false)
      .order("created_at", { ascending: false });
    if (error) return errorResponse("Failed to load", 500);
    return successResponse({ templates: data ?? [] });
  } catch (e) {
    return errorResponse(e instanceof Error ? e.message : "Error", getErrorStatus(e));
  }
}

export async function POST(request: NextRequest) {
  try {
    const ctx = await getSupabaseAndUser();
    requireRole(ctx, ["SUPER_ADMIN"]);
    const body = await request.json().catch(() => ({}));
    const parsed = createMarketplaceTemplateSchema.safeParse(body);
    if (!parsed.success) return errorResponse(parsed.error.issues[0].message, 400);

    const { data, error } = await ctx.supabase
      .from("marketplace_templates")
      .insert({
        category: parsed.data.category,
        name: parsed.data.name,
        description: parsed.data.description ?? null,
        body: parsed.data.body as import("@/types/database").Json,
        variables: parsed.data.variables ?? [],
        tags: parsed.data.tags ?? [],
        is_featured: parsed.data.is_featured ?? false,
        created_by: ctx.user.id,
      })
      .select("id")
      .single();
    if (error || !data) return errorResponse("Failed to create", 500);

    await ctx.supabase.from("audit_logs").insert({
      school_id: ctx.profile.school_id,
      user_id: ctx.user.id,
      action: "MARKETPLACE_TEMPLATE_CREATED",
      entity_type: "marketplace_template",
      entity_id: data.id,
      new_value: { name: parsed.data.name, category: parsed.data.category },
    });
    return successResponse({ id: data.id }, 201);
  } catch (e) {
    return errorResponse(e instanceof Error ? e.message : "Error", getErrorStatus(e));
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const ctx = await getSupabaseAndUser();
    requireRole(ctx, ["SUPER_ADMIN"]);
    const body = await request.json().catch(() => ({}));
    const parsed = updateMarketplaceTemplateSchema.safeParse(body);
    if (!parsed.success) return errorResponse(parsed.error.issues[0].message, 400);

    const { id, ...rest } = parsed.data;
    const { error } = await ctx.supabase.from("marketplace_templates").update(rest as never).eq("id", id);
    if (error) return errorResponse("Failed to update", 500);

    await ctx.supabase.from("audit_logs").insert({
      school_id: ctx.profile.school_id,
      user_id: ctx.user.id,
      action: "MARKETPLACE_TEMPLATE_UPDATED",
      entity_type: "marketplace_template",
      entity_id: id,
      new_value: rest as unknown as import("@/types/database").Json,
    });
    return successResponse({ updated: true });
  } catch (e) {
    return errorResponse(e instanceof Error ? e.message : "Error", getErrorStatus(e));
  }
}

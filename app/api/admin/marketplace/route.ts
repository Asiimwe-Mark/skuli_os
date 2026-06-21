import { route } from "@/lib/http";
import {
  createMarketplaceTemplateSchema,
  updateMarketplaceTemplateSchema,
} from "@/lib/validations/marketplace";

export const GET = route({
  roles: ["SUPER_ADMIN"],
  noSchoolRequired: true,
  handler: async (ctx) => {
    const { data, error } = await ctx.supabase
      .from("marketplace_templates")
      .select(
        "id, category, name, description, body, variables, tags, use_count, is_featured, is_deleted, created_at",
      )
      .eq("is_deleted", false)
      .order("created_at", { ascending: false });
    if (error) throw new Error("Failed to load");
    return { templates: data ?? [] };
  },
});

export const POST = route({
  roles: ["SUPER_ADMIN"],
  noSchoolRequired: true,
  schema: createMarketplaceTemplateSchema,
  handler: async (ctx, body) => {
    const { data, error } = await ctx.supabase
      .from("marketplace_templates")
      .insert({
        category: body.category,
        name: body.name,
        description: body.description ?? null,
        body: body.body as import("@/types/database").Json,
        variables: body.variables ?? [],
        tags: body.tags ?? [],
        is_featured: body.is_featured ?? false,
        created_by: ctx.user.id,
      })
      .select("id")
      .single();
    if (error || !data) throw new Error("Failed to create");

    await ctx.supabase.from("audit_logs").insert({
      school_id: ctx.profile.school_id,
      user_id: ctx.user.id,
      action: "MARKETPLACE_TEMPLATE_CREATED",
      entity_type: "marketplace_template",
      entity_id: data.id,
      new_value: { name: body.name, category: body.category },
    });
    return { id: data.id };
  },
});

export const PATCH = route({
  roles: ["SUPER_ADMIN"],
  noSchoolRequired: true,
  schema: updateMarketplaceTemplateSchema,
  handler: async (ctx, body) => {
    const { id, ...rest } = body;
    const { error } = await ctx.supabase
      .from("marketplace_templates")
      .update(rest as never)
      .eq("id", id);
    if (error) throw new Error("Failed to update");

    await ctx.supabase.from("audit_logs").insert({
      school_id: ctx.profile.school_id,
      user_id: ctx.user.id,
      action: "MARKETPLACE_TEMPLATE_UPDATED",
      entity_type: "marketplace_template",
      entity_id: id,
      new_value: rest as unknown as import("@/types/database").Json,
    });
    return { updated: true };
  },
});
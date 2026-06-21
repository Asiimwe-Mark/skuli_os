import { z } from "zod";
import { route } from "@/lib/http";

const updateSchema = z.object({
  code: z.string().min(2).max(3),
  is_active: z.boolean(),
});

export const GET = route({
  roles: ["SUPER_ADMIN"],
  noSchoolRequired: true,
  handler: async (ctx) => {
    const { data, error } = await ctx.supabase
      .from("country_configs")
      .select(
        "code, name, currency_code, currency_symbol, phone_prefix, term_structure, is_active",
      )
      .order("name", { ascending: true });

    if (error) throw new Error("Failed to load countries");
    return { countries: data ?? [] };
  },
});

export const PATCH = route({
  roles: ["SUPER_ADMIN"],
  noSchoolRequired: true,
  schema: updateSchema,
  handler: async (ctx, body) => {
    const { error } = await ctx.supabase
      .from("country_configs")
      .update({ is_active: body.is_active })
      .eq("code", body.code);

    if (error) throw new Error("Failed to update country");

    await ctx.supabase.from("audit_logs").insert({
      school_id: ctx.profile.school_id,
      user_id: ctx.user.id,
      action: "COUNTRY_CONFIG_UPDATED",
      entity_type: "country_config",
      entity_id: null,
      new_value: { code: body.code, is_active: body.is_active },
    });

    return { updated: true };
  },
});
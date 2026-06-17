import { NextRequest } from "next/server";
import { z } from "zod";
import {
  getSupabaseAndUser,
  requireRole,
  successResponse,
  errorResponse,
  getErrorStatus,
} from "@/lib/api-helpers";

export async function GET() {
  try {
    const ctx = await getSupabaseAndUser();
    requireRole(ctx, ["SUPER_ADMIN"]);

    const { data, error } = await ctx.supabase
      .from("country_configs")
      .select("code, name, currency_code, currency_symbol, phone_prefix, term_structure, is_active")
      .order("name", { ascending: true });

    if (error) return errorResponse("Failed to load countries", 500);
    return successResponse({ countries: data ?? [] });
  } catch (e) {
    return errorResponse(e instanceof Error ? e.message : "Error", getErrorStatus(e));
  }
}

const updateSchema = z.object({
  code: z.string().min(2).max(3),
  is_active: z.boolean(),
});

export async function PATCH(request: NextRequest) {
  try {
    const ctx = await getSupabaseAndUser();
    requireRole(ctx, ["SUPER_ADMIN"]);

    const body = await request.json().catch(() => ({}));
    const parsed = updateSchema.safeParse(body);
    if (!parsed.success) return errorResponse(parsed.error.issues[0].message, 400);

    const { error } = await ctx.supabase
      .from("country_configs")
      .update({ is_active: parsed.data.is_active })
      .eq("code", parsed.data.code);

    if (error) return errorResponse("Failed to update country", 500);

    await ctx.supabase.from("audit_logs").insert({
      school_id: ctx.profile.school_id,
      user_id: ctx.user.id,
      action: "COUNTRY_CONFIG_UPDATED",
      entity_type: "country_config",
      entity_id: null,
      new_value: { code: parsed.data.code, is_active: parsed.data.is_active },
    });

    return successResponse({ updated: true });
  } catch (e) {
    return errorResponse(e instanceof Error ? e.message : "Error", getErrorStatus(e));
  }
}

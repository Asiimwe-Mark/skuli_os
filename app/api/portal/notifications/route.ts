import { z } from "zod";
import { route, dbError } from "@/lib/http";

export const GET = route({
  roles: ["PARENT"],
  handler: async (ctx) => {
    const { data, error } = await ctx.supabase
      .from("in_app_notifications")
      .select("*")
      .eq("recipient_user_id", ctx.user.id)
      .order("is_read", { ascending: true })
      .order("created_at", { ascending: false })
      .limit(50);

    if (error) return dbError(error, "Database error");

    return data ?? [];
  },
});

const patchSchema = z.object({
  ids: z.array(z.string().uuid()).min(1),
});

export const PATCH = route({
  roles: ["PARENT"],
  schema: patchSchema,
  handler: async (ctx, body) => {
    const { error } = await ctx.supabase
      .from("in_app_notifications")
      .update({ is_read: true })
      .in("id", body.ids)
      .eq("recipient_user_id", ctx.user.id);

    if (error) return dbError(error, "Database error");

    return { updated: body.ids.length };
  },
});
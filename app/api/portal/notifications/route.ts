import { NextRequest } from "next/server";
import { z } from "zod";
import {
  getSupabaseAndUser,
  requireRole,
  successResponse,
  errorResponse,
  dbError,
  getErrorStatus,
} from "@/lib/api-helpers";

export async function GET() {
  try {
    const ctx = await getSupabaseAndUser();
    requireRole(ctx, ["PARENT"]);

    const { data, error } = await ctx.supabase
      .from("in_app_notifications")
      .select("*")
      .eq("recipient_user_id", ctx.user.id)
      .order("is_read", { ascending: true })
      .order("created_at", { ascending: false })
      .limit(50);

    if (error) return dbError(error, "Database error");

    return successResponse(data ?? []);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Internal server error";
    const status = getErrorStatus(err);
    return errorResponse(message, status);
  }
}

const patchSchema = z.object({
  ids: z.array(z.string().uuid()).min(1),
});

export async function PATCH(request: NextRequest) {
  try {
    const ctx = await getSupabaseAndUser();
    requireRole(ctx, ["PARENT"]);

    const body = await request.json();
    const parsed = patchSchema.safeParse(body);
    if (!parsed.success) {
      return errorResponse(parsed.error.issues[0].message, 400);
    }

    const { error } = await ctx.supabase
      .from("in_app_notifications")
      .update({ is_read: true })
      .in("id", parsed.data.ids)
      .eq("recipient_user_id", ctx.user.id);

    if (error) return dbError(error, "Database error");

    return successResponse({ updated: parsed.data.ids.length });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Internal server error";
    const status = getErrorStatus(err);
    return errorResponse(message, status);
  }
}

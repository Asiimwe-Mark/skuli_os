import { NextRequest } from "next/server";
import {
  getSupabaseAndUser,
  requireRole,
  successResponse,
  errorResponse,
} from "@/lib/api-helpers";
import { sendPushToUser } from "@/lib/push";

export async function POST(request: NextRequest) {
  try {
    const ctx = await getSupabaseAndUser();
    requireRole(ctx, ["SUPER_ADMIN"]);

    // Fetch pending queue items (limit 100 per batch)
    const { data: items, error: fetchError } = await ctx.supabase
      .from("push_queue")
      .select("id, user_id, title, body, url")
      .eq("status", "pending")
      .order("created_at", { ascending: true })
      .limit(100);

    if (fetchError) return errorResponse(fetchError.message);
    if (!items || items.length === 0)
      return successResponse({ processed: 0, sent: 0 });

    let totalSent = 0;

    for (const item of items) {
      try {
        const { sent } = await sendPushToUser(ctx.supabase, item.user_id, {
          title: item.title,
          body: item.body,
          url: item.url || undefined,
        });

        await ctx.supabase
          .from("push_queue")
          .update({ status: "sent", sent_at: new Date().toISOString() })
          .eq("id", item.id);

        totalSent += sent;
      } catch (err: unknown) {
        const errorMsg = err instanceof Error ? err.message : "Unknown error";
        await ctx.supabase
          .from("push_queue")
          .update({ status: "failed", error: errorMsg })
          .eq("id", item.id);
      }
    }

    return successResponse({ processed: items.length, sent: totalSent });
  } catch (err: unknown) {
    const message =
      err instanceof Error ? err.message : "Internal server error";
    const status =
      err instanceof Error && "status" in err
        ? (err as { status: number }).status
        : 500;
    return errorResponse(message, status);
  }
}

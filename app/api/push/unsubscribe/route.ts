import { NextRequest } from "next/server";
import {
  getSupabaseAndUser,
  successResponse,
  errorResponse,
  AuthError,
} from "@/lib/api-helpers";

export async function POST(req: NextRequest) {
  try {
    const ctx = await getSupabaseAndUser();
    const body = await req.json();
    const { endpoint } = body;

    if (!endpoint) {
      return errorResponse("endpoint required", 400);
    }

    await ctx.supabase
      .from("push_subscriptions")
      .update({ is_deleted: true })
      .eq("user_id", ctx.user.id)
      .eq("endpoint", endpoint);

    return successResponse({ unsubscribed: true });
  } catch (e) {
    if (e instanceof AuthError) return errorResponse(e.message, e.status);
    console.error("POST /api/push/unsubscribe error:", e);
    return errorResponse("Internal server error", 500);
  }
}

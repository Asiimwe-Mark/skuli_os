import { NextRequest } from "next/server";
import {
  getSupabaseAndUser,
  requireSchool,
  requireRole,
  successResponse,
  errorResponse,
  getErrorStatus,
} from "@/lib/api-helpers";
import { sendPushToUser } from "@/lib/push";

export async function POST(request: NextRequest) {
  try {
    const ctx = await getSupabaseAndUser();
    const schoolId = requireSchool(ctx);
    requireRole(ctx, ["SCHOOL_ADMIN", "BURSAR", "SUPER_ADMIN"]);
    const body = await request.json();
    const { userId, title, body: pushBody, url } = body;

    if (!userId || !title || !pushBody) {
      return errorResponse("userId, title, and body are required", 400);
    }

    // Verify target user belongs to the same school
    const { data: targetUser } = await ctx.supabase
      .from("users")
      .select("id")
      .eq("id", userId)
      .eq("school_id", schoolId)
      .single();

    if (!targetUser) {
      return errorResponse("User not found in this school", 404);
    }

    const { sent } = await sendPushToUser(ctx.supabase, userId, {
      title,
      body: pushBody,
      url,
    });

    return successResponse({ sent });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Internal server error";
    const status = getErrorStatus(err);
    return errorResponse(message, status);
  }
}

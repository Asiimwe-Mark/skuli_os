import { NextRequest } from "next/server";
import {
  getSupabaseAndUser,
  requireSchool,
  requireRole,
  successResponse,
  errorResponse,
} from "@/lib/api-helpers";
import { sendPushToUser } from "@/lib/push";

export async function POST(request: NextRequest) {
  try {
    const ctx = await getSupabaseAndUser();
    requireSchool(ctx);
    requireRole(ctx, ["SCHOOL_ADMIN", "BURSAR", "SUPER_ADMIN"]);

    const body = await request.json();
    const { userId, title, body: pushBody, url } = body;

    if (!userId || !title || !pushBody) {
      return errorResponse("userId, title, and body are required", 400);
    }

    const { sent } = await sendPushToUser(ctx.supabase, userId, {
      title,
      body: pushBody,
      url,
    });

    return successResponse({ sent });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Internal server error";
    const status =
      err instanceof Error && "status" in err ? (err as any).status : 500;
    return errorResponse(message, status);
  }
}

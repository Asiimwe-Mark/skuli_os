import { NextRequest } from "next/server";
import {
  getSupabaseAndUser,
  requireSchool,
  requireRole,
  successResponse,
  errorResponse,
  dbError,
  AuthError,
} from "@/lib/api-helpers";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const ctx = await getSupabaseAndUser();
    const schoolId = requireSchool(ctx);
    requireRole(ctx, ["SCHOOL_ADMIN", "TEACHER", "BURSAR"]);

    const { id } = await params;
    const body = await req.json();
    const { is_deleted } = body;

    if (typeof is_deleted !== "boolean") {
      return errorResponse("is_deleted boolean required", 400);
    }

    if (is_deleted) {
      await ctx.supabase
        .from("meeting_bookings")
        .update({ status: "cancelled" })
        .eq("slot_id", id)
        .eq("status", "confirmed");
    }

    const { data, error } = await ctx.supabase
      .from("meeting_slots")
      .update({ is_deleted })
      .eq("id", id)
      .eq("school_id", schoolId)
      .select()
      .single();

    if (error) return dbError(error, "Failed to update slot");
    return successResponse(data);
  } catch (e) {
    if (e instanceof AuthError) return errorResponse(e.message, e.status);
    console.error("PATCH /api/meetings/slots/[id] error:", e);
    return errorResponse("Internal server error", 500);
  }
}

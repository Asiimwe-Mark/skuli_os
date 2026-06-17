// app/api/communication/threads/[id]/route.ts
import { NextRequest } from "next/server";
import {
  getSupabaseAndUser,
  requireSchool,
  requireRole,
  successResponse,
  errorResponse,
  dbError,
} from "@/lib/api-helpers";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const ctx = await getSupabaseAndUser();
    const schoolId = requireSchool(ctx);
    requireRole(ctx, ["SCHOOL_ADMIN", "BURSAR", "SUPER_ADMIN"]);

    const { id: threadId } = await params;
    const body = await req.json();
    const { is_read } = body;

    if (typeof is_read !== "boolean") {
      return errorResponse("is_read boolean required", 400);
    }

    const { data, error } = await ctx.supabase
      .from("message_threads")
      .update({ is_read })
      .eq("id", threadId)
      .eq("school_id", schoolId)
      .select()
      .single();

    if (error) return dbError(error, "Database error");
    return successResponse(data);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Internal server error";
    const status = err instanceof Error && "status" in err ? (err as { status: number }).status : 500;
    return errorResponse(message, status);
  }
}

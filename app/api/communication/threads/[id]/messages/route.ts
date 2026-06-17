// app/api/communication/threads/[id]/messages/route.ts
import { NextRequest } from "next/server";
import {
  getSupabaseAndUser,
  requireSchool,
  requireRole,
  successResponse,
  errorResponse,
  dbError,
} from "@/lib/api-helpers";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const ctx = await getSupabaseAndUser();
    const schoolId = requireSchool(ctx);
    requireRole(ctx, ["SCHOOL_ADMIN", "BURSAR", "SUPER_ADMIN"]);

    const { id: threadId } = await params;
    const supabase = ctx.supabase;

    const { data: thread } = await supabase
      .from("message_threads")
      .select("id, school_id, parent_phone, student_id, student:students(full_name, parent_name)")
      .eq("id", threadId)
      .eq("school_id", schoolId)
      .single();

    if (!thread) return errorResponse("Thread not found", 404);

    const { data: messages, error } = await supabase
      .from("thread_messages")
      .select("*")
      .eq("thread_id", threadId)
      .eq("is_deleted", false)
      .order("sent_at", { ascending: true });

    if (error) return dbError(error, "Database error");

    return successResponse({ thread, messages: messages || [] });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Internal server error";
    const status = err instanceof Error && "status" in err ? (err as { status: number }).status : 500;
    return errorResponse(message, status);
  }
}

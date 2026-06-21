// app/api/communication/threads/[id]/messages/route.ts
import { route, AuthError, dbError } from "@/lib/http";

export const GET = route({
  roles: ["SCHOOL_ADMIN", "BURSAR", "SUPER_ADMIN"],
  handler: async (ctx, _request, params) => {
    const schoolId = ctx.profile.school_id!;
    const { id: threadId } = (params ?? {}) as { id: string };
    const supabase = ctx.supabase;

    const { data: thread } = await supabase
      .from("message_threads")
      .select(
        "id, school_id, parent_phone, student_id, student:students(full_name, parent_name)",
      )
      .eq("id", threadId)
      .eq("school_id", schoolId)
      .single();

    if (!thread) throw new AuthError("Thread not found", 404);

    const { data: messages, error } = await supabase
      .from("thread_messages")
      .select("*")
      .eq("thread_id", threadId)
      .eq("is_deleted", false)
      .order("sent_at", { ascending: true });

    if (error) return dbError(error, "Database error");

    return { thread, messages: messages || [] };
  },
});
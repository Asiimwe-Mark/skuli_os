// app/api/communication/threads/[id]/messages/route.ts
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id: threadId } = await params;

  const { data: userProfile } = await supabase
    .from("users")
    .select("school_id")
    .eq("id", user.id)
    .single();

  if (!userProfile?.school_id) {
    return NextResponse.json({ error: "No school" }, { status: 400 });
  }

  const { data: thread } = await supabase
    .from("message_threads")
    .select("id, school_id, parent_phone, student_id, student:students(full_name, parent_name)")
    .eq("id", threadId)
    .eq("school_id", userProfile.school_id)
    .single();

  if (!thread) return NextResponse.json({ error: "Thread not found" }, { status: 404 });

  const { data: messages, error } = await supabase
    .from("thread_messages")
    .select("*")
    .eq("thread_id", threadId)
    .eq("is_deleted", false)
    .order("sent_at", { ascending: true });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ thread, messages: messages || [] });
}

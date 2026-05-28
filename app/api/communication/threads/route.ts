// app/api/communication/threads/route.ts
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: userProfile } = await supabase
    .from("users")
    .select("school_id")
    .eq("id", user.id)
    .single();

  if (!userProfile?.school_id) {
    return NextResponse.json({ error: "No school" }, { status: 400 });
  }

  const { searchParams } = new URL(req.url);
  const search = searchParams.get("search") || "";

  let query = supabase
    .from("message_threads")
    .select(`
      *,
      student:students(full_name, admission_number)
    `)
    .eq("school_id", userProfile.school_id)
    .eq("is_deleted", false)
    .order("last_message_at", { ascending: false });

  if (search) {
    query = query.or(`parent_phone.ilike.%${search}%,student.full_name.ilike.%${search}%`);
  }

  const { data: threads, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const threadIds = (threads || []).map((t) => t.id);
  let lastMessages: Record<string, { body: string; direction: string }> = {};

  if (threadIds.length > 0) {
    const { data: msgs } = await supabase
      .from("thread_messages")
      .select("thread_id, body, direction, sent_at")
      .in("thread_id", threadIds)
      .eq("is_deleted", false)
      .order("sent_at", { ascending: false });

    if (msgs) {
      for (const msg of msgs) {
        if (!lastMessages[msg.thread_id]) {
          lastMessages[msg.thread_id] = { body: msg.body, direction: msg.direction };
        }
      }
    }
  }

  const result = (threads || []).map((t) => ({
    ...t,
    last_message: lastMessages[t.id] || null,
  }));

  return NextResponse.json(result);
}

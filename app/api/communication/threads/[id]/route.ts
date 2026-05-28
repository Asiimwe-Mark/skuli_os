// app/api/communication/threads/[id]/route.ts
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id: threadId } = await params;
  const body = await req.json();
  const { is_read } = body;

  if (typeof is_read !== "boolean") {
    return NextResponse.json({ error: "is_read boolean required" }, { status: 400 });
  }

  const { data, error } = await supabase
    .from("message_threads")
    .update({ is_read })
    .eq("id", threadId)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

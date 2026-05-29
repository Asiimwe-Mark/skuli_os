import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: profile } = await supabase
    .from("users")
    .select("school_id")
    .eq("id", user.id)
    .single();

  if (!profile?.school_id) {
    return NextResponse.json({ error: "No school" }, { status: 400 });
  }

  const body = await req.json();
  const { endpoint, keys } = body;

  if (!endpoint || !keys?.p256dh || !keys?.auth) {
    return NextResponse.json(
      { error: "endpoint, keys.p256dh, and keys.auth required" },
      { status: 400 }
    );
  }

  // Upsert — reactivate if same user+endpoint was soft-deleted
  const { data: existing } = await supabase
    .from("push_subscriptions")
    .select("id, is_deleted")
    .eq("user_id", user.id)
    .eq("endpoint", endpoint)
    .single();

  if (existing) {
    if (existing.is_deleted) {
      await supabase
        .from("push_subscriptions")
        .update({ is_deleted: false, p256dh: keys.p256dh, auth: keys.auth })
        .eq("id", existing.id);
    }
    // Already active — nothing to do
  } else {
    await supabase.from("push_subscriptions").insert({
      school_id: profile.school_id,
      user_id: user.id,
      endpoint,
      p256dh: keys.p256dh,
      auth: keys.auth,
    });
  }

  return NextResponse.json({ success: true });
}

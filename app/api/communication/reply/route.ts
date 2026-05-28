// app/api/communication/reply/route.ts
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: userProfile } = await supabase
    .from("users")
    .select("school_id, full_name")
    .eq("id", user.id)
    .single();

  if (!userProfile?.school_id) {
    return NextResponse.json({ error: "No school" }, { status: 400 });
  }

  const body = await req.json();
  const { thread_id, message_body } = body;

  if (!thread_id || !message_body) {
    return NextResponse.json({ error: "thread_id and message_body required" }, { status: 400 });
  }

  // Get thread
  const { data: thread } = await supabase
    .from("message_threads")
    .select("id, school_id, parent_phone")
    .eq("id", thread_id)
    .eq("school_id", userProfile.school_id)
    .single();

  if (!thread) return NextResponse.json({ error: "Thread not found" }, { status: 404 });

  // Get school AT credentials
  const { data: school } = await supabase
    .from("schools")
    .select("name, africas_talking_username, africas_talking_api_key, africas_talking_username_enc, africas_talking_api_key_enc")
    .eq("id", userProfile.school_id)
    .single();

  if (!school) return NextResponse.json({ error: "School not found" }, { status: 404 });

  let atUsername = school.africas_talking_username || "";
  let atApiKey = school.africas_talking_api_key || "";

  // Try encrypted credentials
  if (school.africas_talking_api_key_enc && process.env.SUPABASE_VAULT_SECRET_KEY) {
    try {
      const { data: decKey } = await supabase.rpc("decrypt_secret", {
        encrypted: school.africas_talking_api_key_enc,
        key: process.env.SUPABASE_VAULT_SECRET_KEY,
      });
      if (decKey) atApiKey = decKey;
      if (school.africas_talking_username_enc) {
        const { data: decUser } = await supabase.rpc("decrypt_secret", {
          encrypted: school.africas_talking_username_enc,
          key: process.env.SUPABASE_VAULT_SECRET_KEY,
        });
        if (decUser) atUsername = decUser;
      }
    } catch {
      // Fall back to plaintext
    }
  }

  // Send SMS via Africa's Talking
  let atMessageId: string | null = null;
  let smsStatus = "sent";

  if (atApiKey && atUsername) {
    try {
      const response = await fetch("https://api.africastalking.com/version1/messaging", {
        method: "POST",
        headers: {
          apiKey: atApiKey,
          "Content-Type": "application/x-www-form-urlencoded",
          Accept: "application/json",
        },
        body: new URLSearchParams({
          username: atUsername,
          to: thread.parent_phone,
          message: message_body,
          from: process.env.AFRICASTALKING_SENDER_ID || "SKULI",
        }),
      });

      const data = await response.json();
      const recipient = data.SMSMessageData?.Recipients?.[0];

      if (recipient) {
        atMessageId = recipient.messageId;
        smsStatus = recipient.statusCode === 101 ? "sent" : "failed";
      }
    } catch {
      smsStatus = "failed";
    }
  }

  // Insert thread message
  const { data: threadMsg, error: msgError } = await supabase
    .from("thread_messages")
    .insert({
      thread_id: thread.id,
      school_id: userProfile.school_id,
      direction: "outbound",
      body: message_body,
      sender_name: userProfile.full_name,
      at_message_id: atMessageId,
      status: smsStatus,
    })
    .select()
    .single();

  if (msgError) return NextResponse.json({ error: msgError.message }, { status: 500 });

  // Update thread
  await supabase
    .from("message_threads")
    .update({ last_message_at: new Date().toISOString(), is_read: true })
    .eq("id", thread.id);

  // Log in sms_logs
  const smsCostPerUnit = 25;
  const smsCount = Math.ceil(message_body.length / 160);
  await supabase.from("sms_logs").insert({
    school_id: userProfile.school_id,
    recipient_phone: thread.parent_phone,
    message_body,
    message_type: "reply",
    status: smsStatus,
    africa_talking_message_id: atMessageId,
    cost: smsCount * smsCostPerUnit,
    related_entity_type: "thread_message",
    related_entity_id: threadMsg.id,
  });

  return NextResponse.json({ success: true, message_id: threadMsg.id });
}

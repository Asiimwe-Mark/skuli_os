// app/api/communication/reply/route.ts
import { NextRequest } from "next/server";
import type { Database } from "@/types/database";
import {
  getSupabaseAndUser,
  requireSchool,
  requireRole,
  successResponse,
  errorResponse,
  dbError,
} from "@/lib/api-helpers";
import { getSchoolCredentials, sendSms } from "@/lib/africas-talking/client";

export async function POST(req: NextRequest) {
  try {
    const ctx = await getSupabaseAndUser();
    const schoolId = requireSchool(ctx);
    requireRole(ctx, ["SCHOOL_ADMIN", "BURSAR", "SUPER_ADMIN"]);

    const supabase = ctx.supabase;

  const body = await req.json();
  const { thread_id, message_body } = body;

  if (!thread_id || !message_body) {
    return errorResponse("thread_id and message_body required", 400);
  }

  // Get thread
  const { data: thread } = await supabase
    .from("message_threads")
    .select("id, school_id, parent_phone")
    .eq("id", thread_id)
    .eq("school_id", schoolId)
    .single();

  if (!thread) return errorResponse("Thread not found", 404);

  // Get school AT credentials (encrypted)
  const credentials = await getSchoolCredentials(supabase, schoolId);

  // Send SMS via Africa's Talking
  let atMessageId: string | null = null;
  let smsStatus = "sent";

  if (credentials) {
    try {
      const atResponse = await sendSms(
        {
          to: thread.parent_phone,
          message: message_body,
          from: process.env.AFRICAS_TALKING_SENDER_ID || "SKULI",
        },
        credentials
      );

      const recipient = atResponse.SMSMessageData?.Recipients?.[0];

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
      school_id: schoolId,
      direction: "outbound",
      body: message_body,
      sender_name: ctx.profile.full_name,
      at_message_id: atMessageId,
      status: smsStatus as 'sent' | 'delivered' | 'failed',
    })
    .select()
    .single();

  if (msgError) return dbError(msgError, "Failed to record reply");

  // Update thread
  await supabase
    .from("message_threads")
    .update({ last_message_at: new Date().toISOString(), is_read: true })
    .eq("id", thread.id);

  // Log in sms_logs
  const smsCostPerUnit = 25;
  const smsCount = Math.ceil(message_body.length / 160);
  await supabase.from("sms_logs").insert({
    school_id: schoolId,
    recipient_phone: thread.parent_phone,
    message_body,
    message_type: "reply",
    status: smsStatus as 'sent' | 'delivered' | 'failed',
    africa_talking_message_id: atMessageId,
    cost: smsCount * smsCostPerUnit,
    sent_at: new Date().toISOString(),
  } as unknown as Database["public"]["Tables"]["sms_logs"]["Insert"]);

  return successResponse({ success: true, message_id: threadMsg.id });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Internal server error";
    const status = err instanceof Error && "status" in err ? (err as { status: number }).status : 500;
    return errorResponse(message, status);
  }
}

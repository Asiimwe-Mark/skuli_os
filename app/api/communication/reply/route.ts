// app/api/communication/reply/route.ts
import type { Database } from "@/types/database";
import { route, AuthError } from "@/lib/http";
import { getSchoolCredentials, sendSms } from "@/lib/africas-talking/client";

export const POST = route({
  roles: ["SCHOOL_ADMIN", "BURSAR", "SUPER_ADMIN"],
  handler: async (ctx, request) => {
    const schoolId = ctx.profile.school_id!;
    const supabase = ctx.supabase;

    const body = (await request.json().catch(() => ({}))) as {
      thread_id?: string;
      message_body?: string;
    };

    if (!body.thread_id || !body.message_body) {
      throw new AuthError("thread_id and message_body required", 400);
    }

    const { data: thread } = await supabase
      .from("message_threads")
      .select("id, school_id, parent_phone")
      .eq("id", body.thread_id)
      .eq("school_id", schoolId)
      .single();

    if (!thread) throw new AuthError("Thread not found", 404);

    const credentials = await getSchoolCredentials(supabase, schoolId);

    let atMessageId: string | null = null;
    let smsStatus: "sent" | "delivered" | "failed" = "sent";

    if (credentials) {
      try {
        const atResponse = await sendSms(
          {
            to: thread.parent_phone,
            message: body.message_body,
            from: process.env.AFRICAS_TALKING_SENDER_ID || "SKULI",
          },
          credentials,
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

    const { data: threadMsg, error: msgError } = await supabase
      .from("thread_messages")
      .insert({
        thread_id: thread.id,
        school_id: schoolId,
        direction: "outbound",
        body: body.message_body,
        sender_name: ctx.profile.full_name,
        at_message_id: atMessageId,
        status: smsStatus,
      })
      .select()
      .single();

    if (msgError) throw new AuthError("Failed to record reply", 500);

    await supabase
      .from("message_threads")
      .update({ last_message_at: new Date().toISOString(), is_read: true })
      .eq("id", thread.id);

    const smsCostPerUnit = 25;
    const smsCount = Math.ceil(body.message_body.length / 160);
    await supabase.from("sms_logs").insert({
      school_id: schoolId,
      recipient_phone: thread.parent_phone,
      message_body: body.message_body,
      message_type: "reply",
      status: smsStatus,
      africa_talking_message_id: atMessageId,
      cost: smsCount * smsCostPerUnit,
      sent_at: new Date().toISOString(),
    } as unknown as Database["public"]["Tables"]["sms_logs"]["Insert"]);

    return { success: true, message_id: threadMsg.id };
  },
});
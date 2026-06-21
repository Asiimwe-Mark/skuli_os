import type { Database } from "@/types/database";
import { publicRoute } from "@/lib/http";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendPushToUser } from "@/lib/push";
import { verifyWebhookSignature } from "@/lib/africas-talking/webhooks";

type SmsLogRow = Database["public"]["Tables"]["sms_logs"]["Row"];

function verifyAtHmac(body: string, signature: string, secret: string): boolean {
  return verifyWebhookSignature(body, signature, secret, "base64");
}

export const POST = publicRoute(async (request) => {
  const body = await request.text();
  const signature = request.headers.get("X-Africa-Talking-Signature") || "";

  const secret = process.env.AFRICAS_TALKING_WEBHOOK_SECRET || "";
  if (!secret) {
    return Response.json({ error: "Webhook not configured" }, { status: 500 });
  }

  if (!verifyAtHmac(body, signature, secret)) {
    return Response.json({ error: "Invalid signature" }, { status: 401 });
  }

  const data = JSON.parse(body);
  const supabase = createAdminClient();

  // Handle inbound SMS (parent reply)
  if (data.from && data.text && data.to) {
    const senderPhone = data.from;
    const messageText = data.text;

    const { data: students } = await supabase
      .from("students")
      .select("id, school_id, parent_name")
      .eq("parent_phone", senderPhone)
      .eq("is_deleted", false)
      .limit(1);

    if (students && students.length > 0) {
      const student = students[0];
      const schoolId = student.school_id;
      const studentId = student.id;

      let threadId: string;
      const { data: existingThread } = await supabase
        .from("message_threads")
        .select("id")
        .eq("school_id", schoolId)
        .eq("parent_phone", senderPhone)
        .maybeSingle();

      if (existingThread) {
        threadId = existingThread.id;
        await supabase
          .from("message_threads")
          .update({
            last_message_at: new Date().toISOString(),
            is_read: false,
            student_id: studentId,
          })
          .eq("id", threadId);
      } else {
        const { data: newThread } = await supabase
          .from("message_threads")
          .insert({
            school_id: schoolId,
            parent_phone: senderPhone,
            student_id: studentId,
            last_message_at: new Date().toISOString(),
            is_read: false,
          })
          .select("id")
          .single();
        threadId = newThread!.id;
      }

      await supabase.from("thread_messages").insert({
        thread_id: threadId,
        school_id: schoolId,
        direction: "inbound",
        body: messageText,
        sender_name: student.parent_name || null,
        at_message_id: data.id || null,
        status: "delivered",
      });

      const { data: admins } = await supabase
        .from("users")
        .select("id")
        .eq("school_id", schoolId)
        .in("role", ["SCHOOL_ADMIN", "BURSAR"])
        .eq("is_deleted", false);

      if (admins) {
        const preview =
          messageText.length > 50 ? messageText.slice(0, 50) + "..." : messageText;
        for (const admin of admins) {
          await supabase.from("in_app_notifications").insert({
            school_id: schoolId,
            recipient_user_id: admin.id,
            title: `New message from ${student.parent_name || senderPhone}`,
            body: preview,
            type: "info",
            is_read: false,
            related_entity_type: "message_thread",
            related_entity_id: threadId,
          });

          try {
            await sendPushToUser(supabase, admin.id, {
              title: `New message from ${student.parent_name || senderPhone}`,
              body: preview,
              url: "/dashboard/communication",
            });
          } catch {
            // Push failure should not block SMS processing
          }
        }
      }

      return Response.json({ status: "ok" });
    }

    return Response.json({ status: "ok", note: "no student match" });
  }

  // Africa's Talking delivers SMS status callbacks with messageId and status
  if (data.id) {
    const statusMap: Record<string, string> = {
      Success: "delivered",
      Sent: "sent",
      Queued: "pending",
      Failed: "failed",
      Rejected: "failed",
    };

    const newStatus = statusMap[data.status] || "failed";

    const { error } = await supabase
      .from("sms_logs")
      .update({
        status: newStatus as SmsLogRow["status"],
        africa_talking_message_id: data.id,
        sent_at: newStatus === "delivered" ? new Date().toISOString() : undefined,
      })
      .eq("africa_talking_message_id", data.id);

    if (error) {
      if (data.number) {
        await supabase
          .from("sms_logs")
          .update({
            status: newStatus as SmsLogRow["status"],
            africa_talking_message_id: data.id,
          })
          .eq("recipient_phone", data.number)
          .eq("status", "pending")
          .order("created_at", { ascending: false })
          .limit(1);
      }
    }
  }

  return Response.json({ status: "ok" });
});
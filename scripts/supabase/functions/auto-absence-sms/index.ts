// Supabase Edge Function: auto-absence-sms
// Daily cron at 9AM EAT — finds absent students, sends parent SMS via Africa's Talking
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { queuePushNotification, getParentUserId } from "../_shared/push-queue.ts";

serve(async () => {
  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    const vaultKey = Deno.env.get("SUPABASE_VAULT_SECRET_KEY") ?? "";
    const defaultAtUsername = Deno.env.get("AFRICAS_TALKING_USERNAME") ?? "";
    const defaultAtApiKey = Deno.env.get("AFRICAS_TALKING_API_KEY") ?? "";
    const atSenderId = Deno.env.get("AFRICAS_TALKING_SENDER_ID") ?? "SKULI";

    const today = new Date().toISOString().split("T")[0];

    // Get all schools
    const { data: schools } = await supabase
      .from("schools")
      .select("id, name, africas_talking_username_enc, africas_talking_api_key_enc")
      .eq("is_deleted", false);

    if (!schools) {
      return new Response(JSON.stringify({ message: "No schools found" }));
    }

    let totalSent = 0;

    for (const school of schools) {
      // Check notification preferences
      const { data: prefs } = await supabase
        .from("notification_preferences")
        .select("send_absence_sms")
        .eq("school_id", school.id)
        .eq("is_deleted", false)
        .single();

      if (prefs && !prefs.send_absence_sms) continue;

      // Find absent students today
      const { data: absentRecords } = await supabase
        .from("attendance_records")
        .select("student_id, students(full_name, parent_name, parent_phone)")
        .eq("school_id", school.id)
        .eq("date", today)
        .eq("status", "absent");

      if (!absentRecords || absentRecords.length === 0) continue;

      // Get school's AT credentials (decrypted)
      let atUsername = defaultAtUsername;
      let atApiKey = defaultAtApiKey;

      if (school.africas_talking_api_key_enc && vaultKey) {
        try {
          const { data: decKey } = await supabase.rpc("decrypt_secret", {
            encrypted: school.africas_talking_api_key_enc,
            key: vaultKey,
          });
          if (decKey) atApiKey = decKey;
          if (school.africas_talking_username_enc) {
            const { data: decUser } = await supabase.rpc("decrypt_secret", {
              encrypted: school.africas_talking_username_enc,
              key: vaultKey,
            });
            if (decUser) atUsername = decUser;
          }
        } catch {
          // Fall back to platform credentials
        }
      }

      for (const record of absentRecords) {
        const student = record.students as Record<string, unknown> | null;
        if (!student?.parent_phone) continue;

        const message = `Dear ${student.parent_name || "Parent"}, ${student.full_name} was absent from school today (${today}). Please contact ${school.name} if this is an error.`;

        // Send via Africa's Talking
        try {
          const response = await fetch(
            "https://api.africastalking.com/version1/messaging",
            {
              method: "POST",
              headers: {
                apiKey: atApiKey,
                "Content-Type": "application/x-www-form-urlencoded",
                Accept: "application/json",
              },
              body: new URLSearchParams({
                username: atUsername,
                to: String(student.parent_phone),
                message,
                from: atSenderId,
              }),
            }
          );

          const data = await response.json();
          const recipient = data.SMSMessageData?.Recipients?.[0];

          await supabase.from("sms_logs").insert({
            school_id: school.id,
            recipient_phone: student.parent_phone,
            message_body: message,
            message_type: "absence_alert",
            status: recipient?.statusCode === 101 ? "sent" : "failed",
            africa_talking_message_id: recipient?.messageId || null,
            cost: recipient?.statusCode === 101
              ? parseFloat(recipient.cost?.replace("UGX", "") || "0")
              : null,
            sent_at: new Date().toISOString(),
          });
        } catch {
          await supabase.from("sms_logs").insert({
            school_id: school.id,
            recipient_phone: student.parent_phone,
            message_body: message,
            message_type: "absence_alert",
            status: "failed",
            sent_at: new Date().toISOString(),
          });
        }

        // Push notification to parent
        try {
          const parentId = await getParentUserId(supabase, student.parent_phone);
          if (parentId) {
            await queuePushNotification(supabase, parentId, {
              title: "Absence Alert",
              body: `${student.full_name} was absent from school today (${today})`,
              url: "/portal",
            });
          }
        } catch {
          // Push failure should not block SMS processing
        }

        totalSent++;
        // Rate limit: 100ms between messages
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
    }

    return new Response(
      JSON.stringify({ message: `Processed ${totalSent} absence SMS` }),
      { headers: { "Content-Type": "application/json" } }
    );
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
});

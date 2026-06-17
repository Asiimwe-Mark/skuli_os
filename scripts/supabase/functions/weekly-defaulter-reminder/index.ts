// Supabase Edge Function: weekly-defaulter-reminder
// Weekly cron (configurable day) — sends fee balance reminders to parents
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

function formatUGX(amount: number): string {
  return `UGX ${amount.toLocaleString("en-UG")}`;
}

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

    // Get current day of week (1=Monday, 7=Sunday)
    const todayDow = new Date().getDay() === 0 ? 7 : new Date().getDay();

    const { data: schools } = await supabase
      .from("schools")
      .select("id, name, africas_talking_username_enc, africas_talking_api_key_enc")
      .eq("is_deleted", false);

    if (!schools) {
      return new Response(JSON.stringify({ message: "No schools found" }));
    }

    let totalSent = 0;

    for (const school of schools) {
      // Check notification preferences and day
      const { data: prefs } = await supabase
        .from("notification_preferences")
        .select("send_weekly_defaulter, defaulter_reminder_day")
        .eq("school_id", school.id)
        .eq("is_deleted", false)
        .single();

      if (prefs) {
        if (!prefs.send_weekly_defaulter) continue;
        if (prefs.defaulter_reminder_day !== todayDow) continue;
      }

      // Get current term
      const { data: term } = await supabase
        .from("terms")
        .select("id")
        .eq("school_id", school.id)
        .eq("is_current", true)
        .single();

      if (!term) continue;

      // Get defaulters
      const { data: defaulters } = await supabase
        .from("fee_accounts")
        .select("balance, students(full_name, parent_name, parent_phone)")
        .eq("school_id", school.id)
        .eq("term_id", term.id)
        .gt("balance", 0);

      if (!defaulters || defaulters.length === 0) continue;

      // Get school's AT credentials
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

      for (const defaulter of defaulters) {
        const student = defaulter.students as Record<string, unknown> | null;
        if (!student?.parent_phone) continue;

        const balanceFormatted = formatUGX(Number(defaulter.balance));
        const message = `Dear ${student.parent_name || "Parent"}, ${student.full_name}'s fee balance is ${balanceFormatted}. Please clear the outstanding amount. - ${school.name}`;

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
            message_type: "defaulter_reminder",
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
            message_type: "defaulter_reminder",
            status: "failed",
            sent_at: new Date().toISOString(),
          });
        }

        totalSent++;
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
    }

    return new Response(
      JSON.stringify({ message: `Processed ${totalSent} defaulter reminders` }),
      { headers: { "Content-Type": "application/json" } }
    );
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
});

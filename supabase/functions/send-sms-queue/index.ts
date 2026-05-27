// Supabase Edge Function: send-sms-queue
// Processes queued SMS via Africa's Talking in batches of 50
// Runs every 5 minutes via config.toml cron
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

serve(async (_req) => {
  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    const defaultAtUsername = Deno.env.get("AFRICAS_TALKING_USERNAME") ?? "";
    const defaultAtApiKey = Deno.env.get("AFRICAS_TALKING_API_KEY") ?? "";
    const atSenderId = Deno.env.get("AFRICAS_TALKING_SENDER_ID") ?? "SKULI";
    const vaultKey = Deno.env.get("SUPABASE_VAULT_SECRET_KEY") ?? "";

    // Get pending SMS (batch of 50)
    const { data: pendingSms, error } = await supabase
      .from("sms_logs")
      .select("id, school_id, recipient_phone, message_body")
      .eq("status", "pending")
      .order("created_at", { ascending: true })
      .limit(50);

    if (error) throw error;
    if (!pendingSms || pendingSms.length === 0) {
      return new Response(JSON.stringify({ message: "No pending SMS" }), {
        headers: { "Content-Type": "application/json" },
      });
    }

    // Group by school_id to use correct credentials
    const bySchool = new Map<string, typeof pendingSms>();
    for (const sms of pendingSms) {
      const arr = bySchool.get(sms.school_id) || [];
      arr.push(sms);
      bySchool.set(sms.school_id, arr);
    }

    // Cache decrypted credentials per school
    const credCache = new Map<string, { username: string; apiKey: string }>();

    const results: Array<{ id: string; status: string; error?: string }> = [];

    for (const [schoolId, smsList] of bySchool) {
      // Get credentials for this school
      if (!credCache.has(schoolId)) {
        let atUsername = defaultAtUsername;
        let atApiKey = defaultAtApiKey;

        if (vaultKey) {
          const { data: school } = await supabase
            .from("schools")
            .select("africas_talking_username_enc, africas_talking_api_key_enc")
            .eq("id", schoolId)
            .single();

          if (school?.africas_talking_api_key_enc) {
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
        }
        credCache.set(schoolId, { username: atUsername, apiKey: atApiKey });
      }

      const creds = credCache.get(schoolId)!;

      for (const sms of smsList) {
        try {
          const response = await fetch(
            "https://api.africastalking.com/version1/messaging",
            {
              method: "POST",
              headers: {
                apiKey: creds.apiKey,
                "Content-Type": "application/x-www-form-urlencoded",
                Accept: "application/json",
              },
              body: new URLSearchParams({
                username: creds.username,
                to: sms.recipient_phone,
                message: sms.message_body,
                from: atSenderId,
              }),
            }
          );

          const data = await response.json();
          const recipient = data.SMSMessageData?.Recipients?.[0];

          if (recipient?.statusCode === 101) {
            await supabase
              .from("sms_logs")
              .update({
                status: "sent",
                africa_talking_message_id: recipient.messageId,
                cost: parseFloat(recipient.cost?.replace("UGX", "") || "0"),
                sent_at: new Date().toISOString(),
              })
              .eq("id", sms.id);

            results.push({ id: sms.id, status: "sent" });
          } else {
            await supabase
              .from("sms_logs")
              .update({
                status: "failed",
                sent_at: new Date().toISOString(),
              })
              .eq("id", sms.id);

            results.push({
              id: sms.id,
              status: "failed",
              error: data.SMSMessageData?.message || "Unknown error",
            });
          }
        } catch (err) {
          await supabase
            .from("sms_logs")
            .update({ status: "failed" })
            .eq("id", sms.id);

          results.push({ id: sms.id, status: "error", error: String(err) });
        }

        // Rate limit: 100ms between messages
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
    }

    return new Response(
      JSON.stringify({ processed: results.length, results }),
      { headers: { "Content-Type": "application/json" } }
    );
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
});

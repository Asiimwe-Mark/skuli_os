// Supabase Edge Function: scheduled-sms-sender
// Processes scheduled announcements where scheduled_at <= now()
// Runs every 5 minutes via config.toml cron
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

    const now = new Date().toISOString();

    // Find pending scheduled announcements
    const { data: announcements } = await supabase
      .from("announcements")
      .select("id, school_id, title, body, target_audience, target_class_ids, scheduled_at")
      .lte("scheduled_at", now)
      .eq("scheduled_status", "pending")
      .eq("is_deleted", false)
      .limit(10);

    if (!announcements || announcements.length === 0) {
      return new Response(
        JSON.stringify({ message: "No scheduled announcements to process" }),
        { headers: { "Content-Type": "application/json" } }
      );
    }

    let totalProcessed = 0;

    for (const announcement of announcements) {
      // Mark as processing
      await supabase
        .from("announcements")
        .update({ scheduled_status: "processing" })
        .eq("id", announcement.id);

      try {
        // Get school credentials
        const { data: school } = await supabase
          .from("schools")
          .select("id, name, africas_talking_username_enc, africas_talking_api_key_enc")
          .eq("id", announcement.school_id)
          .single();

        let atUsername = defaultAtUsername;
        let atApiKey = defaultAtApiKey;

        if (school?.africas_talking_api_key_enc && vaultKey) {
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

        // Resolve target recipients
        const recipients = await resolveRecipients(
          supabase,
          announcement.school_id,
          announcement.target_audience,
          announcement.target_class_ids
        );

        // Personalize and send per recipient
        for (const recipient of recipients) {
          const personalizedBody = personalizeMessage(announcement.body, {
            parent_name: recipient.parent_name || "Parent",
            student_name: recipient.student_name || "Student",
            balance: recipient.balance || 0,
            school_name: school?.name || "School",
            term: recipient.term || "",
          });

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
                  to: recipient.phone,
                  message: personalizedBody,
                  from: atSenderId,
                }),
              }
            );

            const data = await response.json();
            const atRecipient = data.SMSMessageData?.Recipients?.[0];

            await supabase.from("sms_logs").insert({
              school_id: announcement.school_id,
              recipient_phone: recipient.phone,
              message_body: personalizedBody,
              message_type: "announcement",
              status: atRecipient?.statusCode === 101 ? "sent" : "failed",
              africa_talking_message_id: atRecipient?.messageId || null,
              cost: atRecipient?.statusCode === 101
                ? parseFloat(atRecipient.cost?.replace("UGX", "") || "0")
                : null,
              sent_at: new Date().toISOString(),
              related_entity_type: "announcement",
              related_entity_id: announcement.id,
            });
          } catch {
            await supabase.from("sms_logs").insert({
              school_id: announcement.school_id,
              recipient_phone: recipient.phone,
              message_body: personalizedBody,
              message_type: "announcement",
              status: "failed",
              sent_at: new Date().toISOString(),
              related_entity_type: "announcement",
              related_entity_id: announcement.id,
            });
          }

          await new Promise((resolve) => setTimeout(resolve, 100));
        }

        // Mark as sent
        await supabase
          .from("announcements")
          .update({
            scheduled_status: "sent",
            sent_at: new Date().toISOString(),
          })
          .eq("id", announcement.id);

        totalProcessed++;
      } catch {
        // Mark as failed
        await supabase
          .from("announcements")
          .update({ scheduled_status: "failed" })
          .eq("id", announcement.id);
      }
    }

    return new Response(
      JSON.stringify({ message: `Processed ${totalProcessed} scheduled announcements` }),
      { headers: { "Content-Type": "application/json" } }
    );
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
});

interface Recipient {
  phone: string;
  parent_name: string;
  student_name: string;
  balance: number;
  term: string;
}

async function resolveRecipients(
  supabase: ReturnType<typeof createClient>,
  schoolId: string,
  targetAudience: string,
  targetClassIds: string[] | null
): Promise<Recipient[]> {
  const recipients: Recipient[] = [];

  // Get current term
  const { data: term } = await supabase
    .from("terms")
    .select("id, name")
    .eq("school_id", schoolId)
    .eq("is_current", true)
    .single();

  const termName = term?.name || "";

  if (targetAudience === "all") {
    const { data: students } = await supabase
      .from("students")
      .select("full_name, parent_name, parent_phone")
      .eq("school_id", schoolId)
      .eq("is_deleted", false)
      .eq("status", "active");

    if (students) {
      for (const s of students) {
        if (s.parent_phone) {
          recipients.push({
            phone: s.parent_phone,
            parent_name: s.parent_name || "Parent",
            student_name: s.full_name,
            balance: 0,
            term: termName,
          });
        }
      }
    }
  } else if (targetAudience === "class" && targetClassIds?.length) {
    const { data: students } = await supabase
      .from("students")
      .select("full_name, parent_name, parent_phone")
      .eq("school_id", schoolId)
      .eq("is_deleted", false)
      .eq("status", "active")
      .in("current_class_id", targetClassIds);

    if (students) {
      for (const s of students) {
        if (s.parent_phone) {
          recipients.push({
            phone: s.parent_phone,
            parent_name: s.parent_name || "Parent",
            student_name: s.full_name,
            balance: 0,
            term: termName,
          });
        }
      }
    }
  } else if (targetAudience === "defaulters" && term) {
    const { data: accounts } = await supabase
      .from("fee_accounts")
      .select("balance, students(full_name, parent_name, parent_phone)")
      .eq("school_id", schoolId)
      .eq("term_id", term.id)
      .gt("balance", 0);

    if (accounts) {
      for (const a of accounts) {
        const s = a.students as Record<string, unknown> | null;
        if (s?.parent_phone) {
          recipients.push({
            phone: String(s.parent_phone),
            parent_name: String(s.parent_name || "Parent"),
            student_name: String(s.full_name || "Student"),
            balance: Number(a.balance) || 0,
            term: termName,
          });
        }
      }
    }
  }

  // Deduplicate by phone
  const unique = new Map<string, Recipient>();
  for (const r of recipients) {
    if (!unique.has(r.phone)) unique.set(r.phone, r);
  }
  return Array.from(unique.values());
}

function personalizeMessage(
  template: string,
  data: {
    parent_name: string;
    student_name: string;
    balance: number;
    school_name: string;
    term: string;
    deadline?: string;
  }
): string {
  return template
    .replace(/\{parent_name\}/gi, data.parent_name)
    .replace(/\{student_name\}/gi, data.student_name)
    .replace(/\{balance\}/gi, formatUGX(data.balance))
    .replace(/\{school_name\}/gi, data.school_name)
    .replace(/\{term\}/gi, data.term)
    .replace(/\{deadline\}/gi, data.deadline ?? "");
}

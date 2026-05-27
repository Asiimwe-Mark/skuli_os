import { NextRequest } from "next/server";
import type { Database } from "@/types/database";
import { sendSmsSchema } from "@/lib/validations/communication";
import {
  getSupabaseAndUser,
  requireSchool,
  requireRole,
  successResponse,
  errorResponse,
} from "@/lib/api-helpers";
import { formatUGX } from "@/lib/utils/currency";

type StudentRow = Database["public"]["Tables"]["students"]["Row"];
type SchoolRow = Database["public"]["Tables"]["schools"]["Row"];

interface Recipient {
  phone: string;
  parent_name: string;
  student_name: string;
  balance: number;
  term: string;
  user_id?: string;
}

function personalizeMessage(
  template: string,
  recipient: {
    parent_name: string;
    student_name: string;
    balance: number;
    school_name: string;
    term: string;
    deadline?: string;
  }
): string {
  return template
    .replace(/\{parent_name\}/gi, recipient.parent_name)
    .replace(/\{student_name\}/gi, recipient.student_name)
    .replace(/\{balance\}/gi, formatUGX(recipient.balance))
    .replace(/\{school_name\}/gi, recipient.school_name)
    .replace(/\{term\}/gi, recipient.term)
    .replace(/\{deadline\}/gi, recipient.deadline ?? "")
    .replace(/\{results_link\}/gi, `${process.env.NEXT_PUBLIC_APP_URL || ""}/portal/results`);
}

export async function POST(request: NextRequest) {
  try {
    const ctx = await getSupabaseAndUser();
    const schoolId = requireSchool(ctx);
    requireRole(ctx, ["SCHOOL_ADMIN", "BURSAR", "SUPER_ADMIN"]);

    const body = await request.json();
    const parsed = sendSmsSchema.safeParse(body);
    if (!parsed.success) {
      return errorResponse(parsed.error.issues[0].message, 400);
    }

    const supabase = ctx.supabase;

    // Get school info
    const { data: school } = await supabase
      .from("schools")
      .select("name, africas_talking_username, africas_talking_api_key, africas_talking_username_enc, africas_talking_api_key_enc")
      .eq("id", schoolId)
      .single() as { data: (SchoolRow & { africas_talking_username_enc: string | null; africas_talking_api_key_enc: string | null }) | null };

    // Get current term
    const { data: currentTerm } = await supabase
      .from("terms")
      .select("id, name")
      .eq("school_id", schoolId)
      .eq("is_current", true)
      .single();

    const termName = currentTerm?.name || "";

    // Resolve recipients with personalization data
    const recipients: Recipient[] = [];

    if (parsed.data.target_audience === "custom" && parsed.data.custom_phones) {
      for (const phone of parsed.data.custom_phones) {
        recipients.push({
          phone,
          parent_name: "Parent",
          student_name: "Student",
          balance: 0,
          term: termName,
        });
      }
    } else {
      let studentsQuery = supabase
        .from("students")
        .select("id, full_name, parent_name, parent_phone")
        .eq("school_id", schoolId)
        .eq("is_deleted", false)
        .eq("status", "active")
        .not("parent_phone", "is", null);

      if (parsed.data.target_audience === "class" && parsed.data.target_class_ids?.length) {
        studentsQuery = studentsQuery.in("current_class_id", parsed.data.target_class_ids);
      }

      if (parsed.data.target_audience === "defaulters") {
        const { data: defaulterAccounts } = await supabase
          .from("fee_accounts")
          .select("student_id, balance")
          .eq("school_id", schoolId)
          .eq("term_id", currentTerm?.id || "")
          .gt("balance", 0) as { data: { student_id: string; balance: number }[] | null };

        if (defaulterAccounts && defaulterAccounts.length > 0) {
          const studentIds = defaulterAccounts.map((a) => a.student_id);
          studentsQuery = studentsQuery.in("id", studentIds);
        } else {
          return successResponse({ sent: 0, totalCost: 0, recipients: 0, message: "No defaulters found" });
        }
      }

      const { data: students } = await studentsQuery as { data: { id: string; full_name: string; parent_name: string | null; parent_phone: string | null }[] | null };

      if (students) {
        // Get fee balances for defaulters
        const balances = new Map<string, number>();
        if (parsed.data.target_audience === "defaulters" && currentTerm) {
          const { data: accounts } = await supabase
            .from("fee_accounts")
            .select("student_id, balance")
            .eq("school_id", schoolId)
            .eq("term_id", currentTerm.id)
            .gt("balance", 0);
          if (accounts) {
            for (const a of accounts) {
              balances.set(a.student_id, Number(a.balance) || 0);
            }
          }
        }

        const seen = new Set<string>();
        for (const s of students) {
          if (s.parent_phone && !seen.has(s.parent_phone)) {
            seen.add(s.parent_phone);
            recipients.push({
              phone: s.parent_phone,
              parent_name: s.parent_name || "Parent",
              student_name: s.full_name,
              balance: balances.get(s.id) || 0,
              term: termName,
            });
          }
        }
      }
    }

    if (recipients.length === 0) {
      return errorResponse("No recipients found", 400);
    }

    // Check if scheduled for later
    if (parsed.data.scheduled_at) {
      const scheduledDate = new Date(parsed.data.scheduled_at);
      if (scheduledDate > new Date()) {
        // Store as scheduled announcement — will be picked up by Edge Function
        await supabase.from("announcements").insert({
          school_id: schoolId,
          title: parsed.data.title || "Scheduled SMS",
          body: parsed.data.message_body,
          target_audience: parsed.data.target_audience,
          target_class_ids: parsed.data.target_class_ids || [],
          sent_via: "sms",
          scheduled_at: scheduledDate.toISOString(),
          scheduled_status: "pending",
          sent_by: ctx.user.id,
        } as Record<string, unknown>);

        return successResponse({
          sent: 0,
          totalCost: 0,
          recipients: recipients.length,
          scheduled: true,
          scheduled_at: scheduledDate.toISOString(),
          message: `SMS scheduled for ${scheduledDate.toISOString()}`,
        });
      }
    }

    // In-app notification channel
    if (parsed.data.channels.in_app) {
      // Resolve user IDs from students' parent relationships
      const notificationRecipients = new Set<string>();
      for (const r of recipients) {
        // Find users linked to these phone numbers
        const { data: linkedUsers } = await supabase
          .from("users")
          .select("id")
          .eq("phone", r.phone)
          .eq("is_deleted", false);
        if (linkedUsers) {
          for (const u of linkedUsers) {
            notificationRecipients.add(u.id);
          }
        }
      }

      // Insert in-app notifications
      for (const userId of notificationRecipients) {
        await supabase.from("in_app_notifications").insert({
          school_id: schoolId,
          recipient_user_id: userId,
          title: parsed.data.title || "School Announcement",
          body: parsed.data.message_body,
          type: "info",
        } as Record<string, unknown>);
      }
    }

    // SMS channel
    let sent = 0;
    let totalCost = 0;
    const smsCostPerUnit = 25; // UGX

    if (parsed.data.channels.sms) {
      // Check if school has AT credentials
      let hasATCredentials = !!(school?.africas_talking_username && school?.africas_talking_api_key);

      // Try encrypted credentials if plaintext not available
      if (!hasATCredentials && school?.africas_talking_api_key_enc) {
        hasATCredentials = true;
      }

      // Get AT credentials (decrypted if needed)
      let atUsername = school?.africas_talking_username || "";
      let atApiKey = school?.africas_talking_api_key || "";

      if (school?.africas_talking_api_key_enc && process.env.SUPABASE_VAULT_SECRET_KEY) {
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

      for (const recipient of recipients) {
        const personalizedMessage = personalizeMessage(parsed.data.message_body, {
          parent_name: recipient.parent_name,
          student_name: recipient.student_name,
          balance: recipient.balance,
          school_name: school?.name || "",
          term: recipient.term,
        });

        const smsCount = Math.ceil(personalizedMessage.length / 160);
        const cost = smsCount * smsCostPerUnit;

        const smsLog: Record<string, unknown> = {
          school_id: schoolId,
          recipient_phone: recipient.phone,
          message_body: personalizedMessage,
          message_type: "announcement",
          status: hasATCredentials ? "pending" : "sent",
          cost,
        };

        // Send via Africa's Talking if credentials available
        if (hasATCredentials && atApiKey) {
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
                  message: personalizedMessage,
                  from: process.env.AFRICASTALKING_SENDER_ID || "SKULI",
                }),
              }
            );

            const data = await response.json();
            const atRecipient = data.SMSMessageData?.Recipients?.[0];

            if (atRecipient) {
              smsLog.africa_talking_message_id = atRecipient.messageId;
              smsLog.status = atRecipient.statusCode === 101 ? "sent" : "failed";
              smsLog.sent_at = new Date().toISOString();
              if (atRecipient.statusCode === 101) {
                smsLog.cost = parseFloat(atRecipient.cost?.replace("UGX", "") || "0");
              }
            }
          } catch {
            smsLog.status = "failed";
          }
        }

        const { error: logError } = await supabase.from("sms_logs").insert(smsLog as Record<string, unknown>);
        if (!logError) {
          sent++;
          totalCost += Number(smsLog.cost) || cost;
        }

        // Rate limit
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
    }

    // Create announcement record
    await supabase.from("announcements").insert({
      school_id: schoolId,
      title: parsed.data.title || "SMS Broadcast",
      body: parsed.data.message_body,
      target_audience: parsed.data.target_audience,
      target_class_ids: parsed.data.target_class_ids || [],
      sent_via: parsed.data.channels.sms && parsed.data.channels.in_app ? "sms,in_app" : parsed.data.channels.sms ? "sms" : "in_app",
      sent_at: new Date().toISOString(),
      sent_by: ctx.user.id,
      sms_cost: totalCost,
    } as Record<string, unknown>);

    // Audit log
    await supabase.from("audit_logs").insert({
      school_id: schoolId,
      user_id: ctx.user.id,
      action: "communication_sent",
      entity_type: "announcement",
      new_value: {
        recipients: sent,
        cost: totalCost,
        audience: parsed.data.target_audience,
        channels: parsed.data.channels,
      },
    } as Record<string, unknown>);

    return successResponse({ sent, totalCost, recipients: recipients.length });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Internal server error";
    const status = err instanceof Error && "status" in err ? (err as { status: number }).status : 500;
    return errorResponse(message, status);
  }
}

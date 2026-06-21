import type { Database } from "@/types/database";
import { sendSmsSchema } from "@/lib/validations/communication";
import { route, AuthError } from "@/lib/http";
import { formatUGX } from "@/lib/utils/currency";
import { getSchoolCredentials, sendSms } from "@/lib/africas-talking/client";
import { createAdminClient } from "@/lib/supabase/admin";

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
  },
): string {
  return template
    .replace(/\{parent_name\}/gi, recipient.parent_name)
    .replace(/\{student_name\}/gi, recipient.student_name)
    .replace(/\{balance\}/gi, formatUGX(recipient.balance))
    .replace(/\{school_name\}/gi, recipient.school_name)
    .replace(/\{term\}/gi, recipient.term)
    .replace(/\{deadline\}/gi, recipient.deadline ?? "")
    .replace(
      /\{results_link\}/gi,
      `${process.env.NEXT_PUBLIC_APP_URL || ""}/portal/results`,
    );
}

export const POST = route({
  roles: ["SCHOOL_ADMIN", "BURSAR", "SUPER_ADMIN"],
  schema: sendSmsSchema,
  handler: async (ctx, body) => {
    const schoolId = ctx.profile.school_id!;
    const supabase = ctx.supabase;

    const { data: school } = (await supabase
      .from("schools")
      .select("name")
      .eq("id", schoolId)
      .single()) as { data: Pick<SchoolRow, "name"> | null };

    const atCredentials = await getSchoolCredentials(supabase, schoolId);

    const { data: currentTerm } = await supabase
      .from("terms")
      .select("id, name")
      .eq("school_id", schoolId)
      .eq("is_current", true)
      .single();

    const termName = currentTerm?.name || "";

    const recipients: Recipient[] = [];

    if (body.target_audience === "custom" && body.custom_phones) {
      for (const phone of body.custom_phones) {
        recipients.push({
          phone,
          parent_name: "Parent",
          student_name: "Student",
          balance: 0,
          term: termName,
        });
      }
    } else {
      const balances = new Map<string, number>();

      let studentsQuery = supabase
        .from("students")
        .select("id, full_name, parent_name, parent_phone")
        .eq("school_id", schoolId)
        .eq("is_deleted", false)
        .eq("status", "active")
        .not("parent_phone", "is", null);

      if (
        body.target_audience === "class" &&
        body.target_class_ids?.length
      ) {
        studentsQuery = studentsQuery.in(
          "current_class_id",
          body.target_class_ids,
        );
      }

      if (body.target_audience === "defaulters") {
        const { data: defaulterAccounts } = (await supabase
          .from("fee_accounts")
          .select("student_id, balance")
          .eq("school_id", schoolId)
          .eq("term_id", currentTerm?.id || "")
          .gt("balance", 0)) as {
          data: { student_id: string; balance: number }[] | null;
        };

        if (defaulterAccounts && defaulterAccounts.length > 0) {
          const studentIds = defaulterAccounts.map((a) => a.student_id);
          studentsQuery = studentsQuery.in("id", studentIds);
          for (const a of defaulterAccounts) {
            balances.set(a.student_id, Number(a.balance) || 0);
          }
        } else {
          return {
            sent: 0,
            totalCost: 0,
            recipients: 0,
            message: "No defaulters found",
          };
        }
      }

      const { data: students } = (await studentsQuery) as {
        data: {
          id: string;
          full_name: string;
          parent_name: string | null;
          parent_phone: string | null;
        }[] | null;
      };

      if (students) {
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
      throw new AuthError("No recipients found", 400);
    }

    if (body.scheduled_at) {
      const scheduledDate = new Date(body.scheduled_at);
      if (scheduledDate > new Date()) {
        await supabase.from("announcements").insert({
          school_id: schoolId,
          title: body.title || "Scheduled SMS",
          body: body.message_body,
          target_audience: body.target_audience,
          target_class_ids: body.target_class_ids || [],
          sent_via: "sms",
          scheduled_at: scheduledDate.toISOString(),
          scheduled_status: "pending",
          sent_by: ctx.user.id,
        } as unknown as Database["public"]["Tables"]["announcements"]["Insert"]);

        return {
          sent: 0,
          totalCost: 0,
          recipients: recipients.length,
          scheduled: true,
          scheduled_at: scheduledDate.toISOString(),
          message: `SMS scheduled for ${scheduledDate.toISOString()}`,
        };
      }
    }

    if (body.channels.in_app) {
      const uniquePhones = Array.from(new Set(recipients.map((r) => r.phone)));
      if (uniquePhones.length > 0) {
        const { data: linkedUsers } = await supabase
          .from("users")
          .select("id, phone")
          .in("phone", uniquePhones)
          .eq("is_deleted", false);
        const userIds = (linkedUsers ?? []).map(
          (u: { id: string }) => u.id,
        );
        if (userIds.length > 0) {
          const notificationRows = userIds.map((userId) => ({
            school_id: schoolId,
            recipient_user_id: userId,
            title: body.title || "School Announcement",
            body: body.message_body,
            type: "info",
          }));
          await supabase
            .from("in_app_notifications")
            .insert(
              notificationRows as unknown as Database["public"]["Tables"]["in_app_notifications"]["Insert"],
            );
        }
      }
    }

    let sent = 0;
    let totalCost = 0;
    const smsCostPerUnit = 25;

    if (body.channels.sms) {
      const hasATCredentials = !!atCredentials;
      const adminClient = createAdminClient();
      const spendCheck = await adminClient.rpc(
        "record_sms_spend" as never,
        { p_school_id: schoolId, p_cost: 0 } as never,
      );
      const initialSpend = Array.isArray(spendCheck.data)
        ? spendCheck.data[0]
        : (spendCheck.data as
            | {
                allowed: boolean;
                cap_ugx: number;
                spent_ugx: number;
                remaining_ugx: number;
                reason: string;
              }
            | null);
      if (initialSpend && initialSpend.allowed === false) {
        throw new AuthError(
          "Monthly SMS spend cap reached. Increase the cap in Settings before sending.",
          429,
        );
      }
      let capRemaining = Number(initialSpend?.remaining_ugx ?? 0);
      const capDisabled = initialSpend ? initialSpend.cap_ugx === 0 : false;

      for (const recipient of recipients) {
        const personalizedMessage = personalizeMessage(body.message_body, {
          parent_name: recipient.parent_name,
          student_name: recipient.student_name,
          balance: recipient.balance,
          school_name: school?.name || "",
          term: recipient.term,
        });

        const smsCount = Math.ceil(personalizedMessage.length / 160);
        const cost = smsCount * smsCostPerUnit;

        if (!capDisabled && cost > capRemaining) {
          return {
            sent,
            totalCost,
            recipients: recipients.length,
            pending: recipients.length - sent,
            message:
              "SMS spend cap reached. The remaining recipients were not sent.",
          };
        }

        const smsLog: Record<string, unknown> = {
          school_id: schoolId,
          recipient_phone: recipient.phone,
          message_body: personalizedMessage,
          message_type: "announcement",
          status: hasATCredentials ? "pending" : "sent",
          cost,
        };

        if (hasATCredentials && atCredentials) {
          try {
            const atResponse = await sendSms(
              {
                to: recipient.phone,
                message: personalizedMessage,
                from: process.env.AFRICAS_TALKING_SENDER_ID || "SKULI",
              },
              atCredentials,
            );

            const atRecipient = atResponse.SMSMessageData?.Recipients?.[0];

            if (atRecipient) {
              smsLog.africa_talking_message_id = atRecipient.messageId;
              smsLog.status =
                atRecipient.statusCode === 101 ? "sent" : "failed";
              smsLog.sent_at = new Date().toISOString();
              if (atRecipient.statusCode === 101) {
                smsLog.cost = parseFloat(
                  atRecipient.cost?.replace("UGX", "") || "0",
                );
                capRemaining = Math.max(
                  0,
                  capRemaining - Number(smsLog.cost),
                );
              } else {
                capRemaining = Math.max(0, capRemaining - cost);
              }
            } else {
              capRemaining = Math.max(0, capRemaining - cost);
            }
          } catch {
            smsLog.status = "failed";
            capRemaining = Math.max(0, capRemaining - cost);
          }
        } else {
          capRemaining = Math.max(0, capRemaining - cost);
        }

        const { error: logError } = await supabase
          .from("sms_logs")
          .insert(smsLog as Database["public"]["Tables"]["sms_logs"]["Insert"]);
        if (!logError) {
          sent++;
          totalCost += Number(smsLog.cost) || cost;
        }

        await new Promise((resolve) => setTimeout(resolve, 100));
      }
    }

    await supabase.from("announcements").insert({
      school_id: schoolId,
      title: body.title || "SMS Broadcast",
      body: body.message_body,
      target_audience: body.target_audience,
      target_class_ids: body.target_class_ids || [],
      sent_via:
        body.channels.sms && body.channels.in_app
          ? "sms,in_app"
          : body.channels.sms
            ? "sms"
            : "in_app",
      sent_at: new Date().toISOString(),
      sent_by: ctx.user.id,
      sms_cost: totalCost,
    } as unknown as Database["public"]["Tables"]["announcements"]["Insert"]);

    await supabase.from("audit_logs").insert({
      school_id: schoolId,
      user_id: ctx.user.id,
      action: "communication_sent",
      entity_type: "announcement",
      new_value: {
        recipients: sent,
        cost: totalCost,
        audience: body.target_audience,
        channels: body.channels,
      },
    } as unknown as Database["public"]["Tables"]["audit_logs"]["Insert"]);

    return { sent, totalCost, recipients: recipients.length };
  },
});
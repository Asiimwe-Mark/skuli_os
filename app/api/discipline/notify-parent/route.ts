import { z } from "zod";
import { route, AuthError } from "@/lib/http";
import { normalizePhone } from "@/lib/utils/phone";
import { getSchoolCredentials } from "@/lib/africas-talking/client";
import { sendSingleSms } from "@/lib/africas-talking/sms";

const notifyParentSchema = z.object({
  student_id: z.string().uuid(),
  record_id: z.string().uuid(),
  message_override: z.string().optional(),
});

export const POST = route({
  roles: ["SCHOOL_ADMIN", "TEACHER"],
  schema: notifyParentSchema,
  handler: async (ctx, body) => {
    const schoolId = ctx.profile.school_id!;

    const { data: record, error: recordError } = await ctx.supabase
      .from("discipline_records")
      .select(
        `
        id,
        incident_date,
        incident_type,
        description,
        action_taken,
        student:students(
          id,
          full_name,
          parent_name,
          parent_phone
        ),
        school:schools(
          id,
          name
        )
      `,
      )
      .eq("id", body.record_id)
      .eq("school_id", schoolId)
      .single();

    if (recordError || !record) {
      throw new AuthError("Discipline record not found", 404);
    }

    const student = record.student as unknown as {
      id: string;
      full_name: string;
      parent_name: string | null;
      parent_phone: string | null;
    } | null;
    const school = record.school as unknown as {
      id: string;
      name: string;
    } | null;

    if (!student || !student.parent_phone) {
      throw new AuthError("Parent phone number not available", 400);
    }

    const defaultMessage = `Dear ${student.parent_name || "Parent"}, we wish to inform you that ${student.full_name} was involved in a ${record.incident_type} incident on ${record.incident_date}. ${record.description ? `Details: ${record.description}.` : ""} ${record.action_taken ? `Action taken: ${record.action_taken}.` : ""} Please contact the school for more information. Regards, ${school?.name || "School"}`;

    const message = body.message_override || defaultMessage;
    const phone = normalizePhone(student.parent_phone);

    const credentials = await getSchoolCredentials(ctx.supabase, schoolId);
    if (!credentials) {
      throw new AuthError(
        "SMS is not configured. Please set up Africa's Talking credentials in Settings > API Keys.",
        400,
      );
    }

    const smsResult = await sendSingleSms(phone, message, credentials);

    await ctx.supabase.from("sms_logs").insert({
      school_id: schoolId,
      recipient_phone: phone,
      message_body: message,
      message_type: "discipline_notification",
      status: smsResult.success ? "sent" : "failed",
      africa_talking_message_id: null,
      cost: null,
      related_entity_type: "discipline_record",
      related_entity_id: body.record_id,
      sent_at: new Date().toISOString(),
    });

    await ctx.supabase
      .from("discipline_records")
      .update({
        parent_notified: true,
        parent_notified_at: new Date().toISOString(),
      })
      .eq("id", body.record_id);

    if (!smsResult.success) {
      throw new AuthError(
        `Failed to send SMS: ${smsResult.error || "Unknown error"}`,
        500,
      );
    }

    return {
      message: "Parent notification sent successfully",
      smsId: smsResult.messageId,
    };
  },
});
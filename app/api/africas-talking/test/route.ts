import type { Database } from "@/types/database";
import { route, AuthError } from "@/lib/http";
import { getSchoolCredentials, sendSms } from "@/lib/africas-talking/client";

export const POST = route({
  roles: ["SCHOOL_ADMIN", "SUPER_ADMIN"],
  handler: async (ctx) => {
    const schoolId = ctx.profile.school_id!;
    const supabase = ctx.supabase;

    const { data: school } = await supabase
      .from("schools")
      .select("phone, name")
      .eq("id", schoolId)
      .single();

    if (!school?.phone) {
      throw new AuthError(
        "No school phone number configured. Please add a phone number in School Profile settings.",
        400,
      );
    }

    const credentials = await getSchoolCredentials(supabase, schoolId);
    if (!credentials) {
      throw new AuthError(
        "Africa's Talking credentials not configured. Please add your API keys first.",
        400,
      );
    }

    const testMessage = `Hello from Skuli OS! This is a test SMS for ${school.name}. Your Africa's Talking integration is working correctly.`;

    const response = await sendSms(
      {
        to: school.phone,
        message: testMessage,
        from: process.env.AFRICAS_TALKING_SENDER_ID || "SKULI",
      },
      credentials,
    );

    const recipient = response.SMSMessageData?.Recipients?.[0];
    const success = recipient?.status === "Success";

    await supabase.from("sms_logs").insert({
      school_id: schoolId,
      recipient_phone: school.phone,
      message_body: testMessage,
      message_type: "test",
      status: success ? "sent" : "failed",
      cost: 0,
      africa_talking_message_id: null,
      sent_at: new Date().toISOString(),
    } as Database["public"]["Tables"]["sms_logs"]["Insert"]);

    if (!success) {
      throw new AuthError(
        `Test SMS failed: ${recipient?.status || "Unknown error"}. Please check your API credentials.`,
        400,
      );
    }

    return {
      message: `Test SMS sent successfully to ${school.phone}`,
      status: recipient?.status,
      messageId: recipient?.messageId,
    };
  },
});
import { NextRequest } from "next/server";
import type { Database } from "@/types/database";
import {
  getSupabaseAndUser,
  requireSchool,
  requireRole,
  successResponse,
  errorResponse,
} from "@/lib/api-helpers";
import { getSchoolCredentials, sendSms } from "@/lib/africas-talking/client";

export async function POST(request: NextRequest) {
  try {
    const ctx = await getSupabaseAndUser();
    const schoolId = requireSchool(ctx);
    requireRole(ctx, ["SCHOOL_ADMIN", "SUPER_ADMIN"]);

    const supabase = ctx.supabase;

    // Get school admin's phone for the test
    const { data: school } = await supabase
      .from("schools")
      .select("phone, name")
      .eq("id", schoolId)
      .single();

    if (!school?.phone) {
      return errorResponse(
        "No school phone number configured. Please add a phone number in School Profile settings.",
        400
      );
    }

    // Get decrypted credentials
    const credentials = await getSchoolCredentials(supabase, schoolId);
    if (!credentials) {
      return errorResponse(
        "Africa's Talking credentials not configured. Please add your API keys first.",
        400
      );
    }

    // Send test SMS
    const testMessage = `Hello from Skuli OS! This is a test SMS for ${school.name}. Your Africa's Talking integration is working correctly.`;

    const response = await sendSms(
      {
        to: school.phone,
        message: testMessage,
        from: process.env.AFRICAS_TALKING_SENDER_ID || "SKULI",
      },
      credentials
    );

    const recipient = response.SMSMessageData?.Recipients?.[0];
    const success = recipient?.status === "Success";

    // Log the test SMS
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
      return errorResponse(
        `Test SMS failed: ${recipient?.status || "Unknown error"}. Please check your API credentials.`,
        400
      );
    }

    return successResponse({
      message: `Test SMS sent successfully to ${school.phone}`,
      status: recipient?.status,
      messageId: recipient?.messageId,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Internal server error";
    const status =
      err instanceof Error && "status" in err
        ? (err as { status: number }).status
        : 500;
    return errorResponse(message, status);
  }
}

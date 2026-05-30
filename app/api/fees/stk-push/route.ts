// This route is for SCHOOL ADMIN / BURSAR / PARENT initiated STK push payments.
// Accepts optional phone from body (falls back to student.parent_phone).
// Looks up fee_account_id for the payment record.
// See also: /api/payments/stk-push for the parent-portal variant.
import { NextRequest } from "next/server";
import {
  getSupabaseAndUser,
  requireSchool,
  requireRole,
  successResponse,
  errorResponse,
} from "@/lib/api-helpers";
import { getSchoolCredentials } from "@/lib/africas-talking/client";
import { requestMobileMoneyPayment } from "@/lib/africas-talking/mobile-money";

export async function POST(request: NextRequest) {
  try {
    const ctx = await getSupabaseAndUser();
    const schoolId = requireSchool(ctx);
    requireRole(ctx, ["SCHOOL_ADMIN", "BURSAR", "SUPER_ADMIN"]);

    const body = await request.json();
    const { student_id, fee_account_id, amount, phone } = body;

    if (!student_id || !amount || amount <= 0 || !phone) {
      return errorResponse("student_id, phone, and a positive amount are required", 400);
    }

    const supabase = ctx.supabase;

    // Verify student belongs to this school
    const { data: student, error: studentError } = await supabase
      .from("students")
      .select("id, full_name, parent_phone")
      .eq("id", student_id)
      .eq("school_id", schoolId)
      .eq("is_deleted", false)
      .single();

    if (studentError || !student) {
      return errorResponse("Student not found in this school", 404);
    }

    // Get school's Africa's Talking credentials
    const credentials = await getSchoolCredentials(supabase, schoolId);
    if (!credentials) {
      return errorResponse(
        "Mobile money is not configured. Please set up Africa's Talking credentials in Settings > API Keys.",
        400
      );
    }

    // Get current term
    const { data: currentTerm } = await supabase
      .from("terms")
      .select("id, name")
      .eq("school_id", schoolId)
      .eq("is_current", true)
      .single();

    // Initiate STK push
    const result = await requestMobileMoneyPayment(
      {
        phoneNumber: phone,
        amount: Number(amount),
        currencyCode: "UGX",
        metadata: {
          student_id,
          student_name: student.full_name,
          fee_account_id: fee_account_id || "",
          school_id: schoolId,
          term_id: currentTerm?.id || "",
          term_name: currentTerm?.name || "",
          type: "fee_payment",
        },
      },
      credentials
    );

    if (!result.success) {
      return errorResponse(
        result.error || result.description || "Failed to initiate payment",
        400
      );
    }

    // Create a pending payment record
    await supabase.from("fee_payments").insert({
      school_id: schoolId,
      student_id,
      fee_account_id: fee_account_id || null,
      amount: Number(amount),
      payment_method: "mobile_money",
      mm_provider: phone.startsWith("+2567") || phone.startsWith("07") ? "mtn" : "airtel",
      phone,
      status: "pending",
      transaction_ref: result.transactionId || null,
      received_by: ctx.user.id,
    } as Record<string, unknown>);

    // Audit log
    await supabase.from("audit_logs").insert({
      school_id: schoolId,
      user_id: ctx.user.id,
      action: "stk_push_initiated",
      entity_type: "fee_payment",
      new_value: {
        student_id,
        fee_account_id,
        amount: Number(amount),
        phone,
        transaction_id: result.transactionId,
      },
    } as Record<string, unknown>);

    return successResponse({
      transactionId: result.transactionId,
      status: result.status,
      description: result.description,
      message: "STK push sent. Waiting for payment confirmation.",
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

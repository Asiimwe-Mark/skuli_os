// This route is for SCHOOL ADMIN / BURSAR initiated STK push payments.
// Requires phone in the body (no fallback).
// Does NOT look up fee_account_id — used by the admin payments page.
// See also: /api/fees/stk-push for the parent-portal variant with phone fallback.
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
    requireRole(ctx, ["PARENT", "SCHOOL_ADMIN", "BURSAR", "SUPER_ADMIN"]);

    const body = await request.json();
    const { student_id, amount, phone } = body;

    if (!student_id || !amount || amount <= 0) {
      return errorResponse("student_id and a positive amount are required", 400);
    }

    const supabase = ctx.supabase;

    // Get student info
    const { data: student, error: studentError } = await supabase
      .from("students")
      .select("id, full_name, parent_phone, school_id")
      .eq("id", student_id)
      .eq("is_deleted", false)
      .single();

    if (studentError || !student) {
      return errorResponse("Student not found", 404);
    }

    // Verify the parent can only pay for their own children
    if (ctx.profile.role === "PARENT") {
      const { data: parentUser } = await supabase
        .from("users")
        .select("phone")
        .eq("id", ctx.user.id)
        .single();

      if (!parentUser?.phone || parentUser.phone !== student.parent_phone) {
        return errorResponse("You can only make payments for your own children", 403);
      }
    }

    // Determine phone number
    const paymentPhone = phone || student.parent_phone;
    if (!paymentPhone) {
      return errorResponse("No phone number available for payment", 400);
    }

    // Get school's Africa's Talking credentials
    const credentials = await getSchoolCredentials(supabase, schoolId);
    if (!credentials) {
      return errorResponse(
        "Mobile money is not configured for this school. Please contact the school admin.",
        400
      );
    }

    // Get current term for metadata
    const { data: currentTerm } = await supabase
      .from("terms")
      .select("id, name")
      .eq("school_id", schoolId)
      .eq("is_current", true)
      .single();

    // Initiate STK push
    const result = await requestMobileMoneyPayment(
      {
        phoneNumber: paymentPhone,
        amount: Number(amount),
        currencyCode: "UGX",
        metadata: {
          student_id,
          student_name: student.full_name,
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
    const { data: feeAccount } = await supabase
      .from("fee_accounts")
      .select("id")
      .eq("student_id", student_id)
      .eq("school_id", schoolId)
      .eq("term_id", currentTerm?.id || "")
      .limit(1)
      .single();

    await supabase.from("fee_payments").insert({
      school_id: schoolId,
      student_id,
      fee_account_id: feeAccount?.id || null,
      amount: Number(amount),
      payment_method: "mobile_money",
      mm_provider: paymentPhone.startsWith("+2567") ? "mtn" : "airtel",
      phone: paymentPhone,
      status: "pending",
      transaction_ref: result.transactionId || null,
      received_by: ctx.user.id,
    } as Record<string, unknown>);

    // Audit log
    await supabase.from("audit_logs").insert({
      school_id: schoolId,
      user_id: ctx.user.id,
      action: "payment_initiated",
      entity_type: "fee_payment",
      new_value: {
        student_id,
        amount: Number(amount),
        phone: paymentPhone,
        transaction_id: result.transactionId,
      },
    } as Record<string, unknown>);

    return successResponse({
      transactionId: result.transactionId,
      status: result.status,
      description: result.description,
      message: "Payment request sent. Check your phone to confirm.",
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

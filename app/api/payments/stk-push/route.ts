// This route is for SCHOOL ADMIN / BURSAR initiated STK push payments.
// Requires phone in the body (no fallback).
// Does NOT look up fee_account_id - used by the admin payments page.
// See also: /api/fees/stk-push for the school-scoped variant (no PARENT role).
//
// SECURITY (audit H-2): parents used to be able to bypass the
// parent_students link-table check by having a phone number that matched
// some other student's parent_phone column. The link table is the only
// authority on which children belong to which parent; we no longer fall
// back to a phone match. If a parent has no link row, the request is
// denied with 403.
import { NextRequest } from "next/server";
import crypto from "crypto";
import type { Database } from "@/types/database";
import {
  getSupabaseAndUser,
  requireSchool,
  requireRole,
  successResponse,
  errorResponse,
} from "@/lib/api-helpers";
import { getSchoolCredentials } from "@/lib/africas-talking/client";
import { requestMobileMoneyPayment } from "@/lib/africas-talking/mobile-money";
import { detectMobileMoneyProvider } from "@/lib/utils/phone";

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

    // Get student info (scoped to school for non-parent users)
    let studentQuery = supabase
      .from("students")
      .select("id, full_name, parent_phone, school_id")
      .eq("id", student_id)
      .eq("is_deleted", false);

    if (ctx.profile.role !== "PARENT") {
      studentQuery = studentQuery.eq("school_id", schoolId);
    }

    const { data: student, error: studentError } = await studentQuery.single();

    if (studentError || !student) {
      return errorResponse("Student not found", 404);
    }

    // Verify the parent can only pay for their own children.
    // parent_students is the sole authority — no phone-number fallback.
    if (ctx.profile.role === "PARENT") {
      const { data: parentLink, error: linkError } = await supabase
        .from("parent_students")
        .select("student_id")
        .eq("parent_id", ctx.user.id)
        .eq("student_id", student_id)
        .maybeSingle();

      if (linkError) {
        console.error("[payments/stk-push] parent link lookup failed:", linkError);
        return errorResponse("Could not verify guardian relationship", 500);
      }
      if (!parentLink) {
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

    // SECURITY (audit pre-launch B4-3): look up the fee_account_id BEFORE
    // initiating the STK push so we can include it in the metadata. The
    // prior code created the pending payment row AFTER the AT request
    // and never set fee_account_id in the metadata, which broke
    // reconciliation on the AT webhook side. The follow-up audit H-2
    // fix relied on this field.
    const { data: feeAccount } = await supabase
      .from("fee_accounts")
      .select("id")
      .eq("student_id", student_id)
      .eq("school_id", schoolId)
      .eq("term_id", currentTerm?.id || "")
      .limit(1)
      .maybeSingle();

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
          fee_account_id: feeAccount?.id || "",
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

    await supabase.from("fee_payments").insert({
      school_id: schoolId,
      student_id,
      fee_account_id: feeAccount?.id || null,
      amount: Number(amount),
      payment_method: "mobile_money" as const,
      mobile_money_provider: detectMobileMoneyProvider(paymentPhone),
      phone_used: paymentPhone,
      status: "pending" as const,
      mobile_money_transaction_id: result.transactionId || null,
      received_by_user_id: ctx.user.id,
      notes: null,
      payment_date: new Date().toISOString().split('T')[0],
      // Receipt entropy: 8 hex chars from a UUID gives only 32 bits —
      // collision-prone above ~10k receipts/month. Use the full UUID
      // (122 bits) and uppercase the first 16 chars. The unique index
      // on fee_payments.receipt_number (migration 00065) prevents
      // duplicates from ever persisting.
      receipt_number: `R-${crypto.randomUUID().replace(/-/g, "").slice(0, 16).toUpperCase()}`,
    } as unknown as Database["public"]["Tables"]["fee_payments"]["Insert"]);

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
      entity_id: null,
      old_value: null,
      ip_address: null,
    });

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

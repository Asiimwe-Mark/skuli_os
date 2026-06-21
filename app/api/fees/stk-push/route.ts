// This route is for SCHOOL ADMIN / BURSAR / PARENT initiated STK push payments.
// Accepts optional phone from body (falls back to student.parent_phone).
// Looks up fee_account_id for the payment record.
// See also: /api/payments/stk-push for the parent-portal variant.
import { z } from "zod";
import type { Database } from "@/types/database";
import { route, errorResponse } from "@/lib/http";
import { getSchoolCredentials } from "@/lib/africas-talking/client";
import { requestMobileMoneyPayment } from "@/lib/africas-talking/mobile-money";
import { detectMobileMoneyProvider, sanitizePhoneForPayment } from "@/lib/utils/phone";
import { checkRateLimitAsync } from "@/lib/utils/rate-limit";
import { generateReceiptNumber } from "@/lib/utils/receipt-number";

// Audit §1.3: hard ceiling on a single STK-push. Caps blast radius if
// the route is ever hit with a tampered body. Matches the existing
// cap used by /api/v1/payments/initiate.
const MAX_STK_PUSH_AMOUNT_UGX = 50_000_000;

const stkPushSchema = z.object({
  student_id: z.string().uuid(),
  fee_account_id: z.string().uuid(),
  amount: z
    .number({ message: "amount must be a number" })
    .positive("amount must be greater than zero")
    .max(
      MAX_STK_PUSH_AMOUNT_UGX,
      `amount exceeds the per-transaction cap of ${MAX_STK_PUSH_AMOUNT_UGX} UGX`,
    )
    .finite(),
  phone: z.string().min(7).max(20),
});

export const POST = route({
  roles: ["SCHOOL_ADMIN", "BURSAR", "SUPER_ADMIN"],
  schema: stkPushSchema,
  handler: async (ctx, body) => {
    const schoolId = ctx.profile.school_id!;

    // Audit §5.2: rate-limit financial endpoints. Same fail-closed
    // posture as v1/payments/initiate.
    const rl = await checkRateLimitAsync(
      `stk-push:${schoolId}`,
      30,
      10 * 60 * 1000,
    );
    if (!rl.success) {
      return errorResponse(
        "Too many STK-push requests in a short window. Please wait.",
        429,
      );
    }

    const { student_id, fee_account_id, amount, phone } = body;
    const supabase = ctx.supabase;

    // Validate the phone number format before we send anything.
    let normalizedPhone: string;
    try {
      normalizedPhone = sanitizePhoneForPayment(phone);
    } catch {
      return errorResponse("Invalid phone number", 400);
    }

    // §1.3: verify student belongs to this school AND the
    // fee_account_id belongs to the student.
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

    const { data: feeAccount, error: feeAccountError } = await supabase
      .from("fee_accounts")
      .select("id, student_id, school_id")
      .eq("id", fee_account_id)
      .maybeSingle();

    if (feeAccountError || !feeAccount) {
      return errorResponse("Fee account not found", 404);
    }
    if (feeAccount.student_id !== student_id) {
      return errorResponse("Fee account does not belong to the student", 400);
    }
    if (feeAccount.school_id !== schoolId) {
      return errorResponse("Fee account does not belong to this school", 400);
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
        phoneNumber: normalizedPhone,
        amount,
        currencyCode: "UGX",
        metadata: {
          student_id,
          student_name: student.full_name,
          fee_account_id,
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

    // §1.5 / §8.12: mint the receipt number from the DB function so
    // we share one scheme with the webhook and the rest of the app.
    const receiptNumber = await generateReceiptNumber(supabase, schoolId);

    // Create a pending payment record
    await supabase.from("fee_payments").insert({
      school_id: schoolId,
      student_id,
      fee_account_id,
      amount,
      payment_method: "mobile_money",
      mobile_money_provider: detectMobileMoneyProvider(normalizedPhone),
      phone_used: normalizedPhone,
      status: "pending",
      mobile_money_transaction_id: result.transactionId || null,
      received_by_user_id: ctx.user.id,
      receipt_number: receiptNumber,
    } as unknown as Database["public"]["Tables"]["fee_payments"]["Insert"]);

    // Audit log
    await supabase.from("audit_logs").insert({
      school_id: schoolId,
      user_id: ctx.user.id,
      action: "stk_push_initiated",
      entity_type: "fee_payment",
      entity_id: null,
      old_value: null,
      ip_address: null,
      new_value: {
        student_id,
        fee_account_id,
        amount,
        phone: normalizedPhone,
        transaction_id: result.transactionId,
      },
    } as unknown as Database["public"]["Tables"]["audit_logs"]["Insert"]);

    return {
      transactionId: result.transactionId,
      status: result.status,
      description: result.description,
      message: "STK push sent. Waiting for payment confirmation.",
    };
  },
});

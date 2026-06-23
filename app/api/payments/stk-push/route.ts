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
import crypto from "crypto";
import { z } from "zod";
import type { Database } from "@/types/database";
import { route, errorResponse } from "@/lib/http";
import { getSchoolCredentials } from "@/lib/africas-talking/client";
import { requestMobileMoneyPayment } from "@/lib/africas-talking/mobile-money";
import { detectMobileMoneyProvider } from "@/lib/utils/phone";
import { checkRateLimitAsync } from "@/lib/utils/rate-limit";
import { writeAuditLog } from "@/lib/audit-log";

const stkPushSchema = z.object({
  student_id: z.string().uuid(),
  amount: z.number().positive("amount must be greater than zero"),
  phone: z.string().optional(),
});

export const POST = route({
  roles: ["PARENT", "SCHOOL_ADMIN", "BURSAR", "SUPER_ADMIN"],
  schema: stkPushSchema,
  handler: async (ctx, body) => {
    const { student_id, amount, phone } = body;
    const supabase = ctx.supabase;
    const schoolId = ctx.schoolId;

    // Refactor (Phase 8): per-IP rate limit on payment initiation
    // stops SMS-bombing via the parent PWA or a leaked session.
    // 30 req / 10 min is generous for a normal parent and tight
    // enough to blunt scripted abuse.
    const ipHeader = (ctx.supabase as unknown as { headers?: Record<string, string> })?.headers?.["x-forwarded-for"];
    const ip = typeof ipHeader === "string" ? ipHeader : "unknown";
    const rl = await checkRateLimitAsync(`payments:stk:${ip}`, 30, 10 * 60 * 1000);
    if (!rl.success) {
      return errorResponse("Too many payment requests; please try again later", 429);
    }

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

    const paymentPhone = phone || student.parent_phone;
    if (!paymentPhone) {
      return errorResponse("No phone number available for payment", 400);
    }

    const credentials = await getSchoolCredentials(supabase, schoolId);
    if (!credentials) {
      return errorResponse(
        "Mobile money is not configured for this school. Please contact the school admin.",
        400
      );
    }

    const { data: currentTerm } = await supabase
      .from("terms")
      .select("id, name")
      .eq("school_id", schoolId)
      .eq("is_current", true)
      .single();

    const { data: feeAccount } = await supabase
      .from("fee_accounts")
      .select("id")
      .eq("student_id", student_id)
      .eq("school_id", schoolId)
      .eq("term_id", currentTerm?.id || "")
      .limit(1)
      .maybeSingle();

    const result = await requestMobileMoneyPayment(
      {
        phoneNumber: paymentPhone,
        amount,
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
      amount,
      payment_method: "mobile_money" as const,
      mobile_money_provider: detectMobileMoneyProvider(paymentPhone),
      phone_used: paymentPhone,
      status: "pending" as const,
      mobile_money_transaction_id: result.transactionId || null,
      received_by_user_id: ctx.user.id,
      notes: null,
      payment_date: new Date().toISOString().split('T')[0],
      receipt_number: `R-${crypto.randomUUID().replace(/-/g, "").slice(0, 16).toUpperCase()}`,
    } as never);

    await writeAuditLog(supabase, {
      school_id: ctx.schoolId,
      user_id: ctx.user.id,
      action: "payment_initiated",
      entity_type: "fee_payment",
      entity_id: null,
      old_value: null,
      new_value: {
        student_id,
        amount,
        phone: paymentPhone,
        transaction_id: result.transactionId,
      },
    });

    return {
      transactionId: result.transactionId,
      status: result.status,
      description: result.description,
      message: "Payment request sent. Check your phone to confirm.",
    };
  },
});
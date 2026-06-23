/**
 * Payments — STK Push domain service.
 *
 * Both `app/api/fees/stk-push/route.ts` and
 * `app/api/payments/stk-push/route.ts` route through this single
 * service. The flow:
 *
 *   1. Verify the student / fee account / term combination.
 *   2. Initiate mobile-money collection via Africa's Talking.
 *   3. Persist a `tuition_payments` row in `PENDING` state so the
 *      AT MM webhook can match the result back.
 *   4. Audit log + cache invalidation.
 *
 * The webhook handler (in `app/api/webhooks/africas-talking/mm`)
 * flips the row to `COMPLETED` / `FAILED` and emits the
 * parent-facing `in_app_notification` / SMS.
 */

import type { AuthContext } from "@/lib/http";
import { AuthError } from "@/lib/http";
import { writeAuditLog } from "@/lib/audit-log";
import { invalidateSchoolAsync } from "@/lib/api-cache";
import { initiateMobileMoney, getSchoolCredentials } from "@/lib/africas-talking/client";
import { generateReceiptNumber } from "@/lib/utils/receipt-number";
import { scopedQuery } from "@/lib/http/scoped";

export interface InitiateStkInput {
  student_id: string;
  fee_account_id: string;
  amount: number;
  phone_number: string;
  provider_channel?: "mtn" | "airtel" | string;
  fee_type_id?: string | null;
  fee_type_label?: string | null;
}

export interface InitiateStkResult {
  tuition_payment_id: string;
  receipt_number: string;
  provider_response: unknown;
}

/**
 * Initiate an STK push. Throws `AuthError` for client-side
 * validation failures; the AT API errors surface as a 502-shaped
 * AuthError so the wrapper maps it to the right status.
 */
export async function initiateStkPush(
  ctx: AuthContext,
  input: InitiateStkInput,
): Promise<InitiateStkResult> {
  if (input.amount <= 0) {
    throw new AuthError("Amount must be positive", 400);
  }

  // Verify the fee account belongs to the school + student.
  const { data: feeAccount } = await scopedQuery(ctx, "fee_accounts")
    .select("id, student_id, term_id")
    .eq("id", input.fee_account_id)
    .eq("student_id", input.student_id)
    .maybeSingle();
  if (!feeAccount) {
    throw new AuthError("Fee account not found for this student", 404);
  }

  const credentials = await getSchoolCredentials(ctx.supabase, ctx.schoolId);
  if (!credentials) {
    throw new AuthError("Africa's Talking credentials not configured for this school", 400);
  }

  const receiptNumber = await generateReceiptNumber(ctx.supabase, ctx.schoolId);
  const paymentDescription = `${input.fee_type_label ?? "School Fees"} - ${receiptNumber}`;

  // Mint a tuition_payments row up front so the webhook can match.
  // We use the receipt number as the primary key so the lookup is
  // O(1) — same scheme the existing v1/payments/initiate route uses.
  const { data: tuitionRow, error: insertError } = await ctx.supabase
    .from("tuition_payments")
    .insert({
      id: receiptNumber,
      school_id: ctx.schoolId,
      student_id: input.student_id,
      fee_account_id: input.fee_account_id,
      amount: input.amount,
      fee_type_id: input.fee_type_id ?? null,
      fee_type_label: input.fee_type_label ?? null,
      payment_description: paymentDescription,
      initiated_by_user_id: ctx.user.id,
      status: "PENDING",
    } as never)
    .select("id")
    .single();

  if (insertError) {
    throw new AuthError(`Failed to initiate payment: ${insertError.message}`, 400);
  }

  let providerResponse: unknown;
  try {
    providerResponse = await initiateMobileMoney(
      {
        phoneNumber: input.phone_number,
        currencyCode: "UGX",
        amount: input.amount,
        providerChannel: input.provider_channel,
        metadata: {
          school_id: ctx.schoolId,
          student_id: input.student_id,
          receipt_number: receiptNumber,
        },
      },
      credentials,
    );
  } catch (err) {
    // The MM call failed; mark the tuition_payments row as FAILED
    // so it does not sit forever in PENDING.
    await ctx.supabase
      .from("tuition_payments")
      .update({ status: "FAILED" } as never)
      .eq("id", receiptNumber);

    throw new AuthError(
      `Mobile money provider error: ${err instanceof Error ? err.message : "unknown"}`,
      502,
    );
  }

  await writeAuditLog(ctx.supabase, {
    school_id: ctx.schoolId,
    user_id: ctx.user.id,
    action: "stk_push_initiated",
    entity_type: "tuition_payment",
    entity_id: tuitionRow?.id ?? receiptNumber,
    new_value: {
      amount: input.amount,
      student_id: input.student_id,
      phone_number: input.phone_number,
    },
  });

  invalidateSchoolAsync(ctx.schoolId);

  return {
    tuition_payment_id: tuitionRow?.id ?? receiptNumber,
    receipt_number: receiptNumber,
    provider_response: providerResponse,
  };
}
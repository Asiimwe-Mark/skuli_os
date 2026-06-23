/**
 * Fees domain service.
 *
 * Why this file exists
 * --------------------
 * The fees handlers (`app/api/fees/...`) used to embed their domain
 * logic inline: receipt-number generation, fee-account lookup,
 * balance recalculation, audit-log writes, parent push notifications,
 * cache invalidation. That made the route files 200–400 lines and
 * made the business logic untestable without spinning up Next.js +
 * the request pipeline.
 *
 * This service extracts every reusable fees flow into a single
 * module. Handlers shrink to:
 *
 *     export const POST = route({
 *       roles: ["SCHOOL_ADMIN", "BURSAR"],
 *       schema: recordPaymentSchema,
 *       handler: async (ctx, body) => recordPayment(ctx, body),
 *     });
 *
 * Concurrency contract
 * --------------------
 * All write flows call `invalidateSchoolAsync(ctx.schoolId)` at the
 * end so the next read picks up the new state. The async variant
 * runs on the next tick after the response is flushed; paying 30–200
 * ms of Redis SCAN+DEL latency on the mutation path is wasted.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";
import type { AuthContext } from "@/lib/http";
import { AuthError } from "@/lib/http";
import { writeAuditLog, withAudit } from "@/lib/audit-log";
import { generateReceiptNumber } from "@/lib/utils/receipt-number";
import { invalidateSchoolAsync } from "@/lib/api-cache";
import { sendPushToUser } from "@/lib/push";
import { scopedQuery, paginated } from "@/lib/http/scoped";

type FeePaymentInsert = Database["public"]["Tables"]["fee_payments"]["Insert"];
type FeeAccountUpdate = Database["public"]["Tables"]["fee_accounts"]["Update"];

export interface RecordPaymentInput {
  student_id: string;
  fee_account_id?: string | null;
  amount: number;
  payment_method: Database["public"]["Enums"]["payment_method"];
  payment_date: string;
  notes?: string | null;
  mobile_money_provider?: string | null;
  mobile_money_transaction_id?: string | null;
  phone_used?: string | null;
}

/**
 * Resolve the fee account for a student in the current term (or
 * the explicit one passed in). Returns null when no account
 * exists — caller should 400 the client.
 */
export async function getFeeAccountForStudent(
  ctx: AuthContext,
  studentId: string,
  feeAccountId?: string | null,
): Promise<Database["public"]["Tables"]["fee_accounts"]["Row"] | null> {
  let query = scopedQuery(ctx, "fee_accounts")
    .select("id, student_id, term_id, school_id")
    .eq("student_id", studentId);

  if (feeAccountId) {
    query = query.eq("id", feeAccountId);
  } else {
    // Look up the school's current term.
    const { data: currentTerm } = await scopedQuery(ctx, "terms")
      .select("id")
      .eq("is_current", true)
      .maybeSingle();
    if (currentTerm) {
      query = query.eq("term_id", currentTerm.id);
    }
  }

  const { data } = await query.maybeSingle();
  return data ?? null;
}

/**
 * Record a fee payment end-to-end:
 *   1. Resolve the fee account.
 *   2. Mint a receipt number via the DB advisory-locked function.
 *   3. Insert the payment row.
 *   4. Recalculate the fee account via the existing RPC.
 *   5. Audit log.
 *   6. Schedule cache invalidation (fire-and-forget).
 *   7. Push a notification to the parent (best-effort).
 *
 * Steps 6 + 7 never block the response.
 */
export async function recordPayment(
  ctx: AuthContext,
  body: RecordPaymentInput,
): Promise<Database["public"]["Tables"]["fee_payments"]["Row"]> {
  const feeAccount = await getFeeAccountForStudent(ctx, body.student_id, body.fee_account_id);
  if (!feeAccount) {
    throw new AuthError("No fee account found for this student. Generate accounts first.", 400);
  }

  const receiptNumber = await generateReceiptNumber(ctx.supabase, ctx.schoolId);

  const insert: FeePaymentInsert = {
    school_id: ctx.schoolId,
    fee_account_id: feeAccount.id,
    student_id: body.student_id,
    term_id: feeAccount.term_id ?? null,
    amount: body.amount,
    payment_method: body.payment_method,
    mobile_money_provider: (body.mobile_money_provider ?? null) as FeePaymentInsert["mobile_money_provider"],
    mobile_money_transaction_id: body.mobile_money_transaction_id ?? null,
    phone_used: body.phone_used ?? null,
    received_by_user_id: ctx.user.id,
    payment_date: body.payment_date,
    notes: body.notes ?? null,
    receipt_number: receiptNumber,
    status: "confirmed",
  };

  const { data: payment, error } = await ctx.supabase
    .from("fee_payments")
    .insert(insert)
    .select()
    .single();

  if (error) {
    throw new AuthError(`Failed to record payment: ${error.message}`, 400);
  }

  // Recalculate balance via the existing RPC. Failures are surfaced
  // — a stuck recalculation means the dashboard will show stale
  // totals, which is worse than a failed payment POST.
  const { error: recalcErr } = await ctx.supabase.rpc(
    "recalculate_fee_account" as never,
    { p_account_id: feeAccount.id } as never,
  );
  if (recalcErr) {
    console.error("[fees] recalculate_fee_account failed", recalcErr);
  }

  await writeAuditLog(ctx.supabase, {
    school_id: ctx.schoolId,
    user_id: ctx.user.id,
    action: "payment_recorded",
    entity_type: "fee_payment",
    entity_id: payment?.id ?? null,
    new_value: {
      amount: body.amount,
      method: body.payment_method,
      receipt: receiptNumber,
      student_id: body.student_id,
    },
  });

  invalidateSchoolAsync(ctx.schoolId);

  // Push to parent — best-effort, must not block the response.
  void sendPaymentReceiptPush(ctx, body.student_id, payment).catch((err) => {
    console.error("[fees] parent push failed", err);
  });

  return payment;
}

/**
 * Send a web-push notification to the parent of a student for a
 * payment receipt. Resolves the parent via the students.parent_phone
 * → users.phone lookup. Best-effort.
 */
async function sendPaymentReceiptPush(
  ctx: AuthContext,
  studentId: string,
  payment: { amount: number; receipt_number?: string | null } | null,
): Promise<void> {
  if (!payment) return;
  const supabase: SupabaseClient<Database> = ctx.supabase;
  const { data: student } = await supabase
    .from("students")
    .select("full_name, parent_phone")
    .eq("id", studentId)
    .maybeSingle();
  if (!student?.parent_phone) return;

  const { data: parentUser } = await supabase
    .from("users")
    .select("id")
    .eq("phone", student.parent_phone)
    .eq("role", "PARENT")
    .maybeSingle();
  if (!parentUser) return;

  await sendPushToUser(supabase, parentUser.id, {
    title: "Payment Received",
    body: `${Number(payment.amount).toLocaleString()} UGX for ${student.full_name}`,
    url: "/portal/fees",
  });
}

/**
 * Update a fee account (used by `app/api/fees/accounts/route.ts`
 * PATCH). Recalculates balance + status if expected/paid changed.
 * Wraps the whole operation in `withAudit` so a failure is
 * recorded as `<action>_failed`.
 */
export async function updateFeeAccount(
  ctx: AuthContext,
  id: string,
  updates: {
    total_expected?: number;
    total_paid?: number;
    balance?: number;
    status?: Database["public"]["Enums"]["fee_account_status"];
  },
): Promise<Database["public"]["Tables"]["fee_accounts"]["Row"]> {
  return withAudit(
    ctx,
    {
      action: "fee_account_updated",
      entityType: "fee_account",
      entityId: id,
    },
    async () => {
      const { data: existing } = (await scopedQuery(ctx, "fee_accounts")
        .select("id, total_expected, total_paid, balance, status")
        .eq("id", id)
        .maybeSingle()) as { data: Database["public"]["Tables"]["fee_accounts"]["Row"] | null };

      if (!existing) {
        throw new AuthError("Fee account not found", 404);
      }

      const allowed: FeeAccountUpdate = {};
      if (updates.total_expected !== undefined) allowed.total_expected = updates.total_expected;
      if (updates.total_paid !== undefined) allowed.total_paid = updates.total_paid;
      if (updates.balance !== undefined) allowed.balance = updates.balance;
      if (updates.status !== undefined) allowed.status = updates.status;

      // Recalculate balance if expected or paid changed.
      if (allowed.total_expected !== undefined || allowed.total_paid !== undefined) {
        const expected = (allowed.total_expected as number | undefined) ?? existing.total_expected;
        const paid = (allowed.total_paid as number | undefined) ?? existing.total_paid;
        const balance = Number(expected) - Number(paid);
        allowed.balance = balance as never;
        if (balance < 0) allowed.status = "overpaid";
        else if (balance === 0) allowed.status = "paid";
        else if (Number(paid) > 0) allowed.status = "partial";
        else allowed.status = "unpaid";
      }

      const { data, error } = await scopedQuery(ctx, "fee_accounts")
        .update(allowed as never)
        .eq("id", id)
        .select()
        .single();

      if (error) {
        throw new AuthError(`Failed to update fee account: ${error.message}`, 400);
      }

      invalidateSchoolAsync(ctx.schoolId);
      return data;
    },
  );
}

/**
 * Paginated list of fee accounts for the school. Used by
 * `app/api/fees/accounts/route.ts` GET (the wrapped handler
 * still drives caching).
 */
export async function listFeeAccounts(
  ctx: AuthContext,
  req: Request,
  filters: { termId?: string | null; classId?: string | null; status?: string | null } = {},
): Promise<{ items: unknown[]; total: number; page: number; limit: number; totalPages: number }> {
  const { page, limit, from, to } = paginated.parse(req);

  let query = scopedQuery(ctx, "fee_accounts")
    .select(`
      *,
      student:students!inner(id, full_name, admission_number, parent_phone, current_class_id),
      term:terms(id, name)
    `, { count: "exact" });

  if (filters.termId) query = query.eq("term_id", filters.termId);
  if (filters.status) {
    query = query.eq("status", filters.status as Database["public"]["Enums"]["fee_account_status"]);
  }
  if (filters.classId) {
    query = query.eq("student.current_class_id", filters.classId);
  }

  const { data, count, error } = await query
    .order("balance", { ascending: false })
    .range(from, to);

  if (error) {
    throw new AuthError(`Failed to load fee accounts: ${error.message}`, 400);
  }
  return paginated.envelope(data ?? [], count ?? 0, page, limit);
}

/**
 * Paginated list of fee payments for the school. Used by
 * `app/api/fees/payments/route.ts` GET. Filters by
 * student_id / fee_account_id / payment_method / date range.
 */
export async function listPayments(
  ctx: AuthContext,
  req: Request,
): Promise<{ items: unknown[]; total: number; page: number; limit: number; totalPages: number }> {
  const url = new URL(req.url);
  const { page, limit, from, to } = paginated.parse(req);
  const studentId = url.searchParams.get("student_id");
  const feeAccountId = url.searchParams.get("fee_account_id");
  const paymentMethod = url.searchParams.get("payment_method");
  const dateFrom = url.searchParams.get("date_from");
  const dateTo = url.searchParams.get("date_to");

  let query = scopedQuery(ctx, "fee_payments")
    .select(`
      *,
      student:students(full_name, admission_number),
      received_by:users!received_by_user_id(full_name)
    `, { count: "exact" })
    .eq("is_deleted", false);

  if (studentId) query = query.eq("student_id", studentId);
  if (feeAccountId) query = query.eq("fee_account_id", feeAccountId);
  if (paymentMethod) {
    query = query.eq("payment_method", paymentMethod as Database["public"]["Enums"]["payment_method"]);
  }
  if (dateFrom) query = query.gte("payment_date", dateFrom);
  if (dateTo) query = query.lte("payment_date", dateTo);

  const { data, count, error } = await query
    .order("created_at", { ascending: false })
    .range(from, to);

  if (error) {
    throw new AuthError(`Failed to load payments: ${error.message}`, 400);
  }
  return paginated.envelope(data ?? [], count ?? 0, page, limit);
}
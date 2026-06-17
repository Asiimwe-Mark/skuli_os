import { NextRequest } from "next/server";
import crypto from "crypto";
import type { Database } from "@/types/database";
import { createAdminClient } from "@/lib/supabase/admin";
import { verifyWebhookSignature } from "@/lib/africas-talking/webhooks";

// Africa's Talking signs webhook bodies with HMAC-SHA256 base64.
// The shared helper handles base64/hex variants and timing-safe
// comparison; the inline implementation was duplicated here and in
// the sms webhook route, drifting from the helper's contract.
function verifyAtHmac(body: string, signature: string, secret: string): boolean {
  return verifyWebhookSignature(body, signature, secret, "base64");
}

/**
 * Build a unique, human-readable receipt number.
 *
 * We intentionally avoid the previous `count(*) + 1` scheme: it is not atomic
 * and two concurrent confirmations could mint the same number. The trailing
 * random suffix guarantees uniqueness without a DB round-trip.
 */
function buildReceiptNumber(schoolCode: string): string {
  const now = new Date();
  const yearMonth = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}`;
  const rand = crypto.randomBytes(3).toString("hex").toUpperCase(); // 6 hex chars
  return `SKULI-${schoolCode || "SCH"}-${yearMonth}-${rand}`;
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.text();
    const signature = request.headers.get("X-Africa-Talking-Signature") || "";

    // Verify HMAC signature
    const secret = process.env.AFRICAS_TALKING_WEBHOOK_SECRET || "";
    if (!secret) {
      return Response.json({ error: "Webhook not configured" }, { status: 500 });
    }

    if (!verifyAtHmac(body, signature, secret)) {
      return Response.json({ error: "Invalid signature" }, { status: 401 });
    }

    const data = JSON.parse(body);
    const supabase = createAdminClient();

    // We only act on successful confirmations. Anything else is acknowledged so
    // Africa's Talking stops retrying.
    if (data.status !== "Success" || !data.transactionId) {
      return Response.json({ status: "ok" });
    }

    // Look up any payment already keyed by this transaction id. The STK-push
    // routes create a `pending` row at initiation time, so this is the common
    // path. maybeSingle() avoids PGRST116 (which previously bubbled up as a 500
    // and made AT retry forever).
    const { data: existing } = await supabase
      .from("fee_payments")
      .select("id, status, fee_account_id, student_id, school_id")
      .eq("mobile_money_transaction_id", data.transactionId)
      .maybeSingle();

    // Already confirmed -> idempotent no-op.
    if (existing && existing.status === "confirmed") {
      return Response.json({ status: "ok" });
    }

    // Extract metadata that was set during the payment request.
    let metadata: Record<string, string> = {};
    try {
      metadata =
        typeof data.metadata === "string"
          ? JSON.parse(data.metadata)
          : data.metadata || {};
    } catch {
      metadata = {};
    }

    // -- Path 1: confirm the existing pending row --------------------------
    if (existing) {
      const schoolId = existing.school_id ?? metadata.school_id;
      let feeAccountId: string | null = existing.fee_account_id;

      // Resolve a fee account if the pending row didn't have one.
      if (!feeAccountId && existing.student_id && schoolId) {
        const { data: term } = await supabase
          .from("terms")
          .select("id")
          .eq("school_id", schoolId)
          .eq("is_current", true)
          .maybeSingle();
        if (term) {
          const { data: acct } = await supabase
            .from("fee_accounts")
            .select("id")
            .eq("student_id", existing.student_id)
            .eq("school_id", schoolId)
            .eq("term_id", term.id)
            .limit(1)
            .maybeSingle();
          feeAccountId = acct?.id ?? null;
        }
      }

      const { error: updateError } = await supabase
        .from("fee_payments")
        .update({
          status: "confirmed" as const,
          fee_account_id: feeAccountId ?? undefined,
          phone_used: data.phoneNumber || undefined,
          payment_date: new Date().toISOString().split("T")[0],
        })
        .eq("id", existing.id);

      if (updateError) {
        // Returning 500 lets AT retry; the idempotency guard above makes retries safe.
        return Response.json({ error: "Failed to confirm payment" }, { status: 500 });
      }

      if (feeAccountId) {
        await supabase.rpc("recalculate_fee_account", { p_account_id: feeAccountId });
      }

      await supabase.from("audit_logs").insert({
        school_id: schoolId ?? null,
        user_id: null,
        action: "mm_payment_confirmed",
        entity_type: "fee_payment",
        entity_id: existing.id,
        old_value: { status: "pending" },
        new_value: {
          transaction_id: data.transactionId,
          provider: data.provider,
          phone: data.phoneNumber,
        },
        ip_address: null,
      });

      return Response.json({ status: "ok" });
    }

    // -- Path 2: no prior row -> insert a confirmed payment (fallback) -----
    const { student_id, fee_account_id, school_id } = metadata;
    if (!student_id || !school_id) {
      // Not enough context to record the payment. Acknowledge to stop retries;
      // it can be reconciled manually from the provider dashboard.
      return Response.json({ status: "ok" });
    }

    const { data: school } = await supabase
      .from("schools")
      .select("school_code")
      .eq("id", school_id)
      .maybeSingle();

    const receiptNumber = buildReceiptNumber(school?.school_code || "SCH");

    const { error: insertError } = await supabase.from("fee_payments").insert({
      school_id,
      fee_account_id: fee_account_id || null,
      student_id,
      amount: parseFloat(data.amount),
      payment_method: "mobile_money" as const,
      mobile_money_provider: data.provider?.toLowerCase() || null,
      mobile_money_transaction_id: data.transactionId,
      phone_used: data.phoneNumber || null,
      received_by_user_id: metadata.received_by || null,
      payment_date: new Date().toISOString().split("T")[0],
      receipt_number: receiptNumber,
      status: "confirmed" as const,
      notes: null,
    } as Database["public"]["Tables"]["fee_payments"]["Insert"]);

    if (!insertError && fee_account_id) {
      await supabase.rpc("recalculate_fee_account", { p_account_id: fee_account_id });
    }

    await supabase.from("audit_logs").insert({
      school_id,
      user_id: null,
      action: "mm_payment_received",
      entity_type: "fee_payment",
      entity_id: null,
      old_value: null,
      new_value: {
        amount: data.amount,
        transaction_id: data.transactionId,
        provider: data.provider,
        phone: data.phoneNumber,
        receipt: receiptNumber,
      },
      ip_address: null,
    });

    return Response.json({ status: "ok" });
  } catch {
    return Response.json({ error: "Internal error" }, { status: 500 });
  }
}

import crypto from "crypto";
import type { Database } from "@/types/database";
import { publicRoute } from "@/lib/http";
import { createAdminClient } from "@/lib/supabase/admin";
import { verifyWebhookSignature } from "@/lib/africas-talking/webhooks";

// Africa's Talking signs webhook bodies with HMAC-SHA256 base64.
function verifyAtHmac(body: string, signature: string, secret: string): boolean {
  return verifyWebhookSignature(body, signature, secret, "base64");
}

/**
 * Build a unique, human-readable receipt number.
 *
 * Avoids the previous `count(*) + 1` scheme which was not atomic; the
 * trailing random suffix guarantees uniqueness without a DB round-trip.
 */
function buildReceiptNumber(schoolCode: string): string {
  const now = new Date();
  const yearMonth = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}`;
  const rand = crypto.randomBytes(3).toString("hex").toUpperCase();
  return `SKULI-${schoolCode || "SCH"}-${yearMonth}-${rand}`;
}

export const POST = publicRoute(async (request) => {
  const body = await request.text();
  const signature = request.headers.get("X-Africa-Talking-Signature") || "";

  const secret = process.env.AFRICAS_TALKING_WEBHOOK_SECRET || "";
  if (!secret) {
    return Response.json({ error: "Webhook not configured" }, { status: 500 });
  }

  if (!verifyAtHmac(body, signature, secret)) {
    return Response.json({ error: "Invalid signature" }, { status: 401 });
  }

  const data = JSON.parse(body);
  const supabase = createAdminClient();

  if (data.status !== "Success" || !data.transactionId) {
    return Response.json({ status: "ok" });
  }

  const { data: existing } = await supabase
    .from("fee_payments")
    .select("id, status, fee_account_id, student_id, school_id")
    .eq("mobile_money_transaction_id", data.transactionId)
    .maybeSingle();

  if (existing && existing.status === "confirmed") {
    return Response.json({ status: "ok" });
  }

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
    return Response.json({ status: "ok" });
  }

  const parsedAmount = Number.parseFloat(data.amount);
  if (!Number.isFinite(parsedAmount) || parsedAmount <= 0) {
    console.error(
      "[AT MM Webhook] Refusing to record payment with invalid amount:",
      data.amount,
    );
    return Response.json({ status: "ok" });
  }

  const { data: studentRow } = await supabase
    .from("students")
    .select("id, school_id")
    .eq("id", student_id)
    .maybeSingle();

  if (!studentRow || studentRow.school_id !== school_id) {
    console.error(
      "[AT MM Webhook] Cross-tenant metadata rejection:",
      { claimed_school: school_id, student_id },
    );
    return Response.json({ status: "ok" });
  }

  let resolvedFeeAccountId: string | null = null;
  if (fee_account_id) {
    const { data: acctRow } = await supabase
      .from("fee_accounts")
      .select("id, student_id, school_id")
      .eq("id", fee_account_id)
      .maybeSingle();
    if (
      !acctRow ||
      acctRow.student_id !== student_id ||
      acctRow.school_id !== school_id
    ) {
      console.error(
        "[AT MM Webhook] fee_account_id does not belong to student/school:",
        { fee_account_id, student_id, school_id },
      );
      return Response.json({ status: "ok" });
    }
    resolvedFeeAccountId = acctRow.id;
  }

  const { data: receiptData } = await supabase.rpc("generate_receipt_number", {
    p_school_id: school_id,
  } as never);
  const receiptNumber: string =
    (receiptData as unknown as string | null) ?? buildReceiptNumber("SCH");

  const { error: insertError } = await supabase.from("fee_payments").insert({
    school_id,
    fee_account_id: resolvedFeeAccountId,
    student_id,
    amount: parsedAmount,
    payment_method: "mobile_money" as const,
    mobile_money_provider: data.provider?.toLowerCase() || null,
    mobile_money_transaction_id: data.transactionId,
    phone_used: data.phoneNumber || null,
    received_by_user_id: null,
    payment_date: new Date().toISOString().split("T")[0],
    receipt_number: receiptNumber,
    status: "confirmed" as const,
    notes: null,
  } as Database["public"]["Tables"]["fee_payments"]["Insert"]);

  if (insertError?.code === "23505") {
    return Response.json({ status: "ok" });
  }

  if (!insertError && resolvedFeeAccountId) {
    await supabase.rpc("recalculate_fee_account", {
      p_account_id: resolvedFeeAccountId,
    });
  }

  await supabase.from("audit_logs").insert({
    school_id,
    user_id: null,
    action: "mm_payment_received",
    entity_type: "fee_payment",
    entity_id: null,
    old_value: null,
    new_value: {
      amount: parsedAmount,
      transaction_id: data.transactionId,
      provider: data.provider,
      phone: data.phoneNumber,
      receipt: receiptNumber,
    },
    ip_address: null,
  });

  return Response.json({ status: "ok" });
});
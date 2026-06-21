import { publicRoute } from "@/lib/http";
import { createAdminClient } from "@/lib/supabase/admin";
import { getTransactionStatus } from "@/lib/gateways/pesapal";
import { dispatchNotifications } from "@/lib/services/notifications";
import { queueDisbursementBatch } from "@/lib/services/payroll-disbursement";

/**
 * Pesapal IPN handler.
 *
 * SECURITY: Pesapal sends IPN notifications as GET requests with query params.
 * The params are UNTRUSTED. We ALWAYS call getTransactionStatus() for
 * server-to-server verification before mutating any record to a terminal state,
 * and ALWAYS return HTTP 200 so Pesapal does not retry endlessly.
 */
export const GET = publicRoute(async (request) => {
  const { searchParams } = new URL(request.url);
  const orderTrackingId = searchParams.get("OrderTrackingId");
  const merchantReference = searchParams.get("OrderMerchantReference");

  if (!orderTrackingId || !merchantReference) {
    return Response.json({ status: "ignored", reason: "missing params" });
  }

  // -- SECURITY CHECKPOINT: server-to-server verification ---------------
  const verifiedStatus = await getTransactionStatus(orderTrackingId);
  if (verifiedStatus.error) {
    console.error("[Pesapal Webhook] Verification error:", verifiedStatus.error);
    return Response.json({ status: "verification_failed" });
  }

  const supabase = createAdminClient();
  const isCompleted = verifiedStatus.paymentStatus === "COMPLETED";

  // -- SECURITY: amount must match what we expect ---------------------
  const verifiedAmount = Number(verifiedStatus.amount);
  const AMOUNT_TOLERANCE = 0.01;

  const insertMismatchAudit = async (params: {
    schoolId: string | null;
    route: string;
    expected: number;
    paid: number;
    reference: string;
  }) => {
    try {
      await supabase.from("audit_logs").insert({
        school_id: params.schoolId,
        user_id: null,
        action: "pesapal_amount_mismatch",
        entity_type: params.route,
        entity_id: params.reference,
        old_value: null,
        new_value: {
          expected_amount: params.expected,
          verified_amount: params.paid,
          order_tracking_id: orderTrackingId,
          merchant_reference: merchantReference,
        },
        ip_address: null,
      } as never);
    } catch (auditErr) {
      console.error("[Pesapal Webhook] Failed to log amount mismatch:", auditErr);
    }
  };

  // -- Route 1: Tuition Payment ------------------------------------
  const { data: tuitionPayment } = await supabase
    .from("tuition_payments")
    .select("id, school_id, student_id, fee_account_id, amount, status")
    .eq("id", merchantReference)
    .maybeSingle();

  if (
    tuitionPayment &&
    (tuitionPayment as { status: string }).status === "PENDING"
  ) {
    const tp = tuitionPayment as unknown as {
      id: string;
      school_id: string;
      amount: number | null;
    };
    const newStatus = isCompleted ? "COMPLETED" : "FAILED";

    if (isCompleted) {
      const expected = Number(tp.amount ?? 0);
      if (
        !Number.isFinite(verifiedAmount) ||
        verifiedAmount + AMOUNT_TOLERANCE < expected
      ) {
        await insertMismatchAudit({
          schoolId: tp.school_id,
          route: "tuition_payment",
          expected,
          paid: verifiedAmount,
          reference: tp.id,
        });
        await supabase
          .from("tuition_payments")
          .update({
            status: "FAILED",
            notes: `Amount mismatch: expected ${expected}, verified ${verifiedAmount}`,
            updated_at: new Date().toISOString(),
          } as never)
          .eq("id", tp.id);
        return Response.json({ status: "ok", processed: "tuition_payment_underpaid" });
      }
    }

    await supabase.rpc("confirm_tuition_payment", {
      p_tuition_payment_id: tp.id,
      p_pesapal_tracking_id: orderTrackingId,
      p_new_status: newStatus,
      p_verified_amount: verifiedAmount,
    } as never);

    if (isCompleted) {
      await dispatchNotifications({
        schoolId: tp.school_id,
        relatedEntityType: "tuition_payment",
        relatedEntityId: tp.id,
        channels: ["IN_APP", "SMS"],
      }).catch((err) => console.error("[Notifications] Failed:", err));
    }

    return Response.json({ status: "ok", processed: "tuition_payment" });
  }

  // -- Route 2: Payroll Funding ------------------------------------
  const { data: payrollBatch } = await supabase
    .from("payroll_batches")
    .select(
      "id, school_id, funding_payment_status, total_payout_sum, total_net_salaries, total_overhead_fees",
    )
    .eq("pesapal_funding_ref", merchantReference)
    .maybeSingle();

  if (
    payrollBatch &&
    (payrollBatch as { funding_payment_status: string })
      .funding_payment_status === "AWAITING_EXTERNAL_FUNDING"
  ) {
    const pb = payrollBatch as unknown as {
      id: string;
      school_id: string;
      total_payout_sum: number | null;
    };

    if (isCompleted) {
      const expected = Number(pb.total_payout_sum ?? 0);
      if (
        !Number.isFinite(verifiedAmount) ||
        verifiedAmount + AMOUNT_TOLERANCE < expected
      ) {
        await insertMismatchAudit({
          schoolId: pb.school_id,
          route: "payroll_funding",
          expected,
          paid: verifiedAmount,
          reference: pb.id,
        });
        await supabase
          .from("payroll_batches")
          .update({
            funding_payment_status: "FAILED",
            pesapal_order_tracking_id: orderTrackingId,
            funded_at: null,
            updated_at: new Date().toISOString(),
          } as never)
          .eq("id", pb.id);
        return Response.json({ status: "ok", processed: "payroll_funding_underpaid" });
      }
    }

    const newStatus = isCompleted ? "SUCCESS" : "FAILED";

    await supabase
      .from("payroll_batches")
      .update({
        funding_payment_status: newStatus,
        pesapal_order_tracking_id: orderTrackingId,
        funded_at: isCompleted ? new Date().toISOString() : null,
        updated_at: new Date().toISOString(),
      } as never)
      .eq("id", pb.id);

    if (isCompleted) {
      await queueDisbursementBatch(pb.id).catch((err) =>
        console.error("[Payroll Disbursement] Queue failed:", err),
      );
    }

    return Response.json({ status: "ok", processed: "payroll_funding" });
  }

  // -- Route 3: Subscription Payment --------------------------------
  const { data: invoice } = await supabase
    .from("subscription_invoices")
    .select("id, school_id, plan, status, amount")
    .eq("pesapal_tx_id", merchantReference)
    .maybeSingle();

  if (
    invoice &&
    (invoice as { status: string }).status === "pending" &&
    isCompleted
  ) {
    const inv = invoice as unknown as {
      id: string;
      school_id: string;
      plan: string;
      amount: number | null;
    };
    const expected = Number(inv.amount ?? 0);
    if (
      !Number.isFinite(verifiedAmount) ||
      verifiedAmount + AMOUNT_TOLERANCE < expected
    ) {
      await insertMismatchAudit({
        schoolId: inv.school_id,
        route: "subscription",
        expected,
        paid: verifiedAmount,
        reference: inv.id,
      });
      await supabase
        .from("subscription_invoices")
        .update({
          status: "failed",
          updated_at: new Date().toISOString(),
        } as never)
        .eq("id", inv.id);
      return Response.json({ status: "ok", processed: "subscription_underpaid" });
    }

    await supabase
      .from("subscription_invoices")
      .update({
        status: "paid",
        paid_at: new Date().toISOString(),
        pesapal_tx_id: orderTrackingId,
        amount: verifiedAmount,
        updated_at: new Date().toISOString(),
      } as never)
      .eq("id", inv.id);

    await supabase
      .from("schools")
      .update({
        subscription_plan: inv.plan,
        subscription_status: "active",
        trial_ends_at: null,
        updated_at: new Date().toISOString(),
      } as never)
      .eq("id", inv.school_id);

    await supabase.from("audit_logs").insert({
      school_id: inv.school_id,
      user_id: null,
      action: "subscription_payment_confirmed_pesapal",
      entity_type: "subscription_invoice",
      entity_id: inv.id,
      old_value: null,
      new_value: {
        plan: inv.plan,
        amount: verifiedAmount,
        pesapal_tracking_id: orderTrackingId,
      },
      ip_address: null,
    } as never);

    return Response.json({ status: "ok", processed: "subscription" });
  }

  return Response.json({ status: "ok", processed: "no_match" });
});
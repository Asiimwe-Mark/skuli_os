import { NextRequest } from "next/server";
import crypto from "crypto";
import type { Database } from "@/types/database";
import { createAdminClient } from "@/lib/supabase/admin";

type SubscriptionInvoiceRow = Database["public"]["Tables"]["subscription_invoices"]["Row"];
type SchoolRow = Database["public"]["Tables"]["schools"]["Row"];

function verifyHmac(body: string, signature: string, secret: string): boolean {
  if (!secret || !signature) return false;
  const hash = crypto.createHmac("sha256", secret).update(body).digest("hex");
  try {
    return crypto.timingSafeEqual(Buffer.from(hash), Buffer.from(signature));
  } catch {
    return false;
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.text();
    const signature = request.headers.get("verif-hash") || "";

    // Flutterwave uses SHA256 hash of the body with the secret
    const secret = process.env.FLUTTERWAVE_WEBHOOK_SECRET || "";
    if (!secret) {
      return Response.json({ error: "Webhook not configured" }, { status: 500 });
    }

    // Flutterwave sends the secret hash directly (not HMAC), so compare directly
    if (signature !== secret) {
      return Response.json({ error: "Invalid signature" }, { status: 401 });
    }

    const data = JSON.parse(body);
    const supabase = createAdminClient();

    // Handle successful charge
    if (data.event === "charge.completed" && data.data?.status === "successful") {
      const txRef = data.data.tx_ref;
      const flutterwaveTxId = data.data.id?.toString();
      const amount = data.data.amount;
      const currency = data.data.currency;

      // Check if invoice already exists for this transaction
      const { data: existing } = await supabase
        .from("subscription_invoices")
        .select("id")
        .eq("flutterwave_tx_id", flutterwaveTxId)
        .single();

      if (existing) {
        return Response.json({ status: "ok" });
      }

      // Extract metadata
      const meta = data.data.meta || {};
      const schoolId = meta.school_id;
      const plan = meta.plan || "growth";

      if (schoolId) {
        // Create subscription invoice
        const periodStart = new Date();
        const periodEnd = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

        await supabase.from("subscription_invoices").insert({
          school_id: schoolId,
          flutterwave_tx_id: flutterwaveTxId,
          plan,
          amount,
          currency: currency || "UGX",
          period_start: periodStart.toISOString(),
          period_end: periodEnd.toISOString(),
          status: "paid",
          paid_at: new Date().toISOString(),
        });

        // Update school subscription
        await supabase
          .from("schools")
          .update({
            subscription_plan: plan,
            subscription_status: "active",
            trial_ends_at: null,
          })
          .eq("id", schoolId);

        // Audit log
        await supabase.from("audit_logs").insert({
          school_id: schoolId,
          action: "subscription_payment_received",
          entity_type: "subscription_invoice",
          new_value: {
            plan,
            amount,
            currency,
            flutterwave_tx_id: flutterwaveTxId,
            period_start: periodStart.toISOString(),
            period_end: periodEnd.toISOString(),
          },
        });
      }
    }

    // Handle subscription charge events
    if (data.event === "subscription.completed") {
      const subData = data.data;
      if (subData?.meta?.school_id) {
        await supabase
          .from("schools")
          .update({ subscription_status: "active" })
          .eq("id", subData.meta.school_id);
      }
    }

    return Response.json({ status: "ok" });
  } catch {
    return Response.json({ error: "Internal error" }, { status: 500 });
  }
}

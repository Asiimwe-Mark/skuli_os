import { NextRequest } from "next/server";
import crypto from "crypto";
import type { Database } from "@/types/database";
import { createAdminClient } from "@/lib/supabase/admin";

type FeePaymentRow = Database["public"]["Tables"]["fee_payments"]["Row"];
type SchoolRow = Database["public"]["Tables"]["schools"]["Row"];

function verifyHmac(body: string, signature: string, secret: string): boolean {
  if (!secret || !signature) return false;
  const hash = crypto.createHmac("sha256", secret).update(body).digest("base64");
  try {
    return crypto.timingSafeEqual(Buffer.from(hash), Buffer.from(signature));
  } catch {
    return false;
  }
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

    if (!verifyHmac(body, signature, secret)) {
      return Response.json({ error: "Invalid signature" }, { status: 401 });
    }

    const data = JSON.parse(body);
    const supabase = createAdminClient();

    // Process mobile money payment confirmation
    if (data.status === "Success" && data.transactionId) {
      // Check if payment already recorded via this transaction ID
      const { data: existing } = await supabase
        .from("fee_payments")
        .select("id")
        .eq("mobile_money_transaction_id", data.transactionId)
        .single();

      if (existing) {
        // Already processed, just return ok
        return Response.json({ status: "ok" });
      }

      // Extract metadata from the callback
      // Africa's Talking sends metadata that was set during the payment request
      let metadata: Record<string, string> = {};
      try {
        metadata = typeof data.metadata === "string" ? JSON.parse(data.metadata) : (data.metadata || {});
      } catch {
        metadata = {};
      }

      const { student_id, fee_account_id, school_id } = metadata;

      if (student_id && fee_account_id && school_id) {
        // Get school code for receipt number
        const { data: school } = await supabase
          .from("schools")
          .select("school_code")
          .eq("id", school_id)
          .single();

        const { count } = await supabase
          .from("fee_payments")
          .select("*", { count: "exact", head: true })
          .eq("school_id", school_id);

        const seq = (count ?? 0) + 1;
        const now = new Date();
        const yearMonth = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}`;
        const receiptNumber = `SKULI-${school?.school_code || "SCH"}-${yearMonth}-${String(seq).padStart(5, "0")}`;

        // Create payment record
        const { error: insertError } = await supabase.from("fee_payments").insert({
          school_id,
          fee_account_id,
          student_id,
          amount: parseFloat(data.amount),
          payment_method: "mobile_money",
          mobile_money_provider: data.provider?.toLowerCase() || null,
          mobile_money_transaction_id: data.transactionId,
          phone_used: data.phoneNumber || null,
          received_by_user_id: metadata.received_by || null,
          payment_date: new Date().toISOString().split("T")[0],
          receipt_number: receiptNumber,
          status: "confirmed",
        });

        if (!insertError) {
          // Recalculate fee account
          await supabase.rpc("recalculate_fee_account", { account_id: fee_account_id });

          // Audit log
          await supabase.from("audit_logs").insert({
            school_id,
            action: "mm_payment_received",
            entity_type: "fee_payment",
            new_value: {
              amount: data.amount,
              transaction_id: data.transactionId,
              provider: data.provider,
              phone: data.phoneNumber,
              receipt: receiptNumber,
            },
          });
        }
      }
    }

    return Response.json({ status: "ok" });
  } catch {
    return Response.json({ error: "Internal error" }, { status: 500 });
  }
}

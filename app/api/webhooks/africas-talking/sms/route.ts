import { NextRequest } from "next/server";
import crypto from "crypto";
import type { Database } from "@/types/database";
import { createAdminClient } from "@/lib/supabase/admin";

type SmsLogRow = Database["public"]["Tables"]["sms_logs"]["Row"];

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

    // Africa's Talking delivers SMS status callbacks with messageId and status
    if (data.id) {
      const statusMap: Record<string, string> = {
        Success: "delivered",
        Sent: "sent",
        Queued: "pending",
        Failed: "failed",
        Rejected: "failed",
      };

      const newStatus = statusMap[data.status] || "failed";

      const { error } = await supabase
        .from("sms_logs")
        .update({
          status: newStatus,
          africa_talking_message_id: data.id,
          sent_at: newStatus === "delivered" ? new Date().toISOString() : undefined,
        })
        .eq("africa_talking_message_id", data.id);

      if (error) {
        // If no match by message_id, try by phone number
        if (data.number) {
          await supabase
            .from("sms_logs")
            .update({
              status: newStatus,
              africa_talking_message_id: data.id,
            })
            .eq("recipient_phone", data.number)
            .eq("status", "pending")
            .order("created_at", { ascending: false })
            .limit(1);
        }
      }
    }

    return Response.json({ status: "ok" });
  } catch {
    return Response.json({ error: "Internal error" }, { status: 500 });
  }
}

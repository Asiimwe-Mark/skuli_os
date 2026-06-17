import webpush from "web-push";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";

let vapidConfigured = false;

function ensureVapid() {
  if (vapidConfigured) return;
  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  if (publicKey && privateKey) {
    webpush.setVapidDetails("mailto:admin@skuli.app", publicKey, privateKey);
    vapidConfigured = true;
  }
}

interface PushPayload {
  title: string;
  body: string;
  url?: string;
}

/**
 * Send a push notification to all active subscriptions for a user.
 * Removes subscriptions that return 410 Gone (expired/invalid).
 * Returns the number of successful deliveries.
 */
export async function sendPushToUser(
  supabase: SupabaseClient<Database>,
  userId: string,
  payload: PushPayload
): Promise<{ sent: number }> {
  ensureVapid();
  const { data: subscriptions } = await supabase
    .from("push_subscriptions")
    .select("id, endpoint, p256dh, auth")
    .eq("user_id", userId)
    .eq("is_deleted", false);

  if (!subscriptions || subscriptions.length === 0) {
    return { sent: 0 };
  }

  let sent = 0;

  for (const sub of subscriptions) {
    try {
      await webpush.sendNotification(
        {
          endpoint: sub.endpoint,
          keys: { p256dh: sub.p256dh, auth: sub.auth },
        },
        JSON.stringify(payload)
      );
      sent++;
    } catch (err: unknown) {
      const status =
        err && typeof err === "object" && "statusCode" in err
          ? (err as { statusCode: number }).statusCode
          : 0;

      if (status === 410) {
        // Subscription expired — soft-delete
        await supabase
          .from("push_subscriptions")
          .update({ is_deleted: true })
          .eq("id", sub.id);
      }
      // Other errors: log but continue to other subscriptions
      console.error(`Push failed for subscription ${sub.id}:`, err);
    }
  }

  return { sent };
}

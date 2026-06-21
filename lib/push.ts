import webpush from "web-push";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";

let vapidConfigured = false;
let vapidWarnedMissing = false;

function ensureVapid(): boolean {
  if (vapidConfigured) return true;
  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  if (publicKey && privateKey) {
    webpush.setVapidDetails("mailto:admin@skuli.app", publicKey, privateKey);
    vapidConfigured = true;
    return true;
  }
  // §14.7: explicit, single-line warning so a misconfigured deploy
  // is loud in the logs instead of silently no-op'ing. The previous
  // implementation swallowed the gap, so a broken VAPID config and a
  // healthy one looked identical from the call site.
  if (!vapidWarnedMissing) {
    // eslint-disable-next-line no-console
    console.warn(
      "[push] VAPID keys are not configured (NEXT_PUBLIC_VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY). " +
        "Web push notifications will silently no-op. Run the env validation in lib/env.ts to see the startup warning.",
    );
    vapidWarnedMissing = true;
  }
  return false;
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
  if (!ensureVapid()) {
    return { sent: 0 };
  }
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

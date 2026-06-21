import { route, dbError } from "@/lib/http";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendPushToUser } from "@/lib/push";

export const POST = route({
  roles: ["SUPER_ADMIN"],
  noSchoolRequired: true,
  handler: async () => {
    const adminClient = createAdminClient();

    const { data: items, error: fetchError } = await adminClient
      .from("push_queue")
      .select("id, user_id, title, body, url")
      .eq("status", "pending")
      .order("created_at", { ascending: true })
      .limit(100);

    if (fetchError) return dbError(fetchError, "Failed to fetch data");
    if (!items || items.length === 0) return { processed: 0, sent: 0 };

    let totalSent = 0;

    for (const item of items) {
      try {
        const { sent } = await sendPushToUser(adminClient, item.user_id, {
          title: item.title,
          body: item.body,
          url: item.url || undefined,
        });

        await adminClient
          .from("push_queue")
          .update({ status: "sent", sent_at: new Date().toISOString() })
          .eq("id", item.id);

        totalSent += sent;
      } catch (err: unknown) {
        const errorMsg = err instanceof Error ? err.message : "Unknown error";
        await adminClient
          .from("push_queue")
          .update({ status: "failed", error: errorMsg })
          .eq("id", item.id);
      }
    }

    return { processed: items.length, sent: totalSent };
  },
});
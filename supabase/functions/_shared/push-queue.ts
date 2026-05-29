// supabase/functions/_shared/push-queue.ts
// Helper for edge functions to queue push notifications

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function queuePushNotification(
  supabase: any,
  userId: string,
  payload: { title: string; body: string; url?: string }
): Promise<void> {
  const { error } = await supabase.from("push_queue").insert({
    user_id: userId,
    title: payload.title,
    body: payload.body,
    url: payload.url || null,
  });

  if (error) {
    console.error("Failed to queue push notification:", error);
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function getParentUserId(
  supabase: any,
  parentPhone: string
): Promise<string | null> {
  const { data } = await supabase
    .from("users")
    .select("id")
    .eq("phone", parentPhone)
    .eq("role", "PARENT")
    .single();

  return data?.id || null;
}

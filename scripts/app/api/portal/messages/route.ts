import {
  getSupabaseAndUser,
  requireRole,
  successResponse,
  errorResponse,
  getErrorStatus,
} from "@/lib/api-helpers";

export async function GET() {
  try {
    const ctx = await getSupabaseAndUser();
    requireRole(ctx, ["PARENT"]);

    // Audit 4.13: the SMS query needs user.phone to scope. We fetch
    // the phone first (small indexed lookup), then run the two
    // message queries in parallel. This was 3 sequential round-trips
    // before; now it's 1 + 2 with the two slow queries overlapping.
    const { data: user } = await ctx.supabase
      .from("users")
      .select("phone")
      .eq("id", ctx.user.id)
      .single();

    const phone = (user as { phone?: string | null } | null)?.phone ?? null;

    const [notificationsResult, smsResult] = await Promise.all([
      ctx.supabase
        .from("in_app_notifications")
        .select("id, title, body, type, is_read, created_at")
        .eq("recipient_user_id", ctx.user.id)
        .order("created_at", { ascending: false })
        .limit(50),
      phone
        ? ctx.supabase
            .from("sms_logs")
            .select("id, message_body, recipient_phone, status, created_at, message_type")
            .eq("recipient_phone", phone)
            .order("created_at", { ascending: false })
            .limit(50)
        : Promise.resolve({ data: [], error: null }),
    ]);

    const notifications = notificationsResult.data ?? [];
    const smsLogs = smsResult.data ?? [];

    const messages: Array<Record<string, unknown>> = [];

    // SMS logs sent to this parent
    for (const sms of smsLogs as { id: string; message_body: string; created_at: string; message_type: string | null }[]) {
      messages.push({
        id: sms.id,
        source: "sms",
        body: sms.message_body,
        sent_at: sms.created_at,
        is_read: true,
        type: sms.message_type ?? "sms",
      });
    }

    for (const n of notifications as { id: string; title: string; body: string; is_read: boolean; created_at: string; type: string | null }[]) {
      messages.push({
        id: n.id,
        source: "in_app",
        title: n.title,
        body: n.body,
        sent_at: n.created_at,
        is_read: n.is_read,
        type: n.type ?? "notification",
      });
    }

    // Sort combined by sent_at DESC, limit 100
    messages.sort(
      (a, b) => new Date(b.sent_at as string).getTime() - new Date(a.sent_at as string).getTime()
    );

    return successResponse(messages.slice(0, 100));
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Internal server error";
    const status = getErrorStatus(err);
    return errorResponse(message, status);
  }
}

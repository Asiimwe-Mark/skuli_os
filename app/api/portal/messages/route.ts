import {
  getSupabaseAndUser,
  requireRole,
  successResponse,
  errorResponse,
} from "@/lib/api-helpers";

export async function GET() {
  try {
    const ctx = await getSupabaseAndUser();
    requireRole(ctx, ["PARENT"]);

    // Get user phone for SMS lookup
    const { data: user } = await ctx.supabase
      .from("users")
      .select("phone")
      .eq("id", ctx.user.id)
      .single();

    const messages: any[] = [];

    // SMS logs sent to this parent
    if (user?.phone) {
      const { data: smsLogs } = await ctx.supabase
        .from("sms_logs")
        .select("id, message, recipient_phone, status, created_at, type")
        .eq("recipient_phone", user.phone)
        .order("created_at", { ascending: false })
        .limit(50);

      for (const sms of smsLogs ?? []) {
        messages.push({
          id: sms.id,
          source: "sms",
          body: sms.message,
          sent_at: sms.created_at,
          is_read: true, // SMS are always "read"
          type: sms.type ?? "sms",
        });
      }
    }

    // In-app notifications for this user
    const { data: notifications } = await ctx.supabase
      .from("in_app_notifications")
      .select("id, title, body, type, is_read, created_at")
      .eq("recipient_user_id", ctx.user.id)
      .order("created_at", { ascending: false })
      .limit(50);

    for (const n of notifications ?? []) {
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
      (a, b) => new Date(b.sent_at).getTime() - new Date(a.sent_at).getTime()
    );

    return successResponse(messages.slice(0, 100));
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Internal server error";
    const status = err instanceof Error && "status" in err ? (err as any).status : 500;
    return errorResponse(message, status);
  }
}

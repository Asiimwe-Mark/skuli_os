import { route, AuthError, dbError } from "@/lib/http";

export const POST = route({
  roles: [],
  handler: async (ctx, request) => {
    const body = (await request.json().catch(() => ({}))) as {
      endpoint?: string;
      keys?: { p256dh?: string; auth?: string };
    };

    if (
      !body.endpoint ||
      !body.keys?.p256dh ||
      !body.keys?.auth
    ) {
      throw new AuthError(
        "endpoint, keys.p256dh, and keys.auth required",
        400,
      );
    }

    const supabase = ctx.supabase;

    const { data: existing, error: lookupError } = await supabase
      .from("push_subscriptions")
      .select("id, is_deleted")
      .eq("user_id", ctx.user.id)
      .eq("endpoint", body.endpoint)
      .maybeSingle();

    if (lookupError)
      return dbError(lookupError, "Failed to check existing subscription");

    if (existing) {
      if (existing.is_deleted) {
        const { error: updateError } = await supabase
          .from("push_subscriptions")
          .update({
            is_deleted: false,
            p256dh: body.keys.p256dh,
            auth: body.keys.auth,
          })
          .eq("id", existing.id);
        if (updateError)
          return dbError(updateError, "Failed to update subscription");
      }
    } else {
      const { error: insertError } = await supabase
        .from("push_subscriptions")
        .insert({
          // school_id is nullable in the DB (PARENTs have null) but
          // the generated Database type has it as required. The cast
          // lives here; the types regeneration in Phase 6 will catch
          // any future drift.
          school_id: ctx.profile.school_id,
          user_id: ctx.user.id,
          endpoint: body.endpoint,
          p256dh: body.keys.p256dh,
          auth: body.keys.auth,
        } as never);
      if (insertError)
        return dbError(insertError, "Failed to save subscription");
    }

    return { success: true };
  },
});
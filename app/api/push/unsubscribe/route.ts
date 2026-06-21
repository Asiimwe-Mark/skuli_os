import { route, AuthError } from "@/lib/http";

export const POST = route({
  roles: [],
  handler: async (ctx, request) => {
    const body = (await request.json().catch(() => ({}))) as {
      endpoint?: string;
    };

    if (!body.endpoint) {
      throw new AuthError("endpoint required", 400);
    }

    await ctx.supabase
      .from("push_subscriptions")
      .update({ is_deleted: true })
      .eq("user_id", ctx.user.id)
      .eq("endpoint", body.endpoint);

    return { unsubscribed: true };
  },
});
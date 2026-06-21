import { route, AuthError } from "@/lib/http";
import { sendPushToUser } from "@/lib/push";

export const POST = route({
  roles: ["SCHOOL_ADMIN", "BURSAR", "SUPER_ADMIN"],
  handler: async (ctx, request) => {
    const schoolId = ctx.profile.school_id!;
    const body = (await request.json().catch(() => ({}))) as {
      userId?: string;
      title?: string;
      body?: string;
      url?: string;
    };

    if (!body.userId || !body.title || !body.body) {
      throw new AuthError("userId, title, and body are required", 400);
    }

    const { data: targetUser } = await ctx.supabase
      .from("users")
      .select("id")
      .eq("id", body.userId)
      .eq("school_id", schoolId)
      .single();

    if (!targetUser) {
      throw new AuthError("User not found in this school", 404);
    }

    const { sent } = await sendPushToUser(ctx.supabase, body.userId, {
      title: body.title,
      body: body.body,
      url: body.url,
    });

    return { sent };
  },
});
import { route, AuthError } from "@/lib/http";
import { inviteUserSchema } from "@/lib/validations/settings";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendInviteEmail } from "@/lib/email/send";
import { checkRateLimitAsync } from "@/lib/utils/rate-limit";

export const POST = route({
  roles: ["SCHOOL_ADMIN", "SUPER_ADMIN"],
  schema: inviteUserSchema,
  handler: async (ctx, body) => {
    const schoolId = ctx.profile.school_id!;

    // Rate limit invites to curb abuse (and accidental loops): 10/hour per user.
    const rl = await checkRateLimitAsync(
      `invite:${ctx.user.id}`,
      10,
      60 * 60 * 1000,
    );
    if (!rl.success) {
      throw new AuthError("Too many invitations. Please try again later.", 429);
    }

    const { email, role, full_name } = body;
    const supabase = ctx.supabase;
    const adminClient = createAdminClient();

    const { data: existingUser } = await supabase
      .from("users")
      .select("id")
      .eq("email", email)
      .maybeSingle();

    if (existingUser) {
      throw new AuthError("A user with this email already exists", 400);
    }

    const { data: authData, error: authError } =
      await adminClient.auth.admin.inviteUserByEmail(email, {
        redirectTo: `${process.env.NEXT_PUBLIC_APP_URL || "https://skuli.app"}/auth/callback?next=/portal/set-password`,
        data: { full_name },
      });

    if (authError || !authData.user) {
      throw new AuthError(authError?.message || "Failed to create user", 400);
    }

    const { error: profileError } = await supabase
      .from("users")
      .upsert(
        {
          id: authData.user.id,
          school_id: schoolId,
          role,
          full_name,
          phone: null,
          email,
          avatar_url: null,
          is_active: true,
        },
        { onConflict: "id" },
      );

    if (profileError) {
      await adminClient.auth.admin.deleteUser(authData.user.id);
      throw new AuthError("Failed to create user profile", 500);
    }

    const { data: school } = await supabase
      .from("schools")
      .select("name")
      .eq("id", schoolId)
      .single();

    try {
      const loginUrl = `${process.env.NEXT_PUBLIC_APP_URL || "https://skuli.app"}/auth/callback?next=/portal/set-password`;
      await sendInviteEmail(email, school?.name || "Your School", full_name, loginUrl);
    } catch {
      // Don't fail invitation if email fails
    }

    await supabase.from("audit_logs").insert({
      school_id: schoolId,
      user_id: ctx.user.id,
      action: "user_invited",
      entity_type: "user",
      entity_id: authData.user.id,
      old_value: null,
      new_value: { email, role, full_name },
      ip_address: null,
    });

    return {
      user_id: authData.user.id,
      email,
      role,
      message: `Invitation sent to ${email}. They will receive a secure one-time link to set their password.`,
    };
  },
});
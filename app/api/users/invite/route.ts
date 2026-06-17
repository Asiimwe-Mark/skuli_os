import { NextRequest } from "next/server";
import crypto from "crypto";
import {
  getSupabaseAndUser,
  requireSchool,
  requireRole,
  successResponse,
  errorResponse,
} from "@/lib/api-helpers";
import { inviteUserSchema } from "@/lib/validations/settings";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendInviteEmail } from "@/lib/email/send";
import { checkRateLimitAsync } from "@/lib/utils/rate-limit";

export async function POST(request: NextRequest) {
  try {
    const ctx = await getSupabaseAndUser();
    const schoolId = requireSchool(ctx);
    requireRole(ctx, ["SCHOOL_ADMIN", "SUPER_ADMIN"]);

    // Rate limit invites to curb abuse (and accidental loops): 10/hour per user.
    const rl = await checkRateLimitAsync(`invite:${ctx.user.id}`, 10, 60 * 60 * 1000);
    if (!rl.success) {
      return errorResponse("Too many invitations. Please try again later.", 429);
    }

    const body = await request.json();
    const parsed = inviteUserSchema.safeParse(body);
    if (!parsed.success) {
      return errorResponse(parsed.error.issues[0].message, 400);
    }

    const { email, role, full_name } = parsed.data;
    const supabase = ctx.supabase;
    const adminClient = createAdminClient();

    // Check if user already exists with this email (direct DB lookup instead of listUsers)
    const { data: existingUser } = await supabase
      .from("users")
      .select("id")
      .eq("email", email)
      .maybeSingle();

    if (existingUser) {
      return errorResponse("A user with this email already exists", 400);
    }

    // Generate a cryptographically secure temporary password
    const tempPassword = `Skuli-${crypto.randomBytes(12).toString("base64url")}!`;

    // Create auth user
    const { data: authData, error: authError } =
      await adminClient.auth.admin.createUser({
        email,
        password: tempPassword,
        email_confirm: true,
        user_metadata: {
          full_name,
          role,
          school_id: schoolId,
        },
      });

    if (authError || !authData.user) {
      return errorResponse(
        authError?.message || "Failed to create user",
        400
      );
    }

    // The handle_new_user trigger should auto-create the user profile,
    // but let's ensure it exists with correct data
    const { error: profileError } = await supabase.from("users").upsert(
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
      { onConflict: "id" }
    );

    if (profileError) {
      // Clean up auth user if profile creation fails
      await adminClient.auth.admin.deleteUser(authData.user.id);
      return errorResponse("Failed to create user profile", 500);
    }

    // Get school name for the email
    const { data: school } = await supabase
      .from("schools")
      .select("name")
      .eq("id", schoolId)
      .single();

    // Send invite email with temporary password
    try {
      const loginUrl = `${process.env.NEXT_PUBLIC_APP_URL || "https://skuli.app"}/login`;
      await sendInviteEmail(
        email,
        school?.name || "Your School",
        full_name,
        loginUrl,
        tempPassword
      );
    } catch {
      // Don't fail invitation if email fails
    }

    // Audit log
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

    return successResponse({
      user_id: authData.user.id,
      email,
      role,
      message: `Invitation sent to ${email}. They will receive login credentials via email.`,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Internal server error";
    const status =
      err instanceof Error && "status" in err
        ? (err as { status: number }).status
        : 500;
    return errorResponse(message, status);
  }
}

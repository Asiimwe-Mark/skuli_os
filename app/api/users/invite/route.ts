import { NextRequest } from "next/server";
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

export async function POST(request: NextRequest) {
  try {
    const ctx = await getSupabaseAndUser();
    const schoolId = requireSchool(ctx);
    requireRole(ctx, ["SCHOOL_ADMIN", "SUPER_ADMIN"]);

    const body = await request.json();
    const parsed = inviteUserSchema.safeParse(body);
    if (!parsed.success) {
      return errorResponse(parsed.error.issues[0].message, 400);
    }

    const { email, role, full_name } = parsed.data;
    const supabase = ctx.supabase;
    const adminClient = createAdminClient();

    // Check if auth user already exists with this email
    const { data: existingAuthUsers } = await adminClient.auth.admin.listUsers();
    const emailExists = existingAuthUsers?.users?.some(
      (u: { email?: string }) => u.email === email
    );

    if (emailExists) {
      return errorResponse("A user with this email already exists", 400);
    }

    // Generate a temporary password
    const tempPassword = `Skuli-${Math.random().toString(36).slice(2, 10)}!`;

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
        is_active: true,
      } as Record<string, unknown>,
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
      new_value: { email, role, full_name },
    } as Record<string, unknown>);

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

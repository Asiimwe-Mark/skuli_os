import { NextRequest } from "next/server";
import {
  getSupabaseAndUser,
  requireRole,
  successResponse,
  errorResponse,
} from "@/lib/api-helpers";
import { createAdminClient } from "@/lib/supabase/admin";

export async function POST(request: NextRequest) {
  try {
    const ctx = await getSupabaseAndUser();
    requireRole(ctx, ["SUPER_ADMIN"]);

    const body = await request.json();
    const { school_id } = body;

    if (!school_id) {
      return errorResponse("school_id is required", 400);
    }

    // Verify school exists
    const adminClient = createAdminClient();
    const { data: school } = await adminClient
      .from("schools")
      .select("id, name, is_deleted")
      .eq("id", school_id)
      .single() as { data: { id: string; name: string; is_deleted: boolean } | null };

    if (!school || school.is_deleted) {
      return errorResponse("School not found", 404);
    }

    // Find the school admin for this school
    const { data: schoolAdmin } = await adminClient
      .from("users")
      .select("id, full_name, role")
      .eq("school_id", school_id)
      .eq("role", "SCHOOL_ADMIN")
      .eq("is_active", true)
      .limit(1)
      .single() as { data: { id: string; full_name: string; role: string } | null };

    if (!schoolAdmin) {
      return errorResponse("No active school admin found for this school", 404);
    }

    // Get the auth user's email for magic link generation
    const { data: authUser } = await adminClient.auth.admin.getUserById(schoolAdmin!.id);

    if (!authUser?.user?.email) {
      return errorResponse("Could not retrieve admin email for impersonation", 500);
    }

    // Generate a magic link for impersonation
    const { data: linkData, error: linkError } = await adminClient.auth.admin.generateLink({
      type: "magiclink",
      email: authUser.user.email,
    });

    if (linkError || !linkData) {
      return errorResponse(linkError?.message || "Failed to generate impersonation link", 500);
    }

    // Use the properties hash from the generated link
    const impersonationToken = Buffer.from(
      JSON.stringify({
        target_user_id: schoolAdmin!.id,
        school_id: school_id,
        issued_by: ctx.user.id,
        issued_at: Date.now(),
        expires_at: Date.now() + 60 * 60 * 1000, // 1 hour
        properties: linkData.properties,
      })
    ).toString("base64");

    // Audit log
    await adminClient.from("audit_logs").insert({
      school_id: school_id,
      user_id: ctx.user.id,
      action: "impersonation_initiated",
      entity_type: "school",
      entity_id: school_id,
      new_value: {
        target_user_id: schoolAdmin!.id,
        target_user_name: schoolAdmin!.full_name,
        school_name: school!.name,
      },
    } as any);

    return successResponse({
      token: impersonationToken,
      target_user: {
        id: schoolAdmin!.id,
        name: schoolAdmin!.full_name,
        role: schoolAdmin!.role,
      },
      school: {
        id: school!.id,
        name: school!.name,
      },
      expires_at: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Internal server error";
    const status = err instanceof Error && "status" in err ? (err as any).status : 500;
    return errorResponse(message, status);
  }
}

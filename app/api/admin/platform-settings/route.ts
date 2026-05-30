import { NextRequest } from "next/server";
import { z } from "zod";
import {
  getSupabaseAndUser,
  requireRole,
  successResponse,
  errorResponse,
} from "@/lib/api-helpers";
import { createAdminClient } from "@/lib/supabase/admin";

export async function GET() {
  try {
    const ctx = await getSupabaseAndUser();
    requireRole(ctx, ["SUPER_ADMIN"]);

    const admin = createAdminClient();

    const { data, error } = await admin
      .from("platform_settings")
      .select("key, value, updated_at, updated_by");

    if (error) return errorResponse(error.message);

    return successResponse(data ?? []);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Internal server error";
    const status = err instanceof Error && "status" in err ? (err as any).status : 500;
    return errorResponse(message, status);
  }
}

const patchSchema = z.object({
  key: z.string().min(1),
  value: z.any(),
});

export async function PATCH(request: NextRequest) {
  try {
    const ctx = await getSupabaseAndUser();
    requireRole(ctx, ["SUPER_ADMIN"]);

    const body = await request.json();
    const parsed = patchSchema.safeParse(body);
    if (!parsed.success) {
      return errorResponse(parsed.error.issues[0].message, 400);
    }

    const admin = createAdminClient();

    const { data, error } = await admin
      .from("platform_settings")
      .upsert(
        {
          key: parsed.data.key,
          value: parsed.data.value,
          updated_by: ctx.user.id,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "key" }
      )
      .select()
      .single();

    if (error) return errorResponse(error.message, 400);

    return successResponse(data);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Internal server error";
    const status = err instanceof Error && "status" in err ? (err as any).status : 500;
    return errorResponse(message, status);
  }
}

const broadcastSchema = z.object({
  action: z.literal("broadcast"),
  title: z.string().min(1),
  message: z.string().min(1),
});

export async function POST(request: NextRequest) {
  try {
    const ctx = await getSupabaseAndUser();
    requireRole(ctx, ["SUPER_ADMIN"]);

    const body = await request.json();
    const parsed = broadcastSchema.safeParse(body);
    if (!parsed.success) {
      return errorResponse(parsed.error.issues[0].message, 400);
    }

    const admin = createAdminClient();

    // Find all SCHOOL_ADMIN users
    const { data: admins } = await admin
      .from("users")
      .select("id")
      .eq("role", "SCHOOL_ADMIN");

    if (!admins || admins.length === 0) {
      return successResponse({ sent_to: 0 });
    }

    // Insert one notification per admin
    const notifications = admins.map((a: any) => ({
      recipient_user_id: a.id,
      title: parsed.data.title,
      body: parsed.data.message,
      type: "announcement",
      is_read: false,
    }));

    const { error } = await admin
      .from("in_app_notifications")
      .insert(notifications);

    if (error) return errorResponse(error.message, 400);

    return successResponse({ sent_to: admins.length });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Internal server error";
    const status = err instanceof Error && "status" in err ? (err as any).status : 500;
    return errorResponse(message, status);
  }
}

import type { Database } from "@/types/database";
import { z } from "zod";
import { route } from "@/lib/http";
import { createAdminClient } from "@/lib/supabase/admin";

export const GET = route({
  roles: ["SUPER_ADMIN"],
  noSchoolRequired: true,
  handler: async () => {
    const admin = createAdminClient();
    const { data, error } = await admin
      .from("platform_settings")
      .select("key, value, updated_at, updated_by");
    if (error) throw new Error("Database error");
    return data ?? [];
  },
});

const patchSchema = z.object({
  key: z.string().min(1),
  value: z.unknown(),
});

export const PATCH = route({
  roles: ["SUPER_ADMIN"],
  noSchoolRequired: true,
  schema: patchSchema,
  handler: async (ctx, body) => {
    const admin = createAdminClient();
    const { data, error } = await admin
      .from("platform_settings")
      .upsert(
        {
          key: body.key,
          value: body.value as Database["public"]["Tables"]["platform_settings"]["Insert"]["value"],
          updated_by: ctx.user.id,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "key" },
      )
      .select()
      .single();
    if (error) throw new Error("Database error");
    return data;
  },
});

const broadcastSchema = z.object({
  action: z.literal("broadcast"),
  title: z.string().min(1),
  message: z.string().min(1),
});

export const POST = route({
  roles: ["SUPER_ADMIN"],
  noSchoolRequired: true,
  schema: broadcastSchema,
  handler: async (_ctx, body) => {
    const admin = createAdminClient();

    const { data: admins } = await admin
      .from("users")
      .select("id, schools!inner(is_deleted)")
      .eq("role", "SCHOOL_ADMIN")
      .eq("is_active", true)
      .eq("schools.is_deleted", false);

    if (!admins || admins.length === 0) {
      return { sent_to: 0 };
    }

    const notifications = admins.map((a: { id: string }) => ({
      recipient_user_id: a.id,
      school_id: null,
      title: body.title,
      body: body.message,
      type: "announcement",
      is_read: false,
      related_entity_type: null,
      related_entity_id: null,
    }));

    const { error } = await admin
      .from("in_app_notifications")
      .insert(
        notifications as unknown as Database["public"]["Tables"]["in_app_notifications"]["Insert"],
      );
    if (error) throw new Error("Database error");

    return { sent_to: admins.length };
  },
});
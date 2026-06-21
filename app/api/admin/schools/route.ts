import type { Database } from "@/types/database";
import { z } from "zod";
import { route, paginatedResponse } from "@/lib/http";

type SchoolRow = Database["public"]["Tables"]["schools"]["Row"];

export const GET = route({
  roles: ["SUPER_ADMIN"],
  noSchoolRequired: true,
  handler: async (ctx, request) => {
    const { searchParams } = new URL(request.url);
    const status = searchParams.get("subscription_status");
    const plan = searchParams.get("plan");
    const search = searchParams.get("search");
    const page = parseInt(searchParams.get("page") || "1", 10);
    const limit = Math.min(parseInt(searchParams.get("limit") || "50", 10), 200);
    const from = (page - 1) * limit;
    const to = from + limit - 1;

    let query = ctx.supabase
      .from("schools")
      .select("*", { count: "exact" })
      .eq("is_deleted", false);

    if (status) {
      query = query.eq(
        "subscription_status",
        status as Database["public"]["Enums"]["subscription_status"],
      );
    }
    if (plan) {
      query = query.eq(
        "subscription_plan",
        plan as Database["public"]["Enums"]["subscription_plan"],
      );
    }
    if (search) {
      query = query.or(
        `name.ilike.%${search}%,school_code.ilike.%${search}%,district.ilike.%${search}%`,
      );
    }

    const { data, error, count } = await query
      .order("created_at", { ascending: false })
      .range(from, to);

    if (error) throw new Error("Database error");

    return paginatedResponse(data ?? [], count ?? 0, page, limit);
  },
});

const patchSchema = z.object({
  id: z.string().uuid(),
  subscription_plan: z
    .enum(["starter", "growth", "pro", "trial"])
    .optional(),
  subscription_status: z
    .enum(["active", "past_due", "cancelled", "trial"])
    .optional(),
  trial_ends_at: z.string().optional(),
  max_students: z.number().int().min(1).optional(),
  is_deleted: z.boolean().optional(),
  name: z.string().optional(),
});

export const PATCH = route({
  roles: ["SUPER_ADMIN"],
  noSchoolRequired: true,
  schema: patchSchema,
  handler: async (ctx, body) => {
    const { id, ...updates } = body;

    const { data: existing } = (await ctx.supabase
      .from("schools")
      .select("*")
      .eq("id", id)
      .single()) as { data: SchoolRow | null };

    if (!existing) {
      throw new Error("School not found");
    }

    const allowedFields: Record<string, unknown> = {};
    if (updates.subscription_plan !== undefined) {
      allowedFields.subscription_plan = updates.subscription_plan;
    }
    if (updates.subscription_status !== undefined) {
      allowedFields.subscription_status = updates.subscription_status;
    }
    if (updates.trial_ends_at !== undefined) {
      allowedFields.trial_ends_at = updates.trial_ends_at;
    }
    if (updates.max_students !== undefined) {
      allowedFields.max_students = updates.max_students;
    }
    if (updates.is_deleted !== undefined) {
      allowedFields.is_deleted = updates.is_deleted;
    }
    if (updates.name !== undefined) allowedFields.name = updates.name;

    if (Object.keys(allowedFields).length === 0) {
      throw new Error("No valid fields to update");
    }

    const { data: school, error } = (await ctx.supabase
      .from("schools")
      .update(
        allowedFields as Database["public"]["Tables"]["schools"]["Update"],
      )
      .eq("id", id)
      .select()
      .single()) as { data: SchoolRow | null; error: { message: string } | null };

    if (error) throw new Error("Database error");

    await ctx.supabase.from("audit_logs").insert({
      school_id: id,
      user_id: ctx.user.id,
      action: "school_updated_by_admin",
      entity_type: "school",
      entity_id: id,
      old_value: {
        plan: existing.subscription_plan,
        status: existing.subscription_status,
        max_students: existing.max_students,
      },
      new_value: allowedFields as Database["public"]["Tables"]["audit_logs"]["Insert"]["new_value"],
      ip_address: null,
    });

    return school;
  },
});
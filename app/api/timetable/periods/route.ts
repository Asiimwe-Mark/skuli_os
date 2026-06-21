import type { Database } from "@/types/database";
import { z } from "zod";
import { route, AuthError, dbError } from "@/lib/http";

const createPeriodSchema = z.object({
  name: z.string().min(1),
  start_time: z.string().min(1),
  end_time: z.string().min(1),
  sort_order: z.number().int().min(0),
  is_break: z.boolean().optional().default(false),
});

const updatePeriodSchema = createPeriodSchema.partial().extend({
  id: z.string().uuid(),
});

export const GET = route({
  roles: ["SCHOOL_ADMIN", "TEACHER", "SUPER_ADMIN"],
  handler: async (ctx) => {
    const schoolId = ctx.profile.school_id!;
    const { data, error } = await ctx.supabase
      .from("timetable_periods")
      .select("*")
      .eq("school_id", schoolId)
      .eq("is_deleted", false)
      .order("sort_order", { ascending: true });

    if (error) return dbError(error, "Database error");
    return data ?? [];
  },
});

export const POST = route({
  roles: ["SCHOOL_ADMIN"],
  schema: createPeriodSchema,
  handler: async (ctx, body) => {
    const schoolId = ctx.profile.school_id!;
    const { data: period, error } = await ctx.supabase
      .from("timetable_periods")
      .insert({
        school_id: schoolId,
        name: body.name,
        start_time: body.start_time,
        end_time: body.end_time,
        sort_order: body.sort_order,
        is_break: body.is_break,
        is_deleted: false,
      } as unknown as Database["public"]["Tables"]["timetable_periods"]["Insert"])
      .select()
      .single();

    if (error) return dbError(error, "Database error", 400);
    return period;
  },
});

export const PATCH = route({
  roles: ["SCHOOL_ADMIN"],
  schema: updatePeriodSchema,
  handler: async (ctx, body) => {
    const schoolId = ctx.profile.school_id!;
    const { id, ...updates } = body;

    const { data: existing } = await ctx.supabase
      .from("timetable_periods")
      .select("id")
      .eq("id", id)
      .eq("school_id", schoolId)
      .eq("is_deleted", false)
      .single();

    if (!existing) throw new AuthError("Period not found", 404);

    const { data: period, error } = await ctx.supabase
      .from("timetable_periods")
      .update(
        updates as unknown as Database["public"]["Tables"]["timetable_periods"]["Update"],
      )
      .eq("id", id)
      .select()
      .single();

    if (error) return dbError(error, "Database error", 400);
    return period;
  },
});

export const DELETE = route({
  roles: ["SCHOOL_ADMIN"],
  handler: async (ctx, request) => {
    const schoolId = ctx.profile.school_id!;
    const id = new URL(request.url).searchParams.get("id");
    if (!id) throw new AuthError("Missing id parameter", 400);

    const { data: existing } = await ctx.supabase
      .from("timetable_periods")
      .select("id")
      .eq("id", id)
      .eq("school_id", schoolId)
      .eq("is_deleted", false)
      .single();

    if (!existing) throw new AuthError("Period not found", 404);

    const { error } = await ctx.supabase
      .from("timetable_periods")
      .update({
        is_deleted: true,
      } as unknown as Database["public"]["Tables"]["timetable_periods"]["Update"])
      .eq("id", id);

    if (error) return dbError(error, "Database error", 400);
    return { deleted: true };
  },
});
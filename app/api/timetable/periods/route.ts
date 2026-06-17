import { NextRequest } from "next/server";
import type { Database } from "@/types/database";
import { z } from "zod";
import {
  getSupabaseAndUser,
  requireSchool,
  requireRole,
  successResponse,
  errorResponse,
  dbError,
  getErrorStatus } from "@/lib/api-helpers";

const createPeriodSchema = z.object({
  name: z.string().min(1),
  start_time: z.string().min(1),
  end_time: z.string().min(1),
  sort_order: z.number().int().min(0),
  is_break: z.boolean().optional().default(false) });

const updatePeriodSchema = createPeriodSchema.partial().extend({
  id: z.string().uuid() });

export async function GET(request: NextRequest) {
  try {
    const ctx = await getSupabaseAndUser();
    const schoolId = requireSchool(ctx);
    // Audit 4.1, 4.4: PARENT and BURSAR don't have a use-case for timetable
    // structure. Without this guard a PARENT with no school_id gets 400
    // (looks like "no periods" in the UI) and a BURSAR gets data they
    // shouldn't see. School admins and teachers are the consumers.
    requireRole(ctx, ["SCHOOL_ADMIN", "TEACHER", "SUPER_ADMIN"]);

    const { data, error } = await ctx.supabase
      .from("timetable_periods")
      .select("*")
      .eq("school_id", schoolId)
      .eq("is_deleted", false)
      .order("sort_order", { ascending: true });

    if (error) return dbError(error, "Database error");

    return successResponse(data ?? []);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Internal server error";
    const status = getErrorStatus(err);
    return errorResponse(message, status);
  }
}

export async function POST(request: NextRequest) {
  try {
    const ctx = await getSupabaseAndUser();
    const schoolId = requireSchool(ctx);
    requireRole(ctx, ["SCHOOL_ADMIN"]);

    const body = await request.json();
    const parsed = createPeriodSchema.safeParse(body);
    if (!parsed.success) {
      return errorResponse(parsed.error.issues[0].message, 400);
    }

    const { data: period, error } = await ctx.supabase
      .from("timetable_periods")
      .insert({
        school_id: schoolId,
        name: parsed.data.name,
        start_time: parsed.data.start_time,
        end_time: parsed.data.end_time,
        sort_order: parsed.data.sort_order,
        is_break: parsed.data.is_break,
        is_deleted: false } as unknown as Database["public"]["Tables"]["timetable_periods"]["Insert"])
      .select()
      .single();

    if (error) return dbError(error, "Database error", 400);

    return successResponse(period, 201);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Internal server error";
    const status = getErrorStatus(err);
    return errorResponse(message, status);
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const ctx = await getSupabaseAndUser();
    const schoolId = requireSchool(ctx);
    requireRole(ctx, ["SCHOOL_ADMIN"]);

    const body = await request.json();
    const parsed = updatePeriodSchema.safeParse(body);
    if (!parsed.success) {
      return errorResponse(parsed.error.issues[0].message, 400);
    }

    const { id, ...updates } = parsed.data;

    // Verify ownership
    const { data: existing } = await ctx.supabase
      .from("timetable_periods")
      .select("id")
      .eq("id", id)
      .eq("school_id", schoolId)
      .eq("is_deleted", false)
      .single();

    if (!existing) return errorResponse("Period not found", 404);

    const { data: period, error } = await ctx.supabase
      .from("timetable_periods")
      .update(updates as unknown as Database["public"]["Tables"]["timetable_periods"]["Update"])
      .eq("id", id)
      .select()
      .single();

    if (error) return dbError(error, "Database error", 400);

    return successResponse(period);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Internal server error";
    const status = getErrorStatus(err);
    return errorResponse(message, status);
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const ctx = await getSupabaseAndUser();
    const schoolId = requireSchool(ctx);
    requireRole(ctx, ["SCHOOL_ADMIN"]);

    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");
    if (!id) return errorResponse("Missing id parameter", 400);

    const { data: existing } = await ctx.supabase
      .from("timetable_periods")
      .select("id")
      .eq("id", id)
      .eq("school_id", schoolId)
      .eq("is_deleted", false)
      .single();

    if (!existing) return errorResponse("Period not found", 404);

    const { error } = await ctx.supabase
      .from("timetable_periods")
      .update({ is_deleted: true } as unknown as Database["public"]["Tables"]["timetable_periods"]["Update"])
      .eq("id", id);

    if (error) return dbError(error, "Database error", 400);

    return successResponse({ deleted: true });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Internal server error";
    const status = getErrorStatus(err);
    return errorResponse(message, status);
  }
}

import { NextRequest } from "next/server";
import type { Database } from "@/types/database";
import {
  getSupabaseAndUser,
  requireRole,
  successResponse,
  errorResponse,
} from "@/lib/api-helpers";

type SchoolRow = Database["public"]["Tables"]["schools"]["Row"];

export async function GET(request: NextRequest) {
  try {
    const ctx = await getSupabaseAndUser();
    requireRole(ctx, ["SUPER_ADMIN"]);

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

    if (status) query = query.eq("subscription_status", status);
    if (plan) query = query.eq("subscription_plan", plan);
    if (search) {
      query = query.or(`name.ilike.%${search}%,school_code.ilike.%${search}%,district.ilike.%${search}%`);
    }

    const { data, error, count } = await query
      .order("created_at", { ascending: false })
      .range(from, to);

    if (error) return errorResponse(error.message);

    return successResponse({
      schools: data ?? [],
      total: count ?? 0,
      page,
      limit,
      totalPages: Math.ceil((count ?? 0) / limit),
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Internal server error";
    const status = err instanceof Error && "status" in err ? (err as unknown as { status: number }).status : 500;
    return errorResponse(message, status);
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const ctx = await getSupabaseAndUser();
    requireRole(ctx, ["SUPER_ADMIN"]);

    const body = await request.json();
    const { id, ...updates } = body;

    if (!id) {
      return errorResponse("School ID is required", 400);
    }

    // Fetch existing school
    const { data: existing } = await ctx.supabase
      .from("schools")
      .select("*")
      .eq("id", id)
      .single() as { data: SchoolRow | null };

    if (!existing) {
      return errorResponse("School not found", 404);
    }

    // Only allow specific fields to be updated by super admin
    const allowedFields: Record<string, unknown> = {};
    if (updates.subscription_plan !== undefined) {
      if (!["starter", "growth", "pro", "trial"].includes(updates.subscription_plan)) {
        return errorResponse("Invalid subscription plan", 400);
      }
      allowedFields.subscription_plan = updates.subscription_plan;
    }
    if (updates.subscription_status !== undefined) {
      if (!["active", "past_due", "cancelled", "trial"].includes(updates.subscription_status)) {
        return errorResponse("Invalid subscription status", 400);
      }
      allowedFields.subscription_status = updates.subscription_status;
    }
    if (updates.trial_ends_at !== undefined) allowedFields.trial_ends_at = updates.trial_ends_at;
    if (updates.max_students !== undefined) {
      if (typeof updates.max_students !== "number" || updates.max_students < 1) {
        return errorResponse("max_students must be a positive number", 400);
      }
      allowedFields.max_students = updates.max_students;
    }
    if (updates.is_deleted !== undefined) allowedFields.is_deleted = updates.is_deleted;
    if (updates.name !== undefined) allowedFields.name = updates.name;

    if (Object.keys(allowedFields).length === 0) {
      return errorResponse("No valid fields to update", 400);
    }

    const { data: school, error } = await ctx.supabase
      .from("schools")
      .update(allowedFields)
      .eq("id", id)
      .select()
      .single() as { data: SchoolRow | null; error: { message: string } | null };

    if (error) return errorResponse(error.message);

    // Audit log
    await ctx.supabase.from("audit_logs").insert({
      school_id: id,
      user_id: ctx.user.id,
      action: "school_updated_by_admin",
      entity_type: "school",
      entity_id: id,
      old_value: {
        plan: existing!.subscription_plan,
        status: existing!.subscription_status,
        max_students: existing!.max_students,
      },
      new_value: allowedFields,
    } as Record<string, unknown>);

    return successResponse(school);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Internal server error";
    const status = err instanceof Error && "status" in err ? (err as unknown as { status: number }).status : 500;
    return errorResponse(message, status);
  }
}

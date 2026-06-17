import { NextRequest } from "next/server";
import type { Database } from "@/types/database";
import { z } from "zod";
import {
  getSupabaseAndUser,
  requireRole,
  successResponse,
  errorResponse,
  dbError,
  getErrorStatus,
} from "@/lib/api-helpers";

export async function GET() {
  try {
    const ctx = await getSupabaseAndUser();
    requireRole(ctx, ["GROUP_ADMIN", "SUPER_ADMIN"]);

    // Get the group this admin manages
    const { data: groupAdmin } = await ctx.supabase
      .from("group_admins")
      .select("group_id")
      .eq("user_id", ctx.user.id)
      .single();

    if (!groupAdmin) return errorResponse("No group found for this user", 404);

    // Get schools in this group
    const { data: schools, error } = await ctx.supabase
      .from("schools")
      .select("id, name, district, email, phone, subscription_plan, subscription_status, created_at")
      .eq("group_id", groupAdmin.group_id)
      .eq("is_deleted", false)
      .order("name");

    if (error) return dbError(error, "Database error");

    // Enrich with student counts and fee totals
    const enriched = [];
    for (const school of schools ?? []) {
      const { count: studentCount } = await ctx.supabase
        .from("students")
        .select("id", { count: "exact", head: true })
        .eq("school_id", school.id)
        .eq("is_deleted", false)
        .eq("status", "active");

      const { data: payments } = await ctx.supabase
        .from("fee_payments")
        .select("amount")
        .eq("school_id", school.id)
        .eq("status", "confirmed");

      const totalFees = (payments ?? []).reduce((sum: number, p: any) => sum + (p.amount ?? 0), 0);

      enriched.push({
        ...school,
        student_count: studentCount ?? 0,
        fee_collected: totalFees,
      });
    }

    // Group totals
    const totals = {
      schools: enriched.length,
      students: enriched.reduce((s, e) => s + e.student_count, 0),
      fees: enriched.reduce((s, e) => s + e.fee_collected, 0),
    };

    return successResponse({ schools: enriched, totals });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Internal server error";
    const status = getErrorStatus(err);
    return errorResponse(message, status);
  }
}

const createSchoolSchema = z.object({
  name: z.string().min(1),
  district: z.string().optional(),
  email: z.string().email().optional().or(z.literal("")),
  phone: z.string().optional(),
  address: z.string().optional(),
  subscription_plan: z.enum(["starter", "growth", "pro"]).optional(),
});

export async function POST(request: NextRequest) {
  try {
    const ctx = await getSupabaseAndUser();
    requireRole(ctx, ["GROUP_ADMIN", "SUPER_ADMIN"]);

    const body = await request.json();
    const parsed = createSchoolSchema.safeParse(body);
    if (!parsed.success) {
      return errorResponse(parsed.error.issues[0].message, 400);
    }

    // Get the group
    const { data: groupAdmin } = await ctx.supabase
      .from("group_admins")
      .select("group_id")
      .eq("user_id", ctx.user.id)
      .single();

    if (!groupAdmin) return errorResponse("No group found", 404);

    const { data: school, error } = await ctx.supabase
      .from("schools")
      .insert({
        name: parsed.data.name,
        district: parsed.data.district ?? null,
        email: parsed.data.email ?? null,
        phone: parsed.data.phone ?? null,
        address: parsed.data.address ?? null,
        subscription_plan: parsed.data.subscription_plan ?? "starter",
        group_id: groupAdmin.group_id,
        school_type: 'both',
        school_code: `SCH${Date.now()}`,
        subscription_status: 'trial',
        max_students: 100,
      } as unknown as Database["public"]["Tables"]["schools"]["Insert"])
      .select()
      .single();

    if (error) return dbError(error, "Database error", 400);

    return successResponse(school, 201);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Internal server error";
    const status = getErrorStatus(err);
    return errorResponse(message, status);
  }
}

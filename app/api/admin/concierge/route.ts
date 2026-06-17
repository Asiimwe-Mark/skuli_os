import { NextRequest } from "next/server";
import {
  getSupabaseAndUser,
  requireRole,
  successResponse,
  errorResponse,
  getErrorStatus,
} from "@/lib/api-helpers";

export async function GET(request: NextRequest) {
  try {
    const ctx = await getSupabaseAndUser();
    requireRole(ctx, ["SUPER_ADMIN"]);

    const sp = request.nextUrl.searchParams;
    const status = sp.get("status");
    const page = Math.max(1, parseInt(sp.get("page") ?? "1", 10));
    const pageSize = 25;
    const from = (page - 1) * pageSize;

    let query = ctx.supabase
      .from("concierge_leads")
      .select("id, school_name, contact_name, contact_phone, contact_email, district, student_count, current_system, status, assigned_to, internal_notes, created_at", { count: "exact" })
      .order("created_at", { ascending: false })
      .range(from, from + pageSize - 1);

    if (status && status !== "all") query = query.eq("status", status as "new" | "contacted" | "in_progress" | "completed" | "cancelled");

    const { data, error, count } = await query;
    if (error) return errorResponse("Failed to load leads", 500);
    return successResponse({ leads: data ?? [], total: count ?? 0, page });
  } catch (e) {
    return errorResponse(e instanceof Error ? e.message : "Error", getErrorStatus(e));
  }
}

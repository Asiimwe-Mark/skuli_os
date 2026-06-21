import { route, paginatedResponse } from "@/lib/http";

export const GET = route({
  roles: ["SUPER_ADMIN"],
  noSchoolRequired: true,
  handler: async (_ctx, request) => {
    const sp = request.nextUrl.searchParams;
    const status = sp.get("status");
    const page = Math.max(1, parseInt(sp.get("page") ?? "1", 10));
    const pageSize = 25;
    const from = (page - 1) * pageSize;

    const supabase = _ctx.supabase;
    let query = supabase
      .from("concierge_leads")
      .select(
        "id, school_name, contact_name, contact_phone, contact_email, district, student_count, current_system, status, assigned_to, internal_notes, created_at",
        { count: "exact" },
      )
      .order("created_at", { ascending: false })
      .range(from, from + pageSize - 1);

    if (status && status !== "all") {
      query = query.eq(
        "status",
        status as "new" | "contacted" | "in_progress" | "completed" | "cancelled",
      );
    }

    const { data, error, count } = await query;
    if (error) throw new Error("Failed to load leads");
    return paginatedResponse(data ?? [], count ?? 0, page, pageSize);
  },
});
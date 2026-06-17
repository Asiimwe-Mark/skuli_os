import {
  getSupabaseAndUser,
  requireRole,
  successResponse,
  errorResponse,
  getErrorStatus,
} from "@/lib/api-helpers";

export async function GET() {
  try {
    const ctx = await getSupabaseAndUser();
    requireRole(ctx, ["GROUP_ADMIN", "SUPER_ADMIN"]);

    // Get the group
    const { data: groupAdmin } = await ctx.supabase
      .from("group_admins")
      .select("group_id")
      .eq("user_id", ctx.user.id)
      .single();

    if (!groupAdmin) return errorResponse("No group found", 404);

    // Get schools in this group
    const { data: schools } = await ctx.supabase
      .from("schools")
      .select("id, name")
      .eq("group_id", groupAdmin.group_id)
      .eq("is_deleted", false)
      .order("name");

    if (!schools || schools.length === 0) {
      return successResponse({
        fee_by_school: [],
        attendance_by_week: [],
        marks_by_school: [],
      });
    }

    // Fee collection per school (current term)
    const { data: currentTerm } = await ctx.supabase
      .from("terms")
      .select("id")
      .eq("is_current", true)
      .limit(1)
      .maybeSingle();

    const feeBySchool = [];
    for (const school of schools) {
      let feeQuery = ctx.supabase
        .from("fee_payments")
        .select("amount")
        .eq("school_id", school.id)
        .eq("status", "confirmed");

      if (currentTerm) {
        // Get payments for current term via fee_accounts
        const { data: accounts } = await ctx.supabase
          .from("fee_accounts")
          .select("id")
          .eq("term_id", currentTerm.id)
          .eq("school_id", school.id);

        if (accounts && accounts.length > 0) {
          feeQuery = feeQuery.in(
            "fee_account_id",
            accounts.map((a: any) => a.id)
          );
        }
      }

      const { data: payments } = await feeQuery;
      const total = (payments ?? []).reduce((s: number, p: any) => s + (p.amount ?? 0), 0);
      feeBySchool.push({ name: school.name, value: total });
    }

    // Attendance per school per week (last 8 weeks)
    const attendanceByWeek = [];
    const now = new Date();
    for (let w = 7; w >= 0; w--) {
      const weekStart = new Date(now);
      weekStart.setDate(now.getDate() - now.getDay() - w * 7);
      const weekEnd = new Date(weekStart);
      weekEnd.setDate(weekStart.getDate() + 6);

      const startStr = weekStart.toISOString().split("T")[0];
      const endStr = weekEnd.toISOString().split("T")[0];
      const weekLabel = `W${8 - w}`;

      const weekData: Record<string, number | string> = { week: weekLabel };
      for (const school of schools) {
        const { data: records } = await ctx.supabase
          .from("attendance_records")
          .select("status")
          .eq("school_id", school.id)
          .gte("date", startStr)
          .lte("date", endStr);

        const total = records?.length ?? 0;
        const present = (records ?? []).filter((r: any) => r.status === "present").length;
        weekData[school.name] = total > 0 ? Math.round((present / total) * 100) : 0;
      }
      attendanceByWeek.push(weekData);
    }

    // Average marks per school
    const marksBySchool = [];
    for (const school of schools) {
      const { data: marks } = await ctx.supabase
        .from("marks")
        .select("score, max_score")
        .eq("school_id", school.id);

      const total = marks?.length ?? 0;
      const avg =
        total > 0
          ? Math.round(
              ((marks ?? []).reduce((s: number, m: any) => s + (m.score / m.max_score) * 100, 0) /
                total) *
                100
            ) / 100
          : 0;

      marksBySchool.push({ name: school.name, value: avg });
    }

    return successResponse({
      fee_by_school: feeBySchool,
      attendance_by_week: attendanceByWeek,
      marks_by_school: marksBySchool,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Internal server error";
    const status = getErrorStatus(err);
    return errorResponse(message, status);
  }
}

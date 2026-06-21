import { route } from "@/lib/http";

export const GET = route({
  roles: ["GROUP_ADMIN", "SUPER_ADMIN"],
  noSchoolRequired: true,
  handler: async (ctx) => {
    const { data: groupAdmin } = await ctx.supabase
      .from("group_admins")
      .select("group_id")
      .eq("user_id", ctx.user.id)
      .single();

    if (!groupAdmin) throw new Error("No group found");

    const { data: schools } = await ctx.supabase
      .from("schools")
      .select("id, name")
      .eq("group_id", groupAdmin.group_id)
      .eq("is_deleted", false)
      .order("name");

    if (!schools || schools.length === 0) {
      return {
        fee_by_school: [],
        attendance_by_week: [],
        marks_by_school: [],
      };
    }

    const { data: currentTerm } = await ctx.supabase
      .from("terms")
      .select("id")
      .eq("is_current", true)
      .limit(1)
      .maybeSingle();

    const feeBySchool: { name: string; value: number }[] = [];
    for (const school of schools) {
      let feeQuery = ctx.supabase
        .from("fee_payments")
        .select("amount")
        .eq("school_id", school.id)
        .eq("status", "confirmed");

      if (currentTerm) {
        const { data: accounts } = await ctx.supabase
          .from("fee_accounts")
          .select("id")
          .eq("term_id", currentTerm.id)
          .eq("school_id", school.id);

        if (accounts && accounts.length > 0) {
          feeQuery = feeQuery.in(
            "fee_account_id",
            accounts.map((a: { id: string }) => a.id),
          );
        }
      }

      const { data: payments } = await feeQuery;
      const total = (payments ?? []).reduce(
        (s: number, p: { amount?: number }) => s + (p.amount ?? 0),
        0,
      );
      feeBySchool.push({ name: school.name, value: total });
    }

    const attendanceByWeek: Array<Record<string, number | string>> = [];
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
        const present = (records ?? []).filter(
          (r: { status: string }) => r.status === "present",
        ).length;
        weekData[school.name] = total > 0 ? Math.round((present / total) * 100) : 0;
      }
      attendanceByWeek.push(weekData);
    }

    const marksBySchool: { name: string; value: number }[] = [];
    for (const school of schools) {
      const { data: marks } = await ctx.supabase
        .from("marks")
        .select("score, max_score")
        .eq("school_id", school.id);

      const total = marks?.length ?? 0;
      const avg =
        total > 0
          ? Math.round(
              ((marks ?? []).reduce(
                (
                  s: number,
                  m: { score: number | null; max_score: number },
                ) => s + ((m.score ?? 0) / m.max_score) * 100,
                0,
              ) /
                total) *
                100,
            ) / 100
          : 0;

      marksBySchool.push({ name: school.name, value: avg });
    }

    return {
      fee_by_school: feeBySchool,
      attendance_by_week: attendanceByWeek,
      marks_by_school: marksBySchool,
    };
  },
});
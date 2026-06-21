import type { Database } from "@/types/database";
import { route } from "@/lib/http";
import { createAdminClient } from "@/lib/supabase/admin";

export const GET = route({
  roles: ["SUPER_ADMIN"],
  noSchoolRequired: true,
  handler: async (_ctx, request) => {
    const admin = createAdminClient();
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();

    const { data: schools } = await admin
      .from("schools")
      .select("id, name, subscription_plan, subscription_status, created_at, next_billing_date")
      .eq("is_deleted", false);

    const activeSchools = (schools ?? []).filter(
      (s: { subscription_status?: string }) =>
        s.subscription_status === "active" || s.subscription_status === "trialing",
    );

    const planPrices: Record<string, number> = {
      starter: 50000,
      growth: 120000,
      pro: 250000,
    };

    const mrr = activeSchools.reduce(
      (sum: number, s: { subscription_plan?: string }) =>
        sum + (planPrices[s.subscription_plan ?? ""] ?? 0),
      0,
    );

    const arr = mrr * 12;

    const revenueByPlan: Record<string, { count: number; total: number }> = {};
    for (const plan of Object.keys(planPrices)) {
      const count = activeSchools.filter(
        (s: { subscription_plan?: string }) => s.subscription_plan === plan,
      ).length;
      revenueByPlan[plan] = { count, total: count * planPrices[plan] };
    }

    const { data: churned } = await admin
      .from("schools")
      .select("id")
      .eq("subscription_status", "cancelled")
      .gte("updated_at", monthStart);

    const churnThisMonth = churned?.length ?? 0;
    const activeStartOfMonth = activeSchools.length + churnThisMonth;
    const churnRate = activeStartOfMonth > 0 ? (churnThisMonth / activeStartOfMonth) * 100 : 0;

    const { data: newSchools } = await admin
      .from("schools")
      .select("id")
      .gte("created_at", monthStart);

    const sevenDaysFromNow = new Date(now.getTime() + 7 * 86400000).toISOString();
    const upcomingRenewals = (schools ?? []).filter(
      (s: { next_billing_date?: string | null; subscription_status?: string }) =>
        !!s.next_billing_date &&
        s.next_billing_date <= sevenDaysFromNow &&
        s.subscription_status === "active",
    );

    const twelveMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 11, 1).toISOString();
    const { data: invoices } = await admin
      .from("subscription_invoices")
      .select("amount, created_at, status")
      .gte("created_at", twelveMonthsAgo)
      .eq("status", "paid");

    const mrrChart: { month: string; revenue: number }[] = [];
    for (let i = 11; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const monthKey = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      const monthRevenue = (invoices ?? [])
        .filter((inv: { created_at: string }) => {
          const invDate = new Date(inv.created_at);
          return (
            invDate.getFullYear() === d.getFullYear() &&
            invDate.getMonth() === d.getMonth()
          );
        })
        .reduce(
          (sum: number, inv: { amount?: number }) => sum + (inv.amount ?? 0),
          0,
        );
      mrrChart.push({ month: monthKey, revenue: monthRevenue });
    }

    const { searchParams } = new URL(request.url);
    const page = parseInt(searchParams.get("page") || "1", 10);
    const limit = Math.min(parseInt(searchParams.get("limit") || "50", 10), 200);
    const from = (page - 1) * limit;
    const to = from + limit - 1;

    let invoiceQuery = admin
      .from("subscription_invoices")
      .select("*, school:schools(name, subscription_plan)", { count: "exact" })
      .order("created_at", { ascending: false })
      .range(from, to);

    const planFilter = searchParams.get("plan");
    const statusFilter = searchParams.get("status");
    if (planFilter) {
      invoiceQuery = invoiceQuery.eq(
        "plan",
        planFilter as Database["public"]["Enums"]["subscription_plan"],
      );
    }
    if (statusFilter) invoiceQuery = invoiceQuery.eq("status", statusFilter);

    const { data: allInvoices, count: invoiceCount } = await invoiceQuery;

    return {
      mrr,
      arr,
      revenue_by_plan: revenueByPlan,
      churn_this_month: churnThisMonth,
      churn_rate: Math.round(churnRate * 100) / 100,
      new_schools_this_month: newSchools?.length ?? 0,
      upcoming_renewals: upcomingRenewals,
      mrr_chart: mrrChart,
      all_invoices: allInvoices ?? [],
      total_invoices: invoiceCount ?? 0,
    };
  },
});
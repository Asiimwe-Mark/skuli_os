import { NextRequest } from "next/server";
import {
  getSupabaseAndUser,
  requireRole,
  successResponse,
  errorResponse,
} from "@/lib/api-helpers";
import { createAdminClient } from "@/lib/supabase/admin";

export async function GET(request: NextRequest) {
  try {
    const ctx = await getSupabaseAndUser();
    requireRole(ctx, ["SUPER_ADMIN"]);

    const admin = createAdminClient();
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
    const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString();

    // Get all schools with subscription info
    const { data: schools } = await admin
      .from("schools")
      .select("id, name, subscription_plan, subscription_status, created_at, next_billing_date");

    const activeSchools = (schools ?? []).filter(
      (s: any) => s.subscription_status === "active" || s.subscription_status === "trialing"
    );

    // Calculate MRR based on plan prices
    const planPrices: Record<string, number> = {
      starter: 50000,
      growth: 100000,
      pro: 200000,
    };

    const mrr = activeSchools.reduce((sum: number, s: any) => {
      return sum + (planPrices[s.subscription_plan] ?? 0);
    }, 0);

    const arr = mrr * 12;

    // Revenue by plan
    const revenueByPlan: Record<string, { count: number; total: number }> = {};
    for (const plan of Object.keys(planPrices)) {
      const count = activeSchools.filter((s: any) => s.subscription_plan === plan).length;
      revenueByPlan[plan] = { count, total: count * planPrices[plan] };
    }

    // Churn this month
    const { data: churned } = await admin
      .from("schools")
      .select("id")
      .eq("subscription_status", "cancelled")
      .gte("updated_at", monthStart);

    const churnThisMonth = churned?.length ?? 0;
    const activeStartOfMonth = activeSchools.length + churnThisMonth;
    const churnRate = activeStartOfMonth > 0 ? (churnThisMonth / activeStartOfMonth) * 100 : 0;

    // New schools this month
    const { data: newSchools } = await admin
      .from("schools")
      .select("id")
      .gte("created_at", monthStart);

    // Upcoming renewals (within 7 days)
    const sevenDaysFromNow = new Date(now.getTime() + 7 * 86400000).toISOString();
    const upcomingRenewals = (schools ?? []).filter(
      (s: any) => s.next_billing_date && s.next_billing_date <= sevenDaysFromNow && s.subscription_status === "active"
    );

    // MRR chart: last 12 months from subscription_invoices
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
        .filter((inv: any) => {
          const invDate = new Date(inv.created_at);
          return invDate.getFullYear() === d.getFullYear() && invDate.getMonth() === d.getMonth();
        })
        .reduce((sum: number, inv: any) => sum + (inv.amount ?? 0), 0);
      mrrChart.push({ month: monthKey, revenue: monthRevenue });
    }

    // All invoices (paginated)
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
    if (planFilter) invoiceQuery = invoiceQuery.eq("plan", planFilter);
    if (statusFilter) invoiceQuery = invoiceQuery.eq("status", statusFilter);

    const { data: allInvoices, count: invoiceCount } = await invoiceQuery;

    return successResponse({
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
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Internal server error";
    const status = err instanceof Error && "status" in err ? (err as any).status : 500;
    return errorResponse(message, status);
  }
}

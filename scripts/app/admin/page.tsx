"use client";

import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useSupabaseBrowser } from "@/lib/supabase/client";
import { formatUGX } from "@/lib/utils/currency";
import { formatDate } from "@/lib/utils/dates";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Building2,
  Users,
  CreditCard,
  MessageSquare,
  TrendingUp,
  GraduationCap,
  DollarSign,
  ArrowUpRight,
  ArrowDownRight,
} from "lucide-react";
import Link from "next/link";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";

interface School {
  id: string;
  name: string;
  district: string | null;
  subscription_plan: string;
  subscription_status: string;
  created_at: string;
}

interface Invoice {
  id: string;
  school_id: string;
  plan: string;
  amount: number;
  status: string;
  created_at: string;
  period_start: string;
}

const PLAN_PRICES: Record<string, number> = {
  starter: 50000,
  growth: 120000,
  pro: 250000,
};

function StatCard({
  label,
  value,
  icon: Icon,
  color,
  subtitle,
}: {
  label: string;
  value: string;
  icon: React.ComponentType<{ className?: string }>;
  color: string;
  subtitle?: string;
}) {
  return (
    <Card className="border-border bg-bg-tertiary">
      <CardContent className="p-6">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm text-muted">{label}</p>
            <p className="text-2xl font-bold mt-1 text-heading">{value}</p>
            {subtitle && <p className="text-xs text-muted mt-1">{subtitle}</p>}
          </div>
          <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${color}`}>
            <Icon className="w-6 h-6" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export default function AdminDashboardPage() {
  const supabase = useSupabaseBrowser();

  const { data: schools = [], isLoading: schoolsLoading } = useQuery<School[]>({
    queryKey: ["admin-schools"],
    queryFn: async () => {
      const { data } = await supabase
        .from("schools")
        .select("id, name, district, subscription_plan, subscription_status, created_at")
        .eq("is_deleted", false)
        .order("created_at", { ascending: false });
      return (data || []) as School[];
    },
  });

  const { data: studentCount = 0 } = useQuery<number>({
    queryKey: ["admin-student-count"],
    queryFn: async () => {
      const { count } = await supabase
        .from("students")
        .select("id", { count: "exact", head: true })
        .eq("is_deleted", false);
      return count || 0;
    },
  });

  const { data: totalFeesProcessed = 0 } = useQuery<number>({
    queryKey: ["admin-total-fees"],
    queryFn: async () => {
      // Paginate to sum all confirmed payments without loading millions of rows at once
      const PAGE_SIZE = 10000;
      let offset = 0;
      let total = 0;
      while (true) {
        const { data, error } = await supabase
          .from("fee_payments")
          .select("amount")
          .eq("status", "confirmed")
          .range(offset, offset + PAGE_SIZE - 1);
        if (error || !data || data.length === 0) break;
        total += data.reduce((sum: number, p: { amount: number }) => sum + p.amount, 0);
        if (data.length < PAGE_SIZE) break;
        offset += PAGE_SIZE;
      }
      return total;
    },
  });

  const { data: smsSentThisMonth = 0 } = useQuery<number>({
    queryKey: ["admin-sms-month"],
    queryFn: async () => {
      const startOfMonth = new Date();
      startOfMonth.setDate(1);
      startOfMonth.setHours(0, 0, 0, 0);
      const { count } = await supabase
        .from("sms_logs")
        .select("id", { count: "exact", head: true })
        .gte("sent_at", startOfMonth.toISOString());
      return count || 0;
    },
  });

  const { data: invoices = [] } = useQuery<Invoice[]>({
    queryKey: ["admin-invoices-chart"],
    queryFn: async () => {
      const { data } = await supabase
        .from("subscription_invoices")
        .select("id, school_id, plan, amount, status, created_at, period_start")
        .eq("status", "paid")
        .order("created_at", { ascending: true });
      return (data || []) as Invoice[];
    },
  });

  const totalSchools = schools.length;
  const activeSchools = schools.filter(
    (s) => s.subscription_status === "active" || s.subscription_status === "trial"
  ).length;
  const mrr = schools
    .filter((s) => s.subscription_status === "active")
    .reduce((sum, s) => sum + (PLAN_PRICES[s.subscription_plan] || 0), 0);

  // New schools this month vs last month
  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const startOfLastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const endOfLastMonth = new Date(now.getFullYear(), now.getMonth(), 0);

  const newThisMonth = schools.filter(
    (s) => new Date(s.created_at) >= startOfMonth
  ).length;
  const newLastMonth = schools.filter(
    (s) => new Date(s.created_at) >= startOfLastMonth && new Date(s.created_at) <= endOfLastMonth
  ).length;
  const growthChange = newLastMonth > 0
    ? Math.round(((newThisMonth - newLastMonth) / newLastMonth) * 100)
    : newThisMonth > 0 ? 100 : 0;

  // MRR chart data - last 12 months
  const mrrChartData = useMemo(() => {
    const months: { month: string; revenue: number }[] = [];
    for (let i = 11; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const monthEnd = new Date(d.getFullYear(), d.getMonth() + 1, 0);
      const label = d.toLocaleDateString("en-US", { month: "short", year: "2-digit" });

      // Sum invoices paid in this month
      const monthRevenue = invoices
        .filter((inv) => {
          const invDate = new Date(inv.created_at);
          return invDate >= d && invDate <= monthEnd;
        })
        .reduce((sum, inv) => sum + inv.amount, 0);

      months.push({ month: label, revenue: monthRevenue });
    }
    return months;
  }, [invoices, now]);

  const starterCount = schools.filter((s) => s.subscription_plan === "starter").length;
  const growthCount = schools.filter((s) => s.subscription_plan === "growth").length;
  const proCount = schools.filter((s) => s.subscription_plan === "pro").length;

  if (schoolsLoading) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-bold text-heading">Platform Overview</h1>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <Skeleton key={i} className="h-28 rounded-xl bg-bg-tertiary" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-heading">Platform Overview</h1>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          label="Total Schools"
          value={String(totalSchools)}
          icon={Building2}
          color="bg-warning-50 text-secondary"
        />
        <StatCard
          label="Active Schools"
          value={String(activeSchools)}
          icon={Users}
          color="bg-success-50 text-secondary"
        />
        <StatCard
          label="MRR"
          value={formatUGX(mrr)}
          icon={TrendingUp}
          color="bg-bg-tertiary text-muted"
        />
        <StatCard
          label="Total Students"
          value={(studentCount ?? 0).toLocaleString()}
          icon={GraduationCap}
          color="bg-bg-tertiary text-muted"
        />
        <StatCard
          label="Total Fees Processed"
          value={formatUGX(totalFeesProcessed)}
          icon={DollarSign}
          color="bg-success-50 text-secondary"
        />
        <StatCard
          label="SMS Sent (This Month)"
          value={String(smsSentThisMonth)}
          icon={MessageSquare}
          color="bg-info-50 text-secondary"
        />
        <StatCard
          label="New Schools (This Month)"
          value={String(newThisMonth)}
          icon={growthChange >= 0 ? ArrowUpRight : ArrowDownRight}
          color={growthChange >= 0 ? "bg-success-50 text-secondary" : "bg-danger-50 text-secondary"}
          subtitle={`${growthChange >= 0 ? "+" : ""}${growthChange}% vs last month (${newLastMonth})`}
        />
        <StatCard
          label="Plans"
          value={`${starterCount}S / ${growthCount}G / ${proCount}P`}
          icon={CreditCard}
          color="bg-orange-500/10 text-orange-400"
        />
      </div>

      {/* MRR Chart */}
      <Card className="border-border bg-bg-tertiary">
        <CardHeader>
          <CardTitle className="text-heading text-base">MRR - Last 12 Months</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={mrrChartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                <XAxis dataKey="month" tick={{ fill: "rgba(255,255,255,0.5)", fontSize: 12 }} />
                <YAxis tick={{ fill: "rgba(255,255,255,0.5)", fontSize: 12 }} tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} />
                <Tooltip
                  contentStyle={{ background: "#1A1A2E", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8 }}
                  labelStyle={{ color: "rgba(255,255,255,0.6)" }}
                  formatter={(value) => [formatUGX(Number(value)), "Revenue"]}
                />
                <Line type="monotone" dataKey="revenue" stroke="#f59e0b" strokeWidth={2} dot={{ fill: "#f59e0b", r: 4 }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>

      {/* Recent Schools */}
      <Card className="border-border bg-bg-tertiary">
        <CardContent className="p-4 sm:p-6">
          <h2 className="text-lg font-semibold text-heading mb-4">Recent Schools</h2>
          {schools.length === 0 ? (
            <p className="text-muted text-center py-8">No schools on the platform yet</p>
          ) : (
            <>
              {/* Desktop Table */}
              <div className="hidden sm:block overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border">
                      <th className="text-left text-muted font-medium py-2">School</th>
                      <th className="text-left text-muted font-medium py-2">District</th>
                      <th className="text-left text-muted font-medium py-2">Plan</th>
                      <th className="text-left text-muted font-medium py-2">Status</th>
                      <th className="text-left text-muted font-medium py-2">Created</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/50">
                    {schools.slice(0, 10).map((s) => (
                      <tr key={s.id} className="hover:bg-card-hover">
                        <td className="py-3">
                          <Link href={`/admin/schools/${s.id}`} className="font-medium text-heading hover:text-warning-600 transition-colors">
                            {s.name}
                          </Link>
                        </td>
                        <td className="py-3 text-muted">{s.district || "-"}</td>
                        <td className="py-3">
                          <Badge variant="outline" className="text-xs border-border text-heading">
                            {s.subscription_plan}
                          </Badge>
                        </td>
                        <td className="py-3">
                          <span
                            className={`text-xs px-2 py-1 rounded ${ s.subscription_status === "active" ? "bg-success-50 text-success-700 dark:bg-success-900/30 dark:text-success-400" : s.subscription_status === "trial" ? "bg-bg-tertiary text-muted" : "bg-danger-50 text-danger-700 dark:bg-danger-900/30 dark:text-danger-400" }`}
                          >
                            {s.subscription_status}
                          </span>
                        </td>
                        <td className="py-3 text-muted">{formatDate(s.created_at)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Mobile Cards */}
              <div className="sm:hidden space-y-2">
                {schools.slice(0, 10).map((s) => (
                  <Link key={s.id} href={`/admin/schools/${s.id}`} className="block p-3 rounded-lg border border-border hover:bg-card-hover transition-colors">
                    <div className="flex items-start justify-between mb-1">
                      <p className="text-sm font-medium text-heading truncate flex-1">{s.name}</p>
                      <span
                        className={`text-xs px-2 py-0.5 rounded ml-2 shrink-0 ${ s.subscription_status === "active" ? "bg-success-50 text-success-700 dark:bg-success-900/30 dark:text-success-400" : s.subscription_status === "trial" ? "bg-bg-tertiary text-muted" : "bg-danger-50 text-danger-700 dark:bg-danger-900/30 dark:text-danger-400" }`}
                      >
                        {s.subscription_status}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 text-xs text-muted">
                      {s.district && <span>{s.district}</span>}
                      <Badge variant="outline" className="text-[10px] border-border text-heading">
                        {s.subscription_plan}
                      </Badge>
                      <span>{formatDate(s.created_at)}</span>
                    </div>
                  </Link>
                ))}
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

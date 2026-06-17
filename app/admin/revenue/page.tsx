"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { formatUGX } from "@/lib/utils/currency";
import { formatDate } from "@/lib/utils/dates";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  TrendingUp,
  DollarSign,
  Search,
  Download,
  Building2,
} from "lucide-react";

const PLAN_PRICES: Record<string, number> = {
  starter: 50000,
  growth: 120000,
  pro: 250000,
};

type InvoiceSchool = {
  name: string;
  subscription_plan: string;
};

type Invoice = {
  id: string;
  school_id: string;
  school?: InvoiceSchool;
  plan: string;
  amount: number;
  status: string;
  period_start: string;
  period_end: string;
  paid_at?: string;
  created_at: string;
};

type UpcomingRenewal = {
  id: string;
  name: string;
  subscription_plan: string;
  next_billing_date: string;
  subscription_status: string;
};

export default function AdminRevenuePage() {
  const [search, setSearch] = useState("");

  const { data, isLoading } = useQuery({
    queryKey: ["admin-revenue"],
    queryFn: async () => {
      const res = await fetch("/api/admin/revenue");
      const json = await res.json();
      if (!json.success) throw new Error(json.error);
      return json.data;
    },
  });

  const mrr = data?.mrr ?? 0;
  const arr = data?.arr ?? 0;
  const revenueByPlan = data?.revenue_by_plan ?? {};
  const starterCount = revenueByPlan?.starter?.count ?? 0;
  const growthCount = revenueByPlan?.growth?.count ?? 0;
  const proCount = revenueByPlan?.pro?.count ?? 0;
  const activeSchoolsCount = starterCount + growthCount + proCount;
  const churnRate = data?.churn_rate ?? 0;
  const cancelledSchools = data?.churn_this_month ?? 0;
  const newThisMonth = data?.new_schools_this_month ?? 0;
  const netNewThisMonth = newThisMonth - cancelledSchools;
  const upcomingRenewals: UpcomingRenewal[] = data?.upcoming_renewals ?? [];
  const invoices: Invoice[] = data?.all_invoices ?? [];

  // Build school map from invoices' joined data
  const schoolMap: Record<string, { name: string; subscription_plan: string }> = {};
  for (const inv of invoices) {
    if (inv.school?.name && !schoolMap[inv.school_id]) {
      schoolMap[inv.school_id] = { name: inv.school.name, subscription_plan: inv.school.subscription_plan };
    }
  }

  const filteredInvoices = invoices.filter((inv: Invoice) => {
    if (!search) return true;
    const schoolName = inv.school?.name || schoolMap[inv.school_id]?.name || "";
    return schoolName.toLowerCase().includes(search.toLowerCase());
  });

  const handleCSVExport = () => {
    const headers = ["School", "Plan", "Amount", "Status", "Period Start", "Period End", "Paid At"];
    const rows = filteredInvoices.map((inv: Invoice) => [
      inv.school?.name || inv.school_id,
      inv.plan,
      inv.amount,
      inv.status,
      inv.period_start,
      inv.period_end,
      inv.paid_at || "",
    ]);
    const csv = [headers, ...rows].map((r) => r.join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "invoices.csv";
    a.click();
    URL.revokeObjectURL(url);
  };

  if (isLoading) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-bold text-heading">Revenue</h1>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-28 rounded-xl bg-bg-tertiary" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-heading">Revenue</h1>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="border-border bg-bg-tertiary">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted">MRR</p>
                <p className="text-2xl font-bold text-heading">{formatUGX(mrr)}</p>
              </div>
              <div className="w-12 h-12 rounded-xl flex items-center justify-center bg-warning-50 text-warning-700">
                <TrendingUp className="w-6 h-6" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="border-border bg-bg-tertiary">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted">ARR</p>
                <p className="text-2xl font-bold text-heading">{formatUGX(arr)}</p>
              </div>
              <div className="w-12 h-12 rounded-xl flex items-center justify-center bg-success-50 text-success-700">
                <DollarSign className="w-6 h-6" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="border-border bg-bg-tertiary">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted">Active Schools</p>
                <p className="text-2xl font-bold text-heading">{activeSchoolsCount}</p>
              </div>
              <div className="w-12 h-12 rounded-xl flex items-center justify-center bg-bg-tertiary text-muted">
                <Building2 className="w-6 h-6" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="border-border bg-bg-tertiary">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted">Churn Rate</p>
                <p className="text-2xl font-bold text-heading">{churnRate}%</p>
                <p className="text-xs text-muted mt-1">{cancelledSchools} total cancelled</p>
              </div>
              <div className="w-12 h-12 rounded-xl flex items-center justify-center bg-danger-50 text-danger-700">
                <TrendingUp className="w-6 h-6" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="border-border bg-bg-tertiary">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted">Net New Schools</p>
                <p className="text-2xl font-bold text-heading">{netNewThisMonth >= 0 ? "+" : ""}{netNewThisMonth}</p>
                <p className="text-xs text-muted mt-1">This month</p>
              </div>
              <div className="w-12 h-12 rounded-xl flex items-center justify-center bg-bg-tertiary text-muted">
                <Building2 className="w-6 h-6" />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Revenue by Plan */}
      <Card className="border-border bg-bg-tertiary">
        <CardHeader>
          <CardTitle className="text-heading text-base">Revenue by Plan</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {[
              { plan: "starter", count: starterCount, price: 50000, color: "bg-bg-tertiary" },
              { plan: "growth", count: growthCount, price: 120000, color: "bg-bg-tertiary" },
              { plan: "pro", count: proCount, price: 250000, color: "bg-bg-tertiary" },
            ].map(({ plan, count, price, color }) => {
              const revenue = count * price;
              const totalRev = starterCount * 50000 + growthCount * 120000 + proCount * 250000 || 1;
              const pct = Math.round((revenue / totalRev) * 100);
              return (
                <div key={plan} className="space-y-2">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-heading capitalize font-medium">{plan}</span>
                    <span className="text-muted">
                      {count} school{count !== 1 ? "s" : ""} - {formatUGX(price)} = {formatUGX(revenue)}
                    </span>
                  </div>
                  <div className="w-full bg-bg-tertiary rounded-full h-2.5">
                    <div
                      className={`${color} h-2.5 rounded-full transition-all`}
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* Upcoming Renewals */}
      {upcomingRenewals.length > 0 && (
        <Card className="border-border bg-bg-tertiary">
          <CardHeader>
            <CardTitle className="text-heading text-base">Upcoming Renewals (Next 7 Days)</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border">
                    <th className="text-left text-muted font-medium py-2">School</th>
                    <th className="text-left text-muted font-medium py-2">Plan</th>
                    <th className="text-left text-muted font-medium py-2">Renewal Date</th>
                    <th className="text-left text-muted font-medium py-2">Amount</th>
                    <th className="text-left text-muted font-medium py-2">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/50">
                  {upcomingRenewals.map((school: UpcomingRenewal) => (
                    <tr key={school.id} className="hover:bg-card-hover">
                      <td className="py-3 text-heading font-medium">{school.name}</td>
                      <td className="py-3">
                        <Badge variant="outline" className="text-xs border-border text-heading capitalize">
                          {school.subscription_plan}
                        </Badge>
                      </td>
                      <td className="py-3 text-muted">{formatDate(school.next_billing_date)}</td>
                      <td className="py-3 text-heading">{formatUGX(PLAN_PRICES[school.subscription_plan] || 0)}</td>
                      <td className="py-3">
                        <span className="text-xs px-2 py-1 rounded bg-success-50 text-success-700">
                          {school.subscription_status}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Invoices Table */}
      <Card className="border-border bg-bg-tertiary">
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-heading text-base">All Invoices</CardTitle>
            <Button
              variant="outline"
              size="sm"
              className="border-border text-heading hover:bg-card-hover"
              onClick={handleCSVExport}
            >
              <Download className="w-4 h-4 mr-2" />
              Export CSV
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <div className="mb-4">
            <div className="relative max-w-sm">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted" />
              <Input
                placeholder="Search by school name..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-10 bg-bg-tertiary border-border text-heading"
              />
            </div>
          </div>

          {filteredInvoices.length === 0 ? (
            <p className="text-muted text-center py-8">No invoices found</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border">
                    <th className="text-left text-muted font-medium py-2">School</th>
                    <th className="text-left text-muted font-medium py-2">Plan</th>
                    <th className="text-left text-muted font-medium py-2">Amount</th>
                    <th className="text-left text-muted font-medium py-2">Status</th>
                    <th className="text-left text-muted font-medium py-2">Period</th>
                    <th className="text-left text-muted font-medium py-2">Date</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/50">
                  {filteredInvoices.map((inv: Invoice) => (
                    <tr key={inv.id} className="hover:bg-card-hover">
                      <td className="py-3 text-heading font-medium">
                        {inv.school?.name || inv.school_id}
                      </td>
                      <td className="py-3">
                        <Badge variant="outline" className="text-xs border-border text-heading capitalize">
                          {inv.plan}
                        </Badge>
                      </td>
                      <td className="py-3 text-heading">{formatUGX(inv.amount)}</td>
                      <td className="py-3">
                        <span
                          className={`text-xs px-2 py-1 rounded ${ inv.status === "paid" ? "bg-success-50 text-success-700" : inv.status === "pending" ? "bg-warning-50 text-warning-700" : "bg-danger-50 text-danger-700" }`}
                        >
                          {inv.status}
                        </span>
                      </td>
                      <td className="py-3 text-muted text-xs">
                        {formatDate(inv.period_start)} - {formatDate(inv.period_end)}
                      </td>
                      <td className="py-3 text-muted">{formatDate(inv.created_at)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

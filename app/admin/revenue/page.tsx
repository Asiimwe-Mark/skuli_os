"use client";

import { useMemo, useState } from "react";
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
  const upcomingRenewals = data?.upcoming_renewals ?? [];
  const invoices = data?.all_invoices ?? [];

  // Build school map from invoices' joined data
  const schoolMap: Record<string, { name: string; subscription_plan: string }> = {};
  for (const inv of invoices) {
    if (inv.school?.name && !schoolMap[inv.school_id]) {
      schoolMap[inv.school_id] = { name: inv.school.name, subscription_plan: inv.school.subscription_plan };
    }
  }

  const filteredInvoices = invoices.filter((inv: any) => {
    if (!search) return true;
    const schoolName = inv.school?.name || schoolMap[inv.school_id]?.name || "";
    return schoolName.toLowerCase().includes(search.toLowerCase());
  });

  const handleCSVExport = () => {
    const headers = ["School", "Plan", "Amount", "Status", "Period Start", "Period End", "Paid At"];
    const rows = filteredInvoices.map((inv: any) => [
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
        <h1 className="text-2xl font-bold text-white">Revenue</h1>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-28 rounded-xl bg-white/5" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-white">Revenue</h1>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="border-white/10 bg-white/5">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-white/60">MRR</p>
                <p className="text-2xl font-bold text-white">{formatUGX(mrr)}</p>
              </div>
              <div className="w-12 h-12 rounded-xl flex items-center justify-center bg-amber-500/10 text-amber-400">
                <TrendingUp className="w-6 h-6" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="border-white/10 bg-white/5">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-white/60">ARR</p>
                <p className="text-2xl font-bold text-white">{formatUGX(arr)}</p>
              </div>
              <div className="w-12 h-12 rounded-xl flex items-center justify-center bg-emerald-500/10 text-emerald-400">
                <DollarSign className="w-6 h-6" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="border-white/10 bg-white/5">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-white/60">Active Schools</p>
                <p className="text-2xl font-bold text-white">{activeSchoolsCount}</p>
              </div>
              <div className="w-12 h-12 rounded-xl flex items-center justify-center bg-blue-500/10 text-blue-400">
                <Building2 className="w-6 h-6" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="border-white/10 bg-white/5">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-white/60">Churn Rate</p>
                <p className="text-2xl font-bold text-white">{churnRate}%</p>
                <p className="text-xs text-white/40 mt-1">{cancelledSchools} total cancelled</p>
              </div>
              <div className="w-12 h-12 rounded-xl flex items-center justify-center bg-rose-500/10 text-rose-400">
                <TrendingUp className="w-6 h-6" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="border-white/10 bg-white/5">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-white/60">Net New Schools</p>
                <p className="text-2xl font-bold text-white">{netNewThisMonth >= 0 ? "+" : ""}{netNewThisMonth}</p>
                <p className="text-xs text-white/40 mt-1">This month</p>
              </div>
              <div className="w-12 h-12 rounded-xl flex items-center justify-center bg-purple-500/10 text-purple-400">
                <Building2 className="w-6 h-6" />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Revenue by Plan */}
      <Card className="border-white/10 bg-white/5">
        <CardHeader>
          <CardTitle className="text-white text-base">Revenue by Plan</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {[
              { plan: "starter", count: starterCount, price: 50000, color: "bg-blue-500" },
              { plan: "growth", count: growthCount, price: 120000, color: "bg-amber-500" },
              { plan: "pro", count: proCount, price: 250000, color: "bg-purple-500" },
            ].map(({ plan, count, price, color }) => {
              const revenue = count * price;
              const totalRev = starterCount * 50000 + growthCount * 120000 + proCount * 250000 || 1;
              const pct = Math.round((revenue / totalRev) * 100);
              return (
                <div key={plan} className="space-y-2">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-white capitalize font-medium">{plan}</span>
                    <span className="text-white/60">
                      {count} school{count !== 1 ? "s" : ""} × {formatUGX(price)} = {formatUGX(revenue)}
                    </span>
                  </div>
                  <div className="w-full bg-white/10 rounded-full h-2.5">
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
        <Card className="border-white/10 bg-white/5">
          <CardHeader>
            <CardTitle className="text-white text-base">Upcoming Renewals (Next 7 Days)</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-white/10">
                    <th className="text-left text-white/60 font-medium py-2">School</th>
                    <th className="text-left text-white/60 font-medium py-2">Plan</th>
                    <th className="text-left text-white/60 font-medium py-2">Renewal Date</th>
                    <th className="text-left text-white/60 font-medium py-2">Amount</th>
                    <th className="text-left text-white/60 font-medium py-2">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {upcomingRenewals.map((school: any) => (
                    <tr key={school.id} className="hover:bg-white/5">
                      <td className="py-3 text-white font-medium">{school.name}</td>
                      <td className="py-3">
                        <Badge variant="outline" className="text-xs border-white/20 text-white/80 capitalize">
                          {school.subscription_plan}
                        </Badge>
                      </td>
                      <td className="py-3 text-white/60">{formatDate(school.next_billing_date)}</td>
                      <td className="py-3 text-white">{formatUGX(PLAN_PRICES[school.subscription_plan] || 0)}</td>
                      <td className="py-3">
                        <span className="text-xs px-2 py-1 rounded bg-emerald-500/10 text-emerald-400">
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
      <Card className="border-white/10 bg-white/5">
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-white text-base">All Invoices</CardTitle>
            <Button
              variant="outline"
              size="sm"
              className="border-white/20 text-white hover:bg-white/10"
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
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/40" />
              <Input
                placeholder="Search by school name..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-10 bg-white/5 border-white/10 text-white"
              />
            </div>
          </div>

          {filteredInvoices.length === 0 ? (
            <p className="text-white/40 text-center py-8">No invoices found</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-white/10">
                    <th className="text-left text-white/60 font-medium py-2">School</th>
                    <th className="text-left text-white/60 font-medium py-2">Plan</th>
                    <th className="text-left text-white/60 font-medium py-2">Amount</th>
                    <th className="text-left text-white/60 font-medium py-2">Status</th>
                    <th className="text-left text-white/60 font-medium py-2">Period</th>
                    <th className="text-left text-white/60 font-medium py-2">Date</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {filteredInvoices.map((inv: any) => (
                    <tr key={inv.id} className="hover:bg-white/5">
                      <td className="py-3 text-white font-medium">
                        {inv.school?.name || inv.school_id}
                      </td>
                      <td className="py-3">
                        <Badge variant="outline" className="text-xs border-white/20 text-white/80 capitalize">
                          {inv.plan}
                        </Badge>
                      </td>
                      <td className="py-3 text-white">{formatUGX(inv.amount)}</td>
                      <td className="py-3">
                        <span
                          className={`text-xs px-2 py-1 rounded ${
                            inv.status === "paid"
                              ? "bg-emerald-500/10 text-emerald-400"
                              : inv.status === "pending"
                              ? "bg-amber-500/10 text-amber-400"
                              : "bg-rose-500/10 text-rose-400"
                          }`}
                        >
                          {inv.status}
                        </span>
                      </td>
                      <td className="py-3 text-white/60 text-xs">
                        {formatDate(inv.period_start)} — {formatDate(inv.period_end)}
                      </td>
                      <td className="py-3 text-white/60">{formatDate(inv.created_at)}</td>
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

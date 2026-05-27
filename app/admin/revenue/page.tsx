"use client";

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { createBrowserClient } from "@/lib/supabase/client";
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

interface School {
  id: string;
  name: string;
  subscription_plan: string;
  subscription_status: string;
}

interface Invoice {
  id: string;
  school_id: string;
  plan: string;
  amount: number;
  currency: string;
  period_start: string;
  period_end: string;
  status: string;
  paid_at: string | null;
  created_at: string;
}

const PLAN_PRICES: Record<string, number> = {
  starter: 50000,
  growth: 120000,
  pro: 250000,
};

export default function AdminRevenuePage() {
  const supabase = createBrowserClient();
  const [search, setSearch] = useState("");

  const { data: schools = [], isLoading: schoolsLoading } = useQuery<School[]>({
    queryKey: ["admin-schools-revenue"],
    queryFn: async () => {
      const { data } = await supabase
        .from("schools")
        .select("id, name, subscription_plan, subscription_status")
        .eq("is_deleted", false);
      return (data || []) as School[];
    },
  });

  const { data: invoices = [], isLoading: invoicesLoading } = useQuery<Invoice[]>({
    queryKey: ["admin-invoices"],
    queryFn: async () => {
      const { data } = await supabase
        .from("subscription_invoices")
        .select("*")
        .order("created_at", { ascending: false });
      return (data || []) as Invoice[];
    },
  });

  const schoolMap = useMemo(() => {
    const map: Record<string, School> = {};
    for (const s of schools) map[s.id] = s;
    return map;
  }, [schools]);

  const activeSchools = schools.filter(
    (s) => s.subscription_status === "active" || s.subscription_status === "trial"
  );

  const mrr = activeSchools.reduce(
    (sum, s) => sum + (PLAN_PRICES[s.subscription_plan] || 0),
    0
  );

  const starterCount = activeSchools.filter((s) => s.subscription_plan === "starter").length;
  const growthCount = activeSchools.filter((s) => s.subscription_plan === "growth").length;
  const proCount = activeSchools.filter((s) => s.subscription_plan === "pro").length;

  // Churn metrics
  const startOfMonth = new Date();
  startOfMonth.setDate(1);
  startOfMonth.setHours(0, 0, 0, 0);

  const cancelledSchools = schools.filter(
    (s) => s.subscription_status === "cancelled"
  ).length;
  const activeAtStart = activeSchools.length + cancelledSchools;
  const churnRate = activeAtStart > 0 ? Math.round((cancelledSchools / activeAtStart) * 100) : 0;
  const newThisMonth = schools.filter((s) => new Date(s.created_at) >= startOfMonth).length;
  const netNewThisMonth = newThisMonth - cancelledSchools;

  // Upcoming renewals — schools whose subscription period ends in next 7 days
  const now = new Date();
  const nextWeek = new Date(now.getTime() + 7 * 86400000);
  const upcomingRenewals = invoices.filter((inv) => {
    if (inv.status !== "paid") return false;
    const endDate = new Date(inv.period_end);
    return endDate >= now && endDate <= nextWeek;
  });

  const filteredInvoices = invoices.filter((inv) => {
    if (!search) return true;
    const schoolName = schoolMap[inv.school_id]?.name || "";
    return schoolName.toLowerCase().includes(search.toLowerCase());
  });

  const handleCSVExport = () => {
    const headers = ["School", "Plan", "Amount", "Status", "Period Start", "Period End", "Paid At"];
    const rows = filteredInvoices.map((inv) => [
      schoolMap[inv.school_id]?.name || inv.school_id,
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

  if (schoolsLoading || invoicesLoading) {
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
                <p className="text-2xl font-bold text-white">{formatUGX(mrr * 12)}</p>
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
                <p className="text-2xl font-bold text-white">{activeSchools.length}</p>
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
                  {upcomingRenewals.map((inv) => (
                    <tr key={inv.id} className="hover:bg-white/5">
                      <td className="py-3 text-white font-medium">
                        {schoolMap[inv.school_id]?.name || inv.school_id}
                      </td>
                      <td className="py-3">
                        <Badge variant="outline" className="text-xs border-white/20 text-white/80 capitalize">
                          {inv.plan}
                        </Badge>
                      </td>
                      <td className="py-3 text-white/60">{formatDate(inv.period_end)}</td>
                      <td className="py-3 text-white">{formatUGX(inv.amount)}</td>
                      <td className="py-3">
                        <span className="text-xs px-2 py-1 rounded bg-emerald-500/10 text-emerald-400">
                          {inv.status}
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
                  {filteredInvoices.map((inv) => (
                    <tr key={inv.id} className="hover:bg-white/5">
                      <td className="py-3 text-white font-medium">
                        {schoolMap[inv.school_id]?.name || inv.school_id}
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

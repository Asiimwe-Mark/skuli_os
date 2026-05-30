"use client";

import { useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { createBrowserClient } from "@/lib/supabase/client";
import { formatUGX } from "@/lib/utils/currency";
import { formatDate } from "@/lib/utils/dates";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  ArrowLeft,
  Building2,
  Users,
  CreditCard,
  AlertTriangle,
  Calendar,
  Mail,
  Phone,
  MapPin,
  Loader2,
  Shield,
  UserCheck,
} from "lucide-react";

interface School {
  id: string;
  name: string;
  logo_url: string | null;
  address: string | null;
  district: string | null;
  phone: string | null;
  email: string | null;
  motto: string | null;
  school_type: string;
  school_code: string;
  subscription_plan: string;
  subscription_status: string;
  trial_ends_at: string | null;
  max_students: number;
  created_at: string;
}

const PLAN_PRICES: Record<string, number> = {
  starter: 50000,
  growth: 120000,
  pro: 250000,
};

const PLAN_FEATURES: Record<string, string[]> = {
  starter: ["Up to 200 students", "1 user account", "Fee management", "Basic SMS", "Attendance tracking"],
  growth: ["Up to 500 students", "5 user accounts", "All modules", "Report cards & PDF", "Staff & payroll", "Priority support"],
  pro: ["Unlimited students", "Unlimited users", "All features", "Custom branding", "API access", "Dedicated support"],
};

export default function AdminSchoolDetailPage() {
  const params = useParams();
  const router = useRouter();
  const schoolId = params.id as string;
  const supabase = createBrowserClient();
  const queryClient = useQueryClient();

  const [suspendConfirm, setSuspendConfirm] = useState("");
  const [showSuspend, setShowSuspend] = useState(false);
  const [showExtendTrial, setShowExtendTrial] = useState(false);
  const [trialDate, setTrialDate] = useState("");
  const [showChangePlan, setShowChangePlan] = useState(false);
  const [newPlan, setNewPlan] = useState("");
  const [impersonating, setImpersonating] = useState(false);

  const { data: school, isLoading } = useQuery<School>({
    queryKey: ["admin-school", schoolId],
    queryFn: async () => {
      const { data } = await supabase
        .from("schools")
        .select("*")
        .eq("id", schoolId)
        .single();
      return data as School;
    },
    enabled: !!schoolId,
  });

  const { data: studentCount = 0 } = useQuery<number>({
    queryKey: ["admin-school-students", schoolId],
    queryFn: async () => {
      const { count } = await supabase
        .from("students")
        .select("id", { count: "exact", head: true })
        .eq("school_id", schoolId)
        .eq("is_deleted", false);
      return count || 0;
    },
    enabled: !!schoolId,
  });

  const { data: paymentStats = { count: 0, total: 0 } } = useQuery<{
    count: number;
    total: number;
  }>({
    queryKey: ["admin-school-payments", schoolId],
    queryFn: async () => {
      const { data } = await supabase
        .from("fee_payments")
        .select("amount")
        .eq("school_id", schoolId)
        .eq("status", "confirmed");
      if (!data) return { count: 0, total: 0 };
      return {
        count: data.length,
        total: data.reduce((sum: number, p: { amount: number }) => sum + p.amount, 0),
      };
    },
    enabled: !!schoolId,
  });

  const { data: smsCount = 0 } = useQuery<number>({
    queryKey: ["admin-school-sms", schoolId],
    queryFn: async () => {
      const { count } = await supabase
        .from("sms_logs")
        .select("id", { count: "exact", head: true })
        .eq("school_id", schoolId);
      return count || 0;
    },
    enabled: !!schoolId,
  });

  const { data: invoices = [] } = useQuery<{ id: string; plan: string; amount: number; status: string; period_start: string; period_end: string; paid_at: string | null; created_at: string }[]>({
    queryKey: ["admin-school-invoices", schoolId],
    queryFn: async () => {
      const { data } = await supabase
        .from("subscription_invoices")
        .select("id, plan, amount, status, period_start, period_end, paid_at, created_at")
        .eq("school_id", schoolId)
        .order("created_at", { ascending: false });
      return data || [];
    },
    enabled: !!schoolId,
  });

  const { data: smsLogs = [] } = useQuery<{ id: string; recipient_phone: string; message_body: string; status: string; cost: number | null; sent_at: string }[]>({
    queryKey: ["admin-school-sms-logs", schoolId],
    queryFn: async () => {
      const { data } = await supabase
        .from("sms_logs")
        .select("id, recipient_phone, message_body, status, cost, sent_at")
        .eq("school_id", schoolId)
        .order("sent_at", { ascending: false })
        .limit(50);
      return data || [];
    },
    enabled: !!schoolId,
  });

  async function adminSchoolPatch(updates: Record<string, unknown>) {
    const res = await fetch("/api/admin/schools", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: schoolId, ...updates }),
    });
    const json = await res.json();
    if (!res.ok) throw new Error(json.error || "Failed to update school");
    return json;
  }

  const suspendMutation = useMutation({
    mutationFn: async () => {
      await adminSchoolPatch({ subscription_status: "cancelled" });
      const { data: users } = await supabase
        .from("users")
        .select("id")
        .eq("school_id", schoolId);
      if (users) {
        for (const u of users) {
          await supabase
            .from("users")
            .update({ is_active: false } as Record<string, unknown>)
            .eq("id", u.id);
        }
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-school", schoolId] });
      setShowSuspend(false);
      setSuspendConfirm("");
    },
  });

  const reactivateMutation = useMutation({
    mutationFn: async () => {
      await adminSchoolPatch({ subscription_status: "active" });
      const { data: users } = await supabase
        .from("users")
        .select("id")
        .eq("school_id", schoolId);
      if (users) {
        for (const u of users) {
          await supabase
            .from("users")
            .update({ is_active: true } as Record<string, unknown>)
            .eq("id", u.id);
        }
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-school", schoolId] });
    },
  });

  const extendTrialMutation = useMutation({
    mutationFn: async () => {
      await adminSchoolPatch({
        trial_ends_at: new Date(trialDate).toISOString(),
        subscription_status: "trial",
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-school", schoolId] });
      setShowExtendTrial(false);
      setTrialDate("");
    },
  });

  const changePlanMutation = useMutation({
    mutationFn: async () => {
      const maxStudents =
        newPlan === "starter" ? 200 : newPlan === "growth" ? 500 : 99999;
      await adminSchoolPatch({
        subscription_plan: newPlan,
        max_students: maxStudents,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-school", schoolId] });
      setShowChangePlan(false);
      setNewPlan("");
    },
  });

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-48 bg-white/5" />
        <Skeleton className="h-64 rounded-xl bg-white/5" />
      </div>
    );
  }

  if (!school) {
    return (
      <div className="text-center py-12">
        <Building2 className="w-16 h-16 mx-auto mb-4 text-white/20" />
        <p className="text-white/60">School not found</p>
        <Link href="/admin/schools">
          <Button variant="outline" className="mt-4 border-white/20 text-white">
            Back to Schools
          </Button>
        </Link>
      </div>
    );
  }

  const usagePercent = Math.min(
    Math.round((studentCount / (school.max_students || 1)) * 100),
    100
  );

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <Link
            href="/admin/schools"
            className="inline-flex items-center gap-1 text-sm text-white/60 hover:text-white mb-2 transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            Back to Schools
          </Link>
          <div className="flex items-center gap-3">
            {school.logo_url ? (
              <img
                src={school.logo_url}
                alt={school.name}
                className="w-12 h-12 rounded-lg object-cover"
              />
            ) : (
              <div className="w-12 h-12 rounded-lg bg-amber-400/10 flex items-center justify-center text-amber-400 font-bold text-lg">
                {school.name?.slice(0, 2).toUpperCase()}
              </div>
            )}
            <div>
              <h1 className="text-2xl font-bold text-white">{school.name}</h1>
              <p className="text-white/60 text-sm">
                {school.district || "—"} · {school.school_code}
              </p>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Badge
            variant="outline"
            className={`text-xs border-current ${
              school.subscription_plan === "pro"
                ? "text-purple-400"
                : school.subscription_plan === "growth"
                ? "text-amber-400"
                : "text-blue-400"
            }`}
          >
            {school.subscription_plan}
          </Badge>
          <span
            className={`text-xs px-2 py-1 rounded ${
              school.subscription_status === "active"
                ? "bg-emerald-500/10 text-emerald-400"
                : school.subscription_status === "trial"
                ? "bg-blue-500/10 text-blue-400"
                : "bg-rose-500/10 text-rose-400"
            }`}
          >
            {school.subscription_status}
          </span>
        </div>
      </div>

      <Tabs defaultValue="overview">
        <TabsList className="bg-white/5 border border-white/10">
          <TabsTrigger value="overview" className="data-[state=active]:bg-white/10 data-[state=active]:text-white">Overview</TabsTrigger>
          <TabsTrigger value="subscription" className="data-[state=active]:bg-white/10 data-[state=active]:text-white">Subscription</TabsTrigger>
          <TabsTrigger value="usage" className="data-[state=active]:bg-white/10 data-[state=active]:text-white">Usage</TabsTrigger>
          <TabsTrigger value="danger" className="data-[state=active]:bg-white/10 data-[state=active]:text-white">Danger Zone</TabsTrigger>
        </TabsList>

        {/* Overview Tab */}
        <TabsContent value="overview">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-4">
            <Card className="border-white/10 bg-white/5">
              <CardHeader>
                <CardTitle className="text-white text-base">School Information</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex items-center gap-2 text-sm">
                  <MapPin className="w-4 h-4 text-white/40" />
                  <span className="text-white/60">Address:</span>
                  <span className="text-white">{school.address || "—"}</span>
                </div>
                <div className="flex items-center gap-2 text-sm">
                  <MapPin className="w-4 h-4 text-white/40" />
                  <span className="text-white/60">District:</span>
                  <span className="text-white">{school.district || "—"}</span>
                </div>
                <div className="flex items-center gap-2 text-sm">
                  <Phone className="w-4 h-4 text-white/40" />
                  <span className="text-white/60">Phone:</span>
                  <span className="text-white">{school.phone || "—"}</span>
                </div>
                <div className="flex items-center gap-2 text-sm">
                  <Mail className="w-4 h-4 text-white/40" />
                  <span className="text-white/60">Email:</span>
                  <span className="text-white">{school.email || "—"}</span>
                </div>
                <div className="flex items-center gap-2 text-sm">
                  <Building2 className="w-4 h-4 text-white/40" />
                  <span className="text-white/60">Type:</span>
                  <span className="text-white capitalize">{school.school_type}</span>
                </div>
                {school.motto && (
                  <div className="flex items-center gap-2 text-sm">
                    <span className="text-white/60">Motto:</span>
                    <span className="text-white italic">"{school.motto}"</span>
                  </div>
                )}
              </CardContent>
            </Card>

            <Card className="border-white/10 bg-white/5">
              <CardHeader>
                <CardTitle className="text-white text-base">Subscription</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex items-center gap-2 text-sm">
                  <CreditCard className="w-4 h-4 text-white/40" />
                  <span className="text-white/60">Plan:</span>
                  <span className="text-white capitalize font-medium">{school.subscription_plan}</span>
                  <span className="text-white/60">({formatUGX(PLAN_PRICES[school.subscription_plan] || 0)}/mo)</span>
                </div>
                <div className="flex items-center gap-2 text-sm">
                  <span className="text-white/60">Status:</span>
                  <span
                    className={`text-xs px-2 py-0.5 rounded ${
                      school.subscription_status === "active"
                        ? "bg-emerald-500/10 text-emerald-400"
                        : school.subscription_status === "trial"
                        ? "bg-blue-500/10 text-blue-400"
                        : "bg-rose-500/10 text-rose-400"
                    }`}
                  >
                    {school.subscription_status}
                  </span>
                </div>
                {school.trial_ends_at && (
                  <div className="flex items-center gap-2 text-sm">
                    <Calendar className="w-4 h-4 text-white/40" />
                    <span className="text-white/60">Trial ends:</span>
                    <span className="text-white">{formatDate(school.trial_ends_at)}</span>
                  </div>
                )}
                <div className="flex items-center gap-2 text-sm">
                  <Calendar className="w-4 h-4 text-white/40" />
                  <span className="text-white/60">Created:</span>
                  <span className="text-white">{formatDate(school.created_at)}</span>
                </div>
              </CardContent>
            </Card>

            <Card className="border-white/10 bg-white/5 md:col-span-2">
              <CardHeader>
                <CardTitle className="text-white text-base">Student Capacity</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex items-center justify-between text-sm mb-2">
                  <span className="text-white/60">{studentCount} / {school.max_students} students</span>
                  <span className="text-white font-medium">{usagePercent}%</span>
                </div>
                <div className="w-full bg-white/10 rounded-full h-3">
                  <div
                    className={`h-3 rounded-full transition-all ${
                      usagePercent > 90
                        ? "bg-rose-500"
                        : usagePercent > 70
                        ? "bg-amber-400"
                        : "bg-emerald-500"
                    }`}
                    style={{ width: `${usagePercent}%` }}
                  />
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* Subscription Tab */}
        <TabsContent value="subscription">
          <div className="space-y-6 mt-4">
            <Card className="border-white/10 bg-white/5">
              <CardHeader>
                <CardTitle className="text-white text-base">Current Plan: {school.subscription_plan}</CardTitle>
              </CardHeader>
              <CardContent>
                <ul className="space-y-2 mb-4">
                  {(PLAN_FEATURES[school.subscription_plan] || []).map((f) => (
                    <li key={f} className="flex items-center gap-2 text-sm text-white/80">
                      <UserCheck className="w-4 h-4 text-emerald-400" />
                      {f}
                    </li>
                  ))}
                </ul>
                <div className="flex gap-3">
                  {school.subscription_status === "trial" && (
                    <Button
                      variant="outline"
                      className="border-white/20 text-white hover:bg-white/10"
                      onClick={() => setShowExtendTrial(true)}
                    >
                      <Calendar className="w-4 h-4 mr-2" />
                      Extend Trial
                    </Button>
                  )}
                  <Button
                    variant="outline"
                    className="border-white/20 text-white hover:bg-white/10"
                    onClick={() => {
                      setNewPlan(school.subscription_plan);
                      setShowChangePlan(true);
                    }}
                  >
                    <CreditCard className="w-4 h-4 mr-2" />
                    Change Plan
                  </Button>
                </div>

                {/* Extend Trial Modal */}
                {showExtendTrial && (
                  <div className="mt-4 p-4 rounded-lg border border-white/10 bg-white/5 space-y-3">
                    <p className="text-sm text-white">Select new trial end date:</p>
                    <Input
                      type="date"
                      value={trialDate}
                      onChange={(e) => setTrialDate(e.target.value)}
                      className="bg-white/5 border-white/20 text-white max-w-xs"
                    />
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        disabled={!trialDate || extendTrialMutation.isPending}
                        onClick={() => extendTrialMutation.mutate()}
                      >
                        {extendTrialMutation.isPending ? (
                          <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                        ) : null}
                        Confirm
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="text-white/60"
                        onClick={() => setShowExtendTrial(false)}
                      >
                        Cancel
                      </Button>
                    </div>
                  </div>
                )}

                {/* Change Plan Modal */}
                {showChangePlan && (
                  <div className="mt-4 p-4 rounded-lg border border-white/10 bg-white/5 space-y-3">
                    <p className="text-sm text-white">Select new plan:</p>
                    <select
                      value={newPlan}
                      onChange={(e) => setNewPlan(e.target.value)}
                      className="w-full max-w-xs h-10 px-3 rounded-lg bg-navy-800 border border-white/20 text-white text-sm"
                    >
                      <option value="starter">Starter — {formatUGX(50000)}/mo</option>
                      <option value="growth">Growth — {formatUGX(120000)}/mo</option>
                      <option value="pro">Pro — {formatUGX(250000)}/mo</option>
                    </select>
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        disabled={!newPlan || newPlan === school.subscription_plan || changePlanMutation.isPending}
                        onClick={() => changePlanMutation.mutate()}
                      >
                        {changePlanMutation.isPending ? (
                          <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                        ) : null}
                        Confirm
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="text-white/60"
                        onClick={() => setShowChangePlan(false)}
                      >
                        Cancel
                      </Button>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
            {/* Subscription Invoices */}
            <Card className="border-white/10 bg-white/5">
              <CardHeader>
                <CardTitle className="text-white text-base">Subscription Invoices</CardTitle>
              </CardHeader>
              <CardContent>
                {invoices.length === 0 ? (
                  <p className="text-white/40 text-center py-4">No invoices yet</p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-white/10">
                          <th className="text-left text-white/60 font-medium py-2">Plan</th>
                          <th className="text-left text-white/60 font-medium py-2">Amount</th>
                          <th className="text-left text-white/60 font-medium py-2">Status</th>
                          <th className="text-left text-white/60 font-medium py-2">Period</th>
                          <th className="text-left text-white/60 font-medium py-2">Date</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-white/5">
                        {invoices.map((inv) => (
                          <tr key={inv.id} className="hover:bg-white/5">
                            <td className="py-2 text-white capitalize">{inv.plan}</td>
                            <td className="py-2 text-white">{formatUGX(inv.amount)}</td>
                            <td className="py-2">
                              <span className={`text-xs px-2 py-0.5 rounded ${
                                inv.status === "paid" ? "bg-emerald-500/10 text-emerald-400"
                                  : inv.status === "pending" ? "bg-amber-500/10 text-amber-400"
                                  : "bg-rose-500/10 text-rose-400"
                              }`}>
                                {inv.status}
                              </span>
                            </td>
                            <td className="py-2 text-white/60 text-xs">
                              {formatDate(inv.period_start)} — {formatDate(inv.period_end)}
                            </td>
                            <td className="py-2 text-white/60">{formatDate(inv.created_at)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* Usage Tab */}
        <TabsContent value="usage">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-4">
            <Card className="border-white/10 bg-white/5">
              <CardContent className="p-6 text-center">
                <Users className="w-8 h-8 text-purple-400 mx-auto mb-2" />
                <p className="text-2xl font-bold text-white">{studentCount}</p>
                <p className="text-sm text-white/60">Students Enrolled</p>
              </CardContent>
            </Card>
            <Card className="border-white/10 bg-white/5">
              <CardContent className="p-6 text-center">
                <CreditCard className="w-8 h-8 text-emerald-400 mx-auto mb-2" />
                <p className="text-2xl font-bold text-white">{paymentStats.count}</p>
                <p className="text-sm text-white/60">Fee Payments</p>
                <p className="text-sm text-emerald-400 mt-1">{formatUGX(paymentStats.total)}</p>
              </CardContent>
            </Card>
            <Card className="border-white/10 bg-white/5">
              <CardContent className="p-6 text-center">
                <Mail className="w-8 h-8 text-blue-400 mx-auto mb-2" />
                <p className="text-2xl font-bold text-white">{smsCount}</p>
                <p className="text-sm text-white/60">SMS Sent</p>
              </CardContent>
            </Card>
          </div>

          {/* SMS Logs Table */}
          <Card className="border-white/10 bg-white/5 mt-4">
            <CardHeader>
              <CardTitle className="text-white text-base">Recent SMS Logs (Last 50)</CardTitle>
            </CardHeader>
            <CardContent>
              {smsLogs.length === 0 ? (
                <p className="text-white/40 text-center py-4">No SMS logs</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-white/10">
                        <th className="text-left text-white/60 font-medium py-2">Recipient</th>
                        <th className="text-left text-white/60 font-medium py-2">Message</th>
                        <th className="text-left text-white/60 font-medium py-2">Status</th>
                        <th className="text-left text-white/60 font-medium py-2">Cost</th>
                        <th className="text-left text-white/60 font-medium py-2">Sent At</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-white/5">
                      {smsLogs.map((log) => (
                        <tr key={log.id} className="hover:bg-white/5">
                          <td className="py-2 text-white font-mono text-xs">{log.recipient_phone}</td>
                          <td className="py-2 text-white/60 text-xs max-w-[200px] truncate">{log.message_body}</td>
                          <td className="py-2">
                            <span className={`text-xs px-2 py-0.5 rounded ${
                              log.status === "delivered" ? "bg-emerald-500/10 text-emerald-400"
                                : log.status === "sent" ? "bg-blue-500/10 text-blue-400"
                                : log.status === "failed" ? "bg-rose-500/10 text-rose-400"
                                : "bg-amber-500/10 text-amber-400"
                            }`}>
                              {log.status}
                            </span>
                          </td>
                          <td className="py-2 text-white/60">{log.cost ? formatUGX(log.cost) : "—"}</td>
                          <td className="py-2 text-white/60 text-xs">{formatDate(log.sent_at)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Danger Zone Tab */}
        <TabsContent value="danger">
          <div className="space-y-4 mt-4">
            <Card className="border-rose-500/20 bg-rose-500/5">
              <CardHeader>
                <CardTitle className="text-rose-400 text-base flex items-center gap-2">
                  <AlertTriangle className="w-5 h-5" />
                  Danger Zone
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {/* Impersonate */}
                <div className="flex items-center justify-between p-4 rounded-lg border border-white/10 bg-white/5">
                  <div>
                    <p className="text-sm font-medium text-white">Impersonate School Admin</p>
                    <p className="text-xs text-white/60">Open a new session logged in as this school&apos;s admin</p>
                  </div>
                  <Button
                    variant="outline"
                    className="border-amber-400/40 text-amber-400 hover:bg-amber-400/10"
                    disabled={impersonating}
                    onClick={async () => {
                      setImpersonating(true);
                      try {
                        const res = await fetch("/api/admin/impersonate", {
                          method: "POST",
                          headers: { "Content-Type": "application/json" },
                          body: JSON.stringify({ school_id: schoolId }),
                        });
                        const d = await res.json();
                        if (d.success && d.data?.url) {
                          window.open(d.data.url, "_blank");
                        } else {
                          alert(d.error || "Failed to impersonate");
                        }
                      } catch {
                        alert("Failed to impersonate");
                      } finally {
                        setImpersonating(false);
                      }
                    }}
                  >
                    {impersonating ? (
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    ) : (
                      <Shield className="w-4 h-4 mr-2" />
                    )}
                    {impersonating ? "Loading..." : "Impersonate"}
                  </Button>
                </div>

                {/* Suspend / Reactivate */}
                <div className="flex items-center justify-between p-4 rounded-lg border border-white/10 bg-white/5">
                  <div>
                    <p className="text-sm font-medium text-white">
                      {school.subscription_status === "cancelled"
                        ? "Reactivate Account"
                        : "Suspend Account"}
                    </p>
                    <p className="text-xs text-white/60">
                      {school.subscription_status === "cancelled"
                        ? "Restore access for all users in this school"
                        : "Disable access for all users in this school"}
                    </p>
                  </div>
                  {school.subscription_status === "cancelled" ? (
                    <Button
                      variant="secondary"
                      disabled={reactivateMutation.isPending}
                      onClick={() => reactivateMutation.mutate()}
                    >
                      {reactivateMutation.isPending ? (
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      ) : null}
                      Reactivate
                    </Button>
                  ) : (
                    <Button
                      variant="destructive"
                      onClick={() => setShowSuspend(true)}
                    >
                      <AlertTriangle className="w-4 h-4 mr-2" />
                      Suspend
                    </Button>
                  )}
                </div>

                {/* Suspend Confirmation */}
                {showSuspend && (
                  <div className="p-4 rounded-lg border border-rose-500/40 bg-rose-500/10 space-y-3">
                    <p className="text-sm text-white">
                      Type <strong className="text-rose-400">{school.name}</strong> to confirm suspension:
                    </p>
                    <Input
                      value={suspendConfirm}
                      onChange={(e) => setSuspendConfirm(e.target.value)}
                      placeholder="Type school name..."
                      className="bg-white/5 border-rose-500/40 text-white max-w-md"
                    />
                    <div className="flex gap-2">
                      <Button
                        variant="destructive"
                        size="sm"
                        disabled={suspendConfirm !== school.name || suspendMutation.isPending}
                        onClick={() => suspendMutation.mutate()}
                      >
                        {suspendMutation.isPending ? (
                          <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                        ) : null}
                        Confirm Suspension
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="text-white/60"
                        onClick={() => {
                          setShowSuspend(false);
                          setSuspendConfirm("");
                        }}
                      >
                        Cancel
                      </Button>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}

"use client";

import { useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import Image from "next/image";
import Link from "next/link";
import { useSupabaseBrowser } from "@/lib/supabase/client";
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
  const supabase = useSupabaseBrowser();
  const queryClient = useQueryClient();

  const [suspendConfirm, setSuspendConfirm] = useState("");
  const [showSuspend, setShowSuspend] = useState(false);
  const [showExtendTrial, setShowExtendTrial] = useState(false);
  const [trialDate, setTrialDate] = useState("");
  const [showChangePlan, setShowChangePlan] = useState(false);
  const [newPlan, setNewPlan] = useState("");
  const [impersonating, setImpersonating] = useState(false);

  const { data: school, isLoading } = useQuery<School | null>({
    queryKey: ["admin-school", schoolId],
    queryFn: async () => {
      const { data } = await supabase
        .from("schools")
        .select("id, name, school_code, address, district, phone, email, logo_url, motto, school_type, subscription_plan, subscription_status, trial_ends_at, created_at")
        .eq("id", schoolId)
        .single();
      return data as School | null;
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

  type Invoice = { id: string; plan: string; amount: number; status: string; period_start: string; period_end: string; paid_at: string | null; created_at: string };
  
  const { data: invoices = [] } = useQuery<Invoice[]>({
    queryKey: ["admin-school-invoices", schoolId],
    queryFn: async (): Promise<Invoice[]> => {
      const { data } = await supabase
        .from("subscription_invoices")
        .select("id, plan, amount, status, period_start, period_end, paid_at, created_at")
        .eq("school_id", schoolId)
        .order("created_at", { ascending: false });
      return (data || []) as Invoice[];
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
      return (data || []) as { id: string; recipient_phone: string; message_body: string; status: string; cost: number | null; sent_at: string }[];
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
            .update({ is_active: false })
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
            .update<{ is_active: boolean }>({ is_active: true })
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
        <Skeleton className="h-8 w-48 bg-bg-tertiary" />
        <Skeleton className="h-64 rounded-xl bg-bg-tertiary" />
      </div>
    );
  }

  if (!school) {
    return (
      <div className="text-center py-12">
        <Building2 className="w-16 h-16 mx-auto mb-4 text-muted" />
        <p className="text-muted">School not found</p>
        <Link href="/admin/schools">
          <Button variant="outline" className="mt-4 border-border text-heading">
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
      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
        <div>
          <Link
            href="/admin/schools"
            className="inline-flex items-center gap-1 text-sm text-muted hover:text-heading mb-2 transition-colors"
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
              <div className="w-12 h-12 rounded-lg bg-warning-50 flex items-center justify-center text-secondary font-bold text-lg">
                {school.name?.slice(0, 2).toUpperCase()}
              </div>
            )}
            <div>
              <h1 className="text-2xl font-bold text-heading">{school.name}</h1>
              <p className="text-muted text-sm">
                {school.district || "-"} * {school.school_code}
              </p>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Badge
            variant="outline"
            className={`text-xs border-current ${ school.subscription_plan === "pro" ? "text-brand-700" : school.subscription_plan === "growth" ? "text-info-700" : "text-muted" }`}
          >
            {school.subscription_plan}
          </Badge>
          <span
            className={`text-xs px-2 py-1 rounded ${ school.subscription_status === "active" ? "bg-success-50 text-success-700 dark:bg-success-900/30 dark:text-success-400" : school.subscription_status === "trial" ? "bg-bg-tertiary text-muted" : "bg-danger-50 text-danger-700 dark:bg-danger-900/30 dark:text-danger-400" }`}
          >
            {school.subscription_status}
          </span>
        </div>
      </div>

      <Tabs defaultValue="overview">
        <TabsList className="bg-bg-tertiary border border-border overflow-x-auto flex-nowrap">
          <TabsTrigger value="overview" className="data-[state=active]:bg-bg-tertiary data-[state=active]:text-heading">Overview</TabsTrigger>
          <TabsTrigger value="subscription" className="data-[state=active]:bg-bg-tertiary data-[state=active]:text-heading">Subscription</TabsTrigger>
          <TabsTrigger value="usage" className="data-[state=active]:bg-bg-tertiary data-[state=active]:text-heading">Usage</TabsTrigger>
          <TabsTrigger value="danger" className="data-[state=active]:bg-bg-tertiary data-[state=active]:text-heading">Danger Zone</TabsTrigger>
        </TabsList>

        {/* Overview Tab */}
        <TabsContent value="overview">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-4">
            <Card className="border-border bg-bg-tertiary">
              <CardHeader>
                <CardTitle className="text-heading text-base">School Information</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex items-center gap-2 text-sm">
                  <MapPin className="w-4 h-4 text-muted" />
                  <span className="text-muted">Address:</span>
                  <span className="text-heading">{school.address || "-"}</span>
                </div>
                <div className="flex items-center gap-2 text-sm">
                  <MapPin className="w-4 h-4 text-muted" />
                  <span className="text-muted">District:</span>
                  <span className="text-heading">{school.district || "-"}</span>
                </div>
                <div className="flex items-center gap-2 text-sm">
                  <Phone className="w-4 h-4 text-muted" />
                  <span className="text-muted">Phone:</span>
                  <span className="text-heading">{school.phone || "-"}</span>
                </div>
                <div className="flex items-center gap-2 text-sm">
                  <Mail className="w-4 h-4 text-muted" />
                  <span className="text-muted">Email:</span>
                  <span className="text-heading">{school.email || "-"}</span>
                </div>
                <div className="flex items-center gap-2 text-sm">
                  <Building2 className="w-4 h-4 text-muted" />
                  <span className="text-muted">Type:</span>
                  <span className="text-heading capitalize">{school.school_type}</span>
                </div>
                {school.motto && (
                  <div className="flex items-center gap-2 text-sm">
                    <span className="text-muted">Motto:</span>
                    <span className="text-heading italic">"{school.motto}"</span>
                  </div>
                )}
              </CardContent>
            </Card>

            <Card className="border-border bg-bg-tertiary">
              <CardHeader>
                <CardTitle className="text-heading text-base">Subscription</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex items-center gap-2 text-sm">
                  <CreditCard className="w-4 h-4 text-muted" />
                  <span className="text-muted">Plan:</span>
                  <span className="text-heading capitalize font-medium">{school.subscription_plan}</span>
                  <span className="text-muted">({formatUGX(PLAN_PRICES[school.subscription_plan] || 0)}/mo)</span>
                </div>
                <div className="flex items-center gap-2 text-sm">
                  <span className="text-muted">Status:</span>
                  <span
                    className={`text-xs px-2 py-0.5 rounded ${ school.subscription_status === "active" ? "bg-success-50 text-success-700 dark:bg-success-900/30 dark:text-success-400" : school.subscription_status === "trial" ? "bg-bg-tertiary text-muted" : "bg-danger-50 text-danger-700 dark:bg-danger-900/30 dark:text-danger-400" }`}
                  >
                    {school.subscription_status}
                  </span>
                </div>
                {school.trial_ends_at && (
                  <div className="flex items-center gap-2 text-sm">
                    <Calendar className="w-4 h-4 text-muted" />
                    <span className="text-muted">Trial ends:</span>
                    <span className="text-heading">{formatDate(school.trial_ends_at)}</span>
                  </div>
                )}
                <div className="flex items-center gap-2 text-sm">
                  <Calendar className="w-4 h-4 text-muted" />
                  <span className="text-muted">Created:</span>
                  <span className="text-heading">{formatDate(school.created_at)}</span>
                </div>
              </CardContent>
            </Card>

            <Card className="border-border bg-bg-tertiary md:col-span-2">
              <CardHeader>
                <CardTitle className="text-heading text-base">Student Capacity</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex items-center justify-between text-sm mb-2">
                  <span className="text-muted">{studentCount} / {school.max_students} students</span>
                  <span className="text-heading font-medium">{usagePercent}%</span>
                </div>
                <div className="w-full bg-bg-tertiary rounded-full h-3">
                  <div
                    className={`h-3 rounded-full transition-all ${ usagePercent > 90 ? "bg-bg-tertiary" : usagePercent > 70 ? "bg-bg-tertiary" : "bg-bg-tertiary" }`}
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
            <Card className="border-border bg-bg-tertiary">
              <CardHeader>
                <CardTitle className="text-heading text-base">Current Plan: {school.subscription_plan}</CardTitle>
              </CardHeader>
              <CardContent>
                <ul className="space-y-2 mb-4">
                  {(PLAN_FEATURES[school.subscription_plan] || []).map((f) => (
                    <li key={f} className="flex items-center gap-2 text-sm text-heading">
                      <UserCheck className="w-4 h-4 text-secondary" />
                      {f}
                    </li>
                  ))}
                </ul>
                <div className="flex flex-wrap gap-3">
                  {school.subscription_status === "trial" && (
                    <Button
                      variant="outline"
                      className="border-border text-heading hover:bg-card-hover"
                      onClick={() => setShowExtendTrial(true)}
                    >
                      <Calendar className="w-4 h-4 mr-2" />
                      Extend Trial
                    </Button>
                  )}
                  <Button
                    variant="outline"
                    className="border-border text-heading hover:bg-card-hover"
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
                  <div className="mt-4 p-4 rounded-lg border border-border bg-bg-tertiary space-y-3">
                    <p className="text-sm text-heading">Select new trial end date:</p>
                    <Input
                      type="date"
                      value={trialDate}
                      onChange={(e) => setTrialDate(e.target.value)}
                      className="bg-bg-tertiary border-border text-heading max-w-xs"
                    />
                    <div className="flex flex-wrap gap-2">
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
                        className="text-muted"
                        onClick={() => setShowExtendTrial(false)}
                      >
                        Cancel
                      </Button>
                    </div>
                  </div>
                )}

                {/* Change Plan Modal */}
                {showChangePlan && (
                  <div className="mt-4 p-4 rounded-lg border border-border bg-bg-tertiary space-y-3">
                    <p className="text-sm text-heading">Select new plan:</p>
                    <select
                      value={newPlan}
                      onChange={(e) => setNewPlan(e.target.value)}
                      className="w-full max-w-xs h-10 px-3 rounded-lg bg-bg-tertiary border border-border text-heading text-sm"
                    >
                      <option value="starter">Starter - {formatUGX(50000)}/mo</option>
                      <option value="growth">Growth - {formatUGX(120000)}/mo</option>
                      <option value="pro">Pro - {formatUGX(250000)}/mo</option>
                    </select>
                    <div className="flex flex-wrap gap-2">
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
                        className="text-muted"
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
            <Card className="border-border bg-bg-tertiary">
              <CardHeader>
                <CardTitle className="text-heading text-base">Subscription Invoices</CardTitle>
              </CardHeader>
              <CardContent>
                {invoices.length === 0 ? (
                  <p className="text-muted text-center py-4">No invoices yet</p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-border">
                          <th className="text-left text-muted font-medium py-2">Plan</th>
                          <th className="text-left text-muted font-medium py-2">Amount</th>
                          <th className="text-left text-muted font-medium py-2">Status</th>
                          <th className="text-left text-muted font-medium py-2">Period</th>
                          <th className="text-left text-muted font-medium py-2">Date</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border/50">
                        {invoices.map((inv) => (
                          <tr key={inv.id} className="hover:bg-card-hover">
                            <td className="py-2 text-heading capitalize">{inv.plan}</td>
                            <td className="py-2 text-heading">{formatUGX(inv.amount)}</td>
                            <td className="py-2">
                              <span className={`text-xs px-2 py-0.5 rounded ${ inv.status === "paid" ? "bg-success-50 text-secondary" : inv.status === "pending" ? "bg-warning-50 text-secondary" : "bg-danger-50 text-secondary" }`}>
                                {inv.status}
                              </span>
                            </td>
                            <td className="py-2 text-muted text-xs">
                              {formatDate(inv.period_start)} - {formatDate(inv.period_end)}
                            </td>
                            <td className="py-2 text-muted">{formatDate(inv.created_at)}</td>
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
            <Card className="border-border bg-bg-tertiary">
              <CardContent className="p-6 text-center">
                <Users className="w-8 h-8 text-secondary mx-auto mb-2" />
                <p className="text-2xl font-bold text-heading">{studentCount}</p>
                <p className="text-sm text-muted">Students Enrolled</p>
              </CardContent>
            </Card>
            <Card className="border-border bg-bg-tertiary">
              <CardContent className="p-6 text-center">
                <CreditCard className="w-8 h-8 text-secondary mx-auto mb-2" />
                <p className="text-2xl font-bold text-heading">{paymentStats.count}</p>
                <p className="text-sm text-muted">Fee Payments</p>
                <p className="text-sm text-secondary mt-1">{formatUGX(paymentStats.total)}</p>
              </CardContent>
            </Card>
            <Card className="border-border bg-bg-tertiary">
              <CardContent className="p-6 text-center">
                <Mail className="w-8 h-8 text-secondary mx-auto mb-2" />
                <p className="text-2xl font-bold text-heading">{smsCount}</p>
                <p className="text-sm text-muted">SMS Sent</p>
              </CardContent>
            </Card>
          </div>

          {/* SMS Logs Table */}
          <Card className="border-border bg-bg-tertiary mt-4">
            <CardHeader>
              <CardTitle className="text-heading text-base">Recent SMS Logs (Last 50)</CardTitle>
            </CardHeader>
            <CardContent>
              {smsLogs.length === 0 ? (
                <p className="text-muted text-center py-4">No SMS logs</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-border">
                        <th className="text-left text-muted font-medium py-2">Recipient</th>
                        <th className="text-left text-muted font-medium py-2">Message</th>
                        <th className="text-left text-muted font-medium py-2">Status</th>
                        <th className="text-left text-muted font-medium py-2">Cost</th>
                        <th className="text-left text-muted font-medium py-2">Sent At</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border/50">
                      {smsLogs.map((log) => (
                        <tr key={log.id} className="hover:bg-card-hover">
                          <td className="py-2 text-heading font-mono text-xs">{log.recipient_phone}</td>
                          <td className="py-2 text-muted text-xs max-w-[150px] sm:max-w-[200px] truncate">{log.message_body}</td>
                          <td className="py-2">
                            <span className={`text-xs px-2 py-0.5 rounded ${ log.status === "delivered" ? "bg-success-50 text-success-700 dark:bg-success-900/30 dark:text-success-400" : log.status === "sent" ? "bg-bg-tertiary text-muted" : log.status === "failed" ? "bg-danger-50 text-danger-700 dark:bg-danger-900/30 dark:text-danger-400" : "bg-warning-50 text-warning-700 dark:bg-warning-900/30 dark:text-warning-400" }`}>
                              {log.status}
                            </span>
                          </td>
                          <td className="py-2 text-muted">{log.cost ? formatUGX(log.cost) : "-"}</td>
                          <td className="py-2 text-muted text-xs">{formatDate(log.sent_at)}</td>
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
            <Card className="border-danger-50 bg-danger-50">
              <CardHeader>
                <CardTitle className="text-secondary text-base flex items-center gap-2">
                  <AlertTriangle className="w-5 h-5" />
                  Danger Zone
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {/* Impersonate */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 rounded-lg border border-border bg-bg-tertiary">
                  <div>
                    <p className="text-sm font-medium text-heading">Impersonate School Admin</p>
                    <p className="text-xs text-muted">Open a new session logged in as this school's admin</p>
                  </div>
                  <Button
                    variant="outline"
                    className="border-warning-100 text-secondary hover:bg-card-hover w-full sm:w-auto"
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
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 rounded-lg border border-border bg-bg-tertiary">
                  <div>
                    <p className="text-sm font-medium text-heading">
                      {school.subscription_status === "cancelled"
                        ? "Reactivate Account"
                        : "Suspend Account"}
                    </p>
                    <p className="text-xs text-muted">
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
                  <div className="p-4 rounded-lg border border-danger-100 bg-danger-50 space-y-3">
                    <p className="text-sm text-heading">
                      Type <strong className="text-secondary">{school.name}</strong> to confirm suspension:
                    </p>
                    <Input
                      value={suspendConfirm}
                      onChange={(e) => setSuspendConfirm(e.target.value)}
                      placeholder="Type school name..."
                      className="bg-bg-tertiary border-danger-100 text-heading max-w-md"
                    />
                    <div className="flex flex-wrap gap-2">
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
                        className="text-muted"
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

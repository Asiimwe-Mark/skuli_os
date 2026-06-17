"use client";

import { useEffect} from "react";
import { useDocumentTitle } from "@/lib/hooks/useDocumentTitle";
import { useQuery } from "@tanstack/react-query";
import { motion } from "framer-motion";
import type { Variants } from "framer-motion";
import Link from "next/link";
import { useSchoolStore } from "@/store/school";
import { useSupabaseBrowser } from "@/lib/supabase/client";
import { formatUGX } from "@/lib/utils/currency";
import { formatDate, formatRelativeTime, todayLocalISODate } from "@/lib/utils/dates";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { StatCard } from "@/components/shared/stat-card";
import { EmptyState } from "@/components/shared/empty-state";
import {
  Wallet,
  TrendingUp,
  AlertTriangle,
  CheckCircle2,
  UserPlus,
  ClipboardList,
  Send,
  BookOpen,
  CreditCard,
  FileText,
  BarChart3,
  ArrowUpRight,
  Users,
  Sparkles,
  GraduationCap,
  CalendarCheck,
  Smartphone,
} from "lucide-react";
import type { DashboardKPIs, FeePayment, FeeAccount, Student } from "@/types";
import type { Database } from "@/types/database";
import { cn } from "@/lib/utils/cn";
import dynamic from "next/dynamic";

const DashboardCharts = dynamic(() => import("@/components/dashboard/DashboardCharts"), {
  ssr: false,
  loading: () => <Skeleton className="h-72 rounded-2xl" />,
});

type FeeAccountRow = Database['public']['Tables']['fee_accounts']['Row'];
type FeePaymentRow = Database['public']['Tables']['fee_payments']['Row'];

const fadeInUp: Variants = {
  initial: { opacity: 0, y: 20 },
  animate: { opacity: 1, y: 0 },
};

function PageHeader() {
  // QW-1: selector-based store reads.
  const school = useSchoolStore((s) => s.school);
  const currentTerm = useSchoolStore((s) => s.currentTerm);
  return (
    <div className="relative overflow-hidden rounded-2xl border border-border bg-card p-6 sm:p-8 shadow-card">
      <div className="relative flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
        <div className="min-w-0">
          <div className="flex items-center gap-2 mb-2.5 flex-wrap">
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-brand-50 text-brand-700 border border-brand-100 dark:bg-brand-900/30 dark:text-brand-400 dark:border-brand-800 text-[11px] font-semibold">
              <Sparkles className="h-3 w-3" />
              Live overview
            </span>
            {currentTerm && (
              <Badge variant="brand" className="text-[10px]">
                {currentTerm.name.replace("Term", "Term ")}
              </Badge>
            )}
          </div>
          <h1 className="font-display text-2xl sm:text-3xl font-bold tracking-tight text-heading">
            Welcome back to <span className="text-brand-600 dark:text-brand-400">{school?.name || "SKULI"}</span>
          </h1>
          <p className="text-secondary mt-1.5 text-sm">
            Here's what's happening across your school today.
          </p>
        </div>
        <Link href="/dashboard/fees/payments/new">
          <Button size="lg" variant="default" className="w-full sm:w-auto">
            <CreditCard className="h-4 w-4" />
            Record Payment
          </Button>
        </Link>
      </div>
    </div>
  );
}

function RecentPaymentsTable({ payments }: { payments: FeePayment[] }) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <div>
          <CardTitle>Recent Payments</CardTitle>
          <p className="text-xs text-muted mt-1">Last 5 transactions</p>
        </div>
        <Link href="/dashboard/fees/payments">
          <Button variant="ghost" size="sm">
            View All
            <ArrowUpRight className="w-4 h-4 ml-1" />
          </Button>
        </Link>
      </CardHeader>
      <CardContent>
        {payments.length === 0 ? (
          <EmptyState
            icon={Wallet}
            title="No payments recorded yet"
            description="Record your first fee payment to see it here."
            action={
              <Link href="/dashboard/fees/payments/new">
                <Button>Record First Payment</Button>
              </Link>
            }
          />
        ) : (
          <div className="space-y-2.5">
            {payments.slice(0, 5).map((payment, i) => {
              const methodColors: Record<string, string> = {
                mobile_money: "bg-success-50 text-success-700 dark:bg-success-900/30 dark:text-success-400 ring-success-100 dark:ring-success-800",
                cash:         "bg-warning-50 text-warning-700 dark:bg-warning-900/30 dark:text-warning-400 ring-warning-100 dark:ring-warning-800",
                bank:         "bg-info-50 text-info-700 dark:bg-info-900/30 dark:text-info-400 ring-info-100 dark:ring-info-800",
                waiver:       "bg-brand-50 text-brand-700 dark:bg-brand-900/30 dark:text-brand-400 ring-brand-100 dark:ring-brand-800",
              };
              const methodClass = methodColors[payment.payment_method || ""] || methodColors.cash;
              return (
                <motion.div
                  key={payment.id}
                  initial={{ opacity: 0, x: -8 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: i * 0.05 }}
                  className="flex items-center justify-between p-3 rounded-xl bg-bg-tertiary hover:bg-card-hover border border-border transition-all"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-10 h-10 rounded-xl bg-success-50 text-success-700 dark:bg-success-900/30 dark:text-success-400 flex items-center justify-center shadow-soft shrink-0">
                      <CheckCircle2 className="w-4.5 h-4.5" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-semibold truncate text-heading">
                        {payment.student?.full_name || "Student"}
                      </p>
                      <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                        <span
                          className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-md ring-1 ${methodClass}`}
                        >
                          {payment.payment_method === "mobile_money" ? "Mobile Money"
                            : payment.payment_method === "cash" ? "Cash"
                            : payment.payment_method === "bank" ? "Bank"
                            : "Waiver"}
                        </span>
                        <span className="text-xs text-muted">
                          - {formatRelativeTime(payment.created_at)}
                        </span>
                      </div>
                    </div>
                  </div>
                  <p className="text-numeric text-sm font-semibold text-success-700 shrink-0">
                    {formatUGX(payment.amount)}
                  </p>
                </motion.div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function DefaultersList({ accounts }: { accounts: (FeeAccount & { student?: Student })[] }) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <div>
          <CardTitle>Top Defaulters</CardTitle>
          <p className="text-xs text-muted mt-1">Highest outstanding balances</p>
        </div>
        <Link href="/dashboard/fees/defaulters">
          <Button variant="ghost" size="sm">
            View All
            <ArrowUpRight className="w-4 h-4 ml-1" />
          </Button>
        </Link>
      </CardHeader>
      <CardContent>
        {accounts.length === 0 ? (
          <EmptyState
            icon={CheckCircle2}
            title="All fees collected!"
            description="No defaulters for the current term. Great work."
            variant="minimal"
          />
        ) : (
          <div className="space-y-2.5">
            {accounts.slice(0, 5).map((account, i) => (
              <motion.div
                key={account.id}
                initial={{ opacity: 0, x: -8 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: i * 0.05 }}
                className="flex items-center justify-between p-3 rounded-xl bg-bg-tertiary hover:bg-card-hover border border-border transition-all"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-10 h-10 rounded-xl bg-danger-50 text-danger-700 dark:bg-danger-900/30 dark:text-danger-400 flex items-center justify-center shadow-soft shrink-0">
                    <AlertTriangle className="w-4.5 h-4.5" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-semibold truncate text-heading">
                      {account.student?.full_name || "Student"}
                    </p>
                    <p className="text-xs text-muted mt-0.5">
                      {account.student?.current_class?.name || ""}
                    </p>
                  </div>
                </div>
                <div className="text-right shrink-0">
                  <p className="text-numeric text-sm text-danger-600 dark:text-danger-400">
                    {formatUGX(account.balance)}
                  </p>
                  <Badge variant="destructive" className="text-[10px] mt-0.5">Unpaid</Badge>
                </div>
              </motion.div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function QuickActions() {
  const actions = [
    { label: "Record Payment",  href: "/dashboard/fees/payments/new",        icon: CreditCard,   color: "brand"  },
    { label: "Add Student",     href: "/dashboard/students/enroll",          icon: UserPlus,     iconColor: "text-info-600 dark:text-info-400",    bg: "bg-info-50 dark:bg-info-900/30",     ring: "ring-info-100 dark:ring-info-800" },
    { label: "Take Attendance", href: "/dashboard/attendance/take",          icon: ClipboardList,iconColor: "text-warning-600 dark:text-warning-400", bg: "bg-warning-50 dark:bg-warning-900/30", ring: "ring-warning-100 dark:ring-warning-800" },
    { label: "Send SMS",        href: "/dashboard/communication/compose",    icon: Send,         iconColor: "text-brand-600 dark:text-brand-400", bg: "bg-brand-50 dark:bg-brand-900/30",   ring: "ring-brand-100 dark:ring-brand-800" },
    { label: "Enter Marks",     href: "/dashboard/academics/marks",          icon: BookOpen,     iconColor: "text-danger-600 dark:text-danger-400", bg: "bg-danger-50 dark:bg-danger-900/30",   ring: "ring-danger-100 dark:ring-danger-800" },
    { label: "Report Cards",    href: "/dashboard/academics/report-cards",   icon: FileText,     iconColor: "text-warning-600 dark:text-warning-400", bg: "bg-warning-50 dark:bg-warning-900/30", ring: "ring-warning-100 dark:ring-warning-800" },
  ];

  return (
    <Card>
      <CardHeader>
        <CardTitle>Quick Actions</CardTitle>
        <p className="text-xs text-muted mt-1">Jump right to common tasks</p>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 gap-2.5">
          {actions.map((action) => (
            <Link key={action.href} href={action.href}>
              <div className="group flex items-center gap-3 p-3 rounded-xl bg-bg-tertiary hover:bg-card-hover border border-border transition-all hover:shadow-soft">
                <div
                  className={cn(
                    "flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ring-1 transition-transform group-hover:scale-110",
                    action.bg,
                    action.ring
                  )}
                >
                  <action.icon className={cn("h-5 w-5", action.iconColor)} />
                </div>
                <span className="text-sm font-semibold text-heading group-hover:text-brand-600 transition-colors">
                  {action.label}
                </span>
              </div>
            </Link>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

interface OnboardingState {
  hasClass: boolean;
  hasStudents: boolean;
  hasFeeStructure: boolean;
  hasStaff: boolean;
  hasSentSms: boolean;
  hasMobileMoney: boolean;
}

function OnboardingChecklist({ state }: { state: OnboardingState }) {
  const steps = [
    { label: "Add your first class",           done: state.hasClass,         href: "/dashboard/students/classes",         icon: SchoolIcon },
    { label: "Enroll students",                done: state.hasStudents,      href: "/dashboard/students/enroll",          icon: UserPlus },
    { label: "Set up fee structure",           done: state.hasFeeStructure,  href: "/dashboard/fees/structure",           icon: CreditCard },
    { label: "Add a teacher",                  done: state.hasStaff,         href: "/dashboard/staff",                    icon: Users },
    { label: "Send your first SMS",            done: state.hasSentSms,       href: "/dashboard/communication/compose",    icon: Send },
    { label: "Set up Mobile Money collection", done: state.hasMobileMoney,   href: "/dashboard/settings/api",             icon: Smartphone },
  ];

  const completedCount = steps.filter((s) => s.done).length;
  const allDone = completedCount === steps.length;

  if (allDone) return null;

  return (
    <motion.div {...fadeInUp} transition={{ delay: 0.1 }}>
      <Card className="relative overflow-hidden">
        <div className="pointer-events-none absolute -top-20 -right-20 h-48 w-48 rounded-full bg-bg-tertiary/30 dark:bg-brand-800/20 blur-3xl" />
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-xl bg-brand-600 text-white flex items-center justify-center shadow-soft">
                <Sparkles className="h-5 w-5" />
              </div>
              <div>
                <CardTitle>Get Started with SKULI</CardTitle>
                <p className="text-xs text-muted mt-0.5">Complete these to unlock the full platform</p>
              </div>
            </div>
            <Badge variant="brand" className="text-[11px]">
              {completedCount} / {steps.length}
            </Badge>
          </div>
          <div className="relative w-full bg-bg-tertiary rounded-full h-2 mt-4 overflow-hidden">
            <motion.div
              initial={{ width: 0 }}
              animate={{ width: `${(completedCount / steps.length) * 100}%` }}
              transition={{ duration: 1, ease: [0.22, 1, 0.36, 1] }}
              className="absolute inset-y-0 left-0 rounded-full bg-bg-tertiary"
            />
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid sm:grid-cols-2 gap-2">
            {steps.map((step) => (
              <Link key={step.label} href={step.href}>
                <div className="group flex items-center gap-3 p-3 rounded-xl border border-border bg-bg-tertiary hover:bg-card-hover hover:shadow-soft transition-all">
                  <div
                    className={cn(
                      "flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ring-1 transition-all",
                      step.done
                        ? "bg-success-600 text-white ring-success-100"
                        : "bg-bg-tertiary text-muted ring-border"
                    )}
                  >
                    {step.done ? <CheckCircle2 className="h-4 w-4" /> : <step.icon className="h-4 w-4" />}
                  </div>
                  <span
                    className={cn(
                      "text-sm font-medium",
                      step.done ? "line-through text-muted" : "text-heading"
                    )}
                  >
                    {step.label}
                  </span>
                  {!step.done && (
                    <ArrowUpRight className="ml-auto h-4 w-4 text-muted opacity-0 group-hover:opacity-100 transition-opacity" />
                  )}
                </div>
              </Link>
            ))}
          </div>
        </CardContent>
      </Card>
    </motion.div>
  );
}

function SchoolOverview({ stats }: { stats: { students: number; classes: number; presentToday: number; totalStudentsToday: number; smsSent: number } }) {
  const safe = {
    students: stats?.students ?? 0,
    classes: stats?.classes ?? 0,
    presentToday: stats?.presentToday ?? 0,
    totalStudentsToday: stats?.totalStudentsToday ?? 0,
    smsSent: stats?.smsSent ?? 0,
  };
  const items = [
    { label: "Students",       value: safe.students.toLocaleString(),                  icon: GraduationCap, tint: "bg-brand-50 text-brand-700 dark:bg-brand-900/30 dark:text-brand-400",     ring: "ring-brand-100 dark:ring-brand-800" },
    { label: "Classes",        value: safe.classes.toLocaleString(),                   icon: BookOpen,      tint: "bg-info-50 text-info-700 dark:bg-info-900/30 dark:text-info-400",         ring: "ring-info-100 dark:ring-info-800" },
    { label: "Present Today",  value: safe.totalStudentsToday > 0 ? `${safe.presentToday}/${safe.totalStudentsToday}` : "—", icon: CalendarCheck, tint: "bg-success-50 text-success-700 dark:bg-success-900/30 dark:text-success-400", ring: "ring-success-100 dark:ring-success-800" },
    { label: "SMS Sent",       value: safe.smsSent.toLocaleString(),                   icon: Send,          tint: "bg-warning-50 text-warning-700 dark:bg-warning-900/30 dark:text-warning-400", ring: "ring-warning-100 dark:ring-warning-800" },
  ];

  return (
    <Card>
      <CardHeader>
        <CardTitle>School Overview</CardTitle>
        <p className="text-xs text-muted mt-1">Key metrics at a glance</p>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 gap-3">
          {items.map((item) => (
            // Audit 10.5: the School Overview stat tiles were
            // decorative <div>s with no ARIA. Screen readers saw
            // a "graphic" and skipped the value entirely. The
            // <p> value is a presentational child; the role +
            // aria-label makes the whole tile announce as a
            // single number ("32 students"). aria-live=polite
            // surfaces changes when the dashboard auto-refreshes.
            <div
              key={item.label}
              role="group"
              aria-label={`${item.value} ${item.label}`}
              className="group relative overflow-hidden p-4 rounded-xl border border-border bg-card hover:border-border-strong hover:shadow-soft transition-all"
            >
              <div className={cn("flex h-9 w-9 items-center justify-center rounded-lg ring-1 mb-3", item.tint, item.ring)} aria-hidden="true">
                <item.icon className="h-4 w-4" />
              </div>
              <p className="text-numeric text-2xl" aria-hidden="true">{item.value}</p>
              <p className="text-xs text-muted mt-0.5" aria-hidden="true">{item.label}</p>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

function SchoolIcon(props: React.SVGProps<SVGSVGElement>) { return <GraduationCap {...props} />; }

interface DashboardData {
  kpIs: DashboardKPIs;
  recentPayments: FeePayment[];
  defaulterAccounts: (FeeAccount & { student?: Student })[];
  studentCount: number;
  classCount: number;
  presentToday: number;
  totalStudentsToday: number;
  smsSent: number;
  onboarding: OnboardingState;
  feeTrendData: { week: string; amount: number }[];
  paymentMethodData: { name: string; value: number }[];
  attendanceByClass: { className: string; teacher: string; present: number; total: number; pct: number }[];
  /** Names of queries that failed in the last cycle. Audit 3.97. */
  queryErrors: string[];
}

const EMPTY_DASHBOARD: DashboardData = {
  kpIs: { totalExpected: 0, totalCollected: 0, totalOutstanding: 0, collectionRate: 0 },
  recentPayments: [],
  defaulterAccounts: [],
  studentCount: 0,
  classCount: 0,
  presentToday: 0,
  totalStudentsToday: 0,
  smsSent: 0,
  onboarding: { hasClass: false, hasStudents: false, hasFeeStructure: false, hasStaff: false, hasSentSms: false, hasMobileMoney: false },
  feeTrendData: [],
  paymentMethodData: [],
  attendanceByClass: [],
  queryErrors: [],
};

export default function DashboardPage() {
  useDocumentTitle("Overview");
  const supabase = useSupabaseBrowser();
  const school = useSchoolStore((s) => s.school);
  const currentTerm = useSchoolStore((s) => s.currentTerm);

  const { data, isLoading } = useQuery<DashboardData>({
    queryKey: ["dashboard", school?.id, currentTerm?.id],
    enabled: !!school,
    queryFn: async () => {
      const schoolId = school!.id;
      const termId = currentTerm?.id;
      // Audit 10.14: use the local YYYY-MM-DD, not UTC.
      // The "today" filter on attendance_records was previously
      // UTC, so a school in UTC+3 querying at 02:00 local saw
      // yesterday's attendance. Same fix as the date input on
      // the attendance pages.
      const today = todayLocalISODate();

      const result: DashboardData = {
        ...EMPTY_DASHBOARD,
        onboarding: { ...EMPTY_DASHBOARD.onboarding },
        kpIs: { ...EMPTY_DASHBOARD.kpIs },
      };

      const [
        accountsRes, defaultersRes, paymentsRes, studentCountRes, classCountRes,
        smsCountRes, feeStructRes, staffRes, schoolCredsRes,
        trendRes, methodRes, classDataRes, classAttendanceAggRes, todayAttendanceAggRes,
      ] = await Promise.allSettled([
        termId ? supabase.from("fee_accounts").select("total_expected, total_paid, balance, status").eq("school_id", schoolId).eq("term_id", termId).eq("is_deleted", false) : Promise.resolve({ data: null, error: null }),
        termId ? supabase.from("fee_accounts").select("id, balance, student:students(full_name, current_class_id, current_class:classes(name))").eq("school_id", schoolId).eq("term_id", termId).eq("is_deleted", false).gt("balance", 0).order("balance", { ascending: false }).limit(5) : Promise.resolve({ data: null, error: null }),
        supabase.from("fee_payments").select("*, student:students(full_name, admission_number)").eq("school_id", schoolId).eq("is_deleted", false).order("created_at", { ascending: false }).limit(5),
        supabase.from("students").select("id", { count: "exact", head: true }).eq("school_id", schoolId).eq("is_deleted", false).eq("status", "active"),
        supabase.from("classes").select("id", { count: "exact", head: true }).eq("school_id", schoolId).eq("is_deleted", false),
        supabase.from("sms_logs").select("id", { count: "exact", head: true }).eq("school_id", schoolId).eq("status", "sent"),
        supabase.from("fee_structures").select("id", { count: "exact", head: true }).eq("school_id", schoolId).eq("is_deleted", false),
        supabase.from("staff").select("id", { count: "exact", head: true }).eq("school_id", schoolId).eq("is_deleted", false),
        supabase.from("schools").select("africas_talking_api_key_enc").eq("id", schoolId).maybeSingle(),
        // Audit 9.13: trend/method aggregations now happen in SQL
        // (migrations 00064). The RPCs return ≤ 8-12 rows instead of
        // every term payment.
        termId ? supabase.rpc("dashboard_payment_trend", { p_school_id: schoolId, p_term_id: termId }) : Promise.resolve({ data: null, error: null }),
        termId ? supabase.rpc("dashboard_payment_methods", { p_school_id: schoolId, p_term_id: termId }) : Promise.resolve({ data: null, error: null }),
        supabase.from("classes").select("id, name, class_teacher_id, class_teacher:users!class_teacher_id(full_name)").eq("school_id", schoolId).eq("is_deleted", false),
        // Audit 9.12: per-class attendance aggregate replaces the
        // JS iteration over all attendance_records rows.
        supabase.rpc("dashboard_attendance_by_class", { p_school_id: schoolId, p_date: today }),
        supabase.rpc("dashboard_attendance_today", { p_school_id: schoolId, p_date: today }),
      ]);

      // Audit 3.97: with Promise.all, one RLS-blocked query would reject
      // and discard the other 13. Promise.allSettled returns a result for
      // each so we render whatever is available and surface the rest as
      // a soft warning.
      const queryErrorKeys: string[] = [];
      const okOrNull = <T,>(r: PromiseSettledResult<T>, label: string): T | null => {
        if (r.status === "fulfilled") return r.value;
        queryErrorKeys.push(label);
        console.error(`[dashboard] ${label} query failed`, r.reason);
        return null;
      };
      const accountsResp = okOrNull(accountsRes, "fee_accounts");
      const defaultersResp = okOrNull(defaultersRes, "defaulters");
      const paymentsResp = okOrNull(paymentsRes, "recent_payments");
      const studentCountResp = okOrNull(studentCountRes, "student_count");
      const classCountResp = okOrNull(classCountRes, "class_count");
      const smsCountResp = okOrNull(smsCountRes, "sms_count");
      const feeStructResp = okOrNull(feeStructRes, "fee_structure_count");
      const staffResp = okOrNull(staffRes, "staff_count");
      const schoolCredsResp = okOrNull(schoolCredsRes, "school_credentials");
      const trendResp = okOrNull(trendRes, "payment_trend");
      const methodRespAgg = okOrNull(methodRes, "payment_methods");
      const classDataResp = okOrNull(classDataRes, "classes");
      const classAttendanceAggResp = okOrNull(classAttendanceAggRes, "attendance_by_class");
      const todayAttendanceAggResp = okOrNull(todayAttendanceAggRes, "attendance_today");

      const accounts = accountsResp ? (accountsResp as { data: unknown }).data : null;
      if (accounts) {
        // Audit 2.11 (3.1, 5.1): the previous version used `as any[]`
        // and `as any` on every field. We now have a typed shape for
        // the row. The cast lives in one place (the reduce callbacks)
        // and any field-name typo becomes a TypeScript error, not a
        // silent 0 in the KPI.
        interface KpiAccount {
          total_expected?: number | null;
          total_paid?: number | null;
          balance?: number | null;
        }
        const accts = accounts as KpiAccount[];
        const totalExpected = accts.reduce(
          (sum, a) => sum + (a.total_expected ?? 0),
          0,
        );
        const totalCollected = accts.reduce(
          (sum, a) => sum + (a.total_paid ?? 0),
          0,
        );
        const totalOutstanding = accts.reduce(
          (sum, a) => sum + (a.balance ?? 0),
          0,
        );
        result.kpIs = {
          totalExpected,
          totalCollected,
          totalOutstanding,
          collectionRate: totalExpected > 0 ? Math.round((totalCollected / totalExpected) * 100) : 0,
        };
      }

      if (defaultersResp && (defaultersResp as { data: unknown }).data) {
        // Normalize nested joins (PostgREST returns objects OR arrays) so the
        // dashboard's DefaultersList can read student.current_class.name.
        result.defaulterAccounts = ((defaultersResp as { data: unknown }).data as any[]).map((a) => {
          const s = Array.isArray(a.student) ? a.student[0] : a.student;
          const cls = Array.isArray(s?.current_class)
            ? s.current_class[0]
            : s?.current_class;
          return { ...a, student: s ? { ...s, current_class: cls } : s };
        });
      }
      if (paymentsResp && (paymentsResp as { data: unknown }).data) {
        result.recentPayments = (paymentsResp as { data: unknown }).data as any;
      }

      const sCount = studentCountResp ? (studentCountResp as { count: number | null }).count : null;
      const cCount = classCountResp ? (classCountResp as { count: number | null }).count : null;
      result.studentCount = sCount ?? 0;
      result.classCount = cCount ?? 0;

      // Audit 9.12: the today-wide present/total counts come from a
      // single grouped aggregate (migration 00063). No more
      // fetching every attendance row just to count it.
      const todayAgg = todayAttendanceAggResp ? (todayAttendanceAggResp as { data: unknown }).data : null;
      if (Array.isArray(todayAgg) && todayAgg.length > 0) {
        const row = (todayAgg as { present: number; total: number }[])[0];
        result.presentToday = Number(row.present ?? 0);
        result.totalStudentsToday = Number(row.total ?? 0);
      }

      const smsCount = smsCountResp ? (smsCountResp as { count: number | null }).count : null;
      result.smsSent = smsCount ?? 0;

      const feeStructCount = feeStructResp ? (feeStructResp as { count: number | null }).count : null;
      const staffCount = staffResp ? (staffResp as { count: number | null }).count : null;
      const schoolCreds = schoolCredsResp ? (schoolCredsResp as { data: unknown }).data : null;
      result.onboarding = {
        hasClass: (cCount ?? 0) > 0,
        hasStudents: (sCount ?? 0) > 0,
        hasFeeStructure: (feeStructCount ?? 0) > 0,
        hasStaff: (staffCount ?? 0) > 0,
        hasSentSms: (smsCount ?? 0) > 0,
        hasMobileMoney: !!(schoolCreds as { africas_talking_api_key_enc?: string | null } | null)?.africas_talking_api_key_enc,
      };

      if (termId) {
        // Audit 9.13: weekly trend comes from a SQL GROUP BY (migration
        // 00064). The RPC already returns rows ordered by week_start,
        // so we just slice the last 8 and label them W1..W8.
        const trendRows = trendResp ? (trendResp as { data: unknown }).data : null;
        if (Array.isArray(trendRows) && trendRows.length > 0) {
          const lastEight = (trendRows as { week_start: string; amount: number }[]).slice(-8);
          result.feeTrendData = lastEight.map((r, i) => ({
            week: `W${i + 1}`,
            amount: Number(r.amount),
          }));
        }

        // Per-method totals: SQL groups by COALESCE(payment_method, 'other')
        // so the mapping is the same as before, just with no JS iteration.
        const methodRows = methodRespAgg ? (methodRespAgg as { data: unknown }).data : null;
        if (Array.isArray(methodRows) && methodRows.length > 0) {
          const methodLabels: Record<string, string> = {
            cash: "Cash", mobile_money: "Mobile Money", bank: "Bank Transfer", waiver: "Waiver", other: "Other",
          };
          result.paymentMethodData = (methodRows as { payment_method: string; amount: number }[]).map((r) => ({
            name: methodLabels[r.payment_method] ?? r.payment_method,
            value: Number(r.amount),
          }));
        }
      }

      const classData = classDataResp ? (classDataResp as { data: unknown }).data : null;
      if (classData) {
        // Audit 9.12: per-class present/total comes pre-aggregated from
        // the SQL RPC. The previous version fetched every
        // attendance_records row and counted in JS — for a 3000-student
        // school that's 3000 rows per dashboard load.
        const classAgg = (classAttendanceAggResp ? (classAttendanceAggResp as { data: unknown }).data : null) as { class_id: string; present: number; total: number }[] | null;
        const classMap = new Map<string, { present: number; total: number }>();
        (classAgg || []).forEach((r) => {
          classMap.set(r.class_id, {
            present: Number(r.present),
            total: Number(r.total),
          });
        });

        type ClassWithTeacher = {
          id: string;
          name: string;
          class_teacher?: { full_name?: string } | null;
        };

        result.attendanceByClass = (classData as unknown as ClassWithTeacher[])
          .map((c) => {
            const e = classMap.get(c.id);
            const teacherName = c.class_teacher?.full_name || "";
            return {
              className: c.name,
              teacher: teacherName,
              present: e?.present ?? 0,
              total: e?.total ?? 0,
              pct: e && e.total > 0 ? Math.round((e.present / e.total) * 100) : -1,
            };
          })
          .sort((a, b) => {
            if (a.pct === -1 && b.pct !== -1) return -1;
            if (a.pct !== -1 && b.pct === -1) return 1;
            return a.pct - b.pct;
          });
      }

      result.queryErrors = queryErrorKeys;
      return result;
    },
  });

  const dash = data ?? EMPTY_DASHBOARD;
  const loading = isLoading;

  if (loading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-32 rounded-2xl" />
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-28 rounded-xl" />)}
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <Skeleton className="h-80 rounded-xl lg:col-span-2" />
          <Skeleton className="h-80 rounded-xl" />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader />

      {/* Partial-failure banner: audit 3.97. Some queries failed but the
          rest of the dashboard still rendered. Show a soft warning. */}
      {dash.queryErrors.length > 0 && (
        <div
          role="alert"
          aria-live="polite"
          className="rounded-xl border border-warning-100 bg-warning-50 px-4 py-3 text-sm text-warning-700 dark:border-warning-800 dark:bg-warning-900/20 dark:text-warning-300"
        >
          <p className="font-medium">Some dashboard data could not be loaded.</p>
          <p className="mt-0.5 text-xs opacity-80">
            Affected sections: {dash.queryErrors.join(", ")}. The rest of the
            dashboard is up to date.
          </p>
        </div>
      )}

      <OnboardingChecklist state={dash.onboarding} />

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          label="Total Expected"
          value={dash.kpIs.totalExpected}
          format="currency"
          icon={Wallet}
          color="warning"
          delay={0}
        />
        <StatCard
          label="Total Collected"
          value={dash.kpIs.totalCollected}
          format="currency"
          icon={TrendingUp}
          color="success"
          delay={0.08}
        />
        <StatCard
          label="Outstanding Balance"
          value={dash.kpIs.totalOutstanding}
          format="currency"
          icon={AlertTriangle}
          color="danger"
          delay={0.16}
        />
        <StatCard
          label="Collection Rate"
          value={dash.kpIs.collectionRate}
          format="percent"
          icon={BarChart3}
          color="info"
          delay={0.24}
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2">
          <RecentPaymentsTable payments={dash.recentPayments} />
        </div>
        <QuickActions />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <DefaultersList accounts={dash.defaulterAccounts} />
        <SchoolOverview
          stats={{
            students: dash.studentCount,
            classes: dash.classCount,
            presentToday: dash.presentToday,
            totalStudentsToday: dash.totalStudentsToday,
            smsSent: dash.smsSent,
          }}
        />
      </div>

      <DashboardCharts
        feeTrendData={dash.feeTrendData}
        paymentMethodData={dash.paymentMethodData}
        attendanceByClass={dash.attendanceByClass}
      />
    </div>
  );
}

"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import type { Variants } from "framer-motion";
import Link from "next/link";
import { useSchoolStore } from "@/store/school";
import { createBrowserClient } from "@/lib/supabase/client";
import { formatUGX } from "@/lib/utils/currency";
import { formatDate, formatRelativeTime } from "@/lib/utils/dates";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
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
} from "lucide-react";
import type { DashboardKPIs, FeePayment, FeeAccount, Student } from "@/types";
import type { Database } from "@/types/database";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Legend,
} from "recharts";

type FeeAccountRow = Database['public']['Tables']['fee_accounts']['Row'];
type FeePaymentRow = Database['public']['Tables']['fee_payments']['Row'];

const CHART_COLORS = ["#f59e0b", "#10b981", "#3b82f6", "#8b5cf6", "#ef4444", "#06b6d4"];

const fadeInUp: Variants = {
  initial: { opacity: 0, y: 20 },
  animate: { opacity: 1, y: 0 },
};

function StatCard({
  label,
  value,
  icon: Icon,
  color,
  delay = 0,
}: {
  label: string;
  value: string;
  icon: React.ComponentType<{ className?: string }>;
  color: string;
  delay?: number;
}) {
  return (
    <motion.div {...fadeInUp} transition={{ delay }}>
      <Card className="border-border-subtle bg-surface hover:border-border-glow transition-all duration-300">
        <CardContent className="p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-foreground/60">{label}</p>
              <p className="text-2xl font-bold mt-1" aria-label={`${label}: ${value}`}>{value}</p>
            </div>
            <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${color}`}>
              <Icon className="w-6 h-6" />
            </div>
          </div>
        </CardContent>
      </Card>
    </motion.div>
  );
}

function RecentPaymentsTable({ payments }: { payments: FeePayment[] }) {
  return (
    <Card className="border-border-subtle bg-surface">
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="text-lg">Recent Payments</CardTitle>
        <Link href="/dashboard/fees/payments">
          <Button variant="ghost" size="sm">
            View All <ArrowUpRight className="w-4 h-4 ml-1" />
          </Button>
        </Link>
      </CardHeader>
      <CardContent>
        {payments.length === 0 ? (
          <div className="text-center py-8 text-foreground/40">
            <Wallet className="w-12 h-12 mx-auto mb-3 opacity-50" />
            <p>No payments recorded yet</p>
            <Link href="/dashboard/fees/payments/new">
              <Button size="sm" className="mt-3">Record First Payment</Button>
            </Link>
          </div>
        ) : (
          <div className="space-y-3">
            {payments.slice(0, 5).map((payment) => (
              <div
                key={payment.id}
                className="flex items-center justify-between p-3 rounded-lg bg-navy-900/50 hover:bg-navy-900 transition-colors"
              >
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-full bg-emerald-500/10 flex items-center justify-center">
                    <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                  </div>
                  <div>
                    <p className="text-sm font-medium">
                      {payment.student?.full_name || "Student"}
                    </p>
                    <p className="text-xs text-foreground/40">
                      {payment.payment_method === "mobile_money"
                        ? "Mobile Money"
                        : payment.payment_method === "cash"
                        ? "Cash"
                        : payment.payment_method === "bank"
                        ? "Bank Transfer"
                        : "Waiver"}{" "}
                      · {formatRelativeTime(payment.created_at)}
                    </p>
                  </div>
                </div>
                <p className="text-sm font-semibold text-emerald-400">
                  {formatUGX(payment.amount)}
                </p>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function DefaultersList({ accounts }: { accounts: (FeeAccount & { student?: Student })[] }) {
  return (
    <Card className="border-border-subtle bg-surface">
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="text-lg">Top Defaulters</CardTitle>
        <Link href="/dashboard/fees/defaulters">
          <Button variant="ghost" size="sm">
            View All <ArrowUpRight className="w-4 h-4 ml-1" />
          </Button>
        </Link>
      </CardHeader>
      <CardContent>
        {accounts.length === 0 ? (
          <div className="text-center py-8 text-foreground/40">
            <CheckCircle2 className="w-12 h-12 mx-auto mb-3 opacity-50 text-emerald-400" />
            <p>All fees collected!</p>
          </div>
        ) : (
          <div className="space-y-3">
            {accounts.slice(0, 5).map((account) => (
              <div
                key={account.id}
                className="flex items-center justify-between p-3 rounded-lg bg-navy-900/50"
              >
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-full bg-rose-500/10 flex items-center justify-center">
                    <AlertTriangle className="w-4 h-4 text-rose-400" />
                  </div>
                  <div>
                    <p className="text-sm font-medium">
                      {account.student?.full_name || "Student"}
                    </p>
                    <p className="text-xs text-foreground/40">
                      {account.student?.current_class_id ? "Class" : ""}
                    </p>
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-sm font-semibold text-rose-400">
                    {formatUGX(account.balance)}
                  </p>
                  <Badge variant="destructive" className="text-[10px]">Unpaid</Badge>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function QuickActions() {
  const actions = [
    { label: "Record Payment", href: "/dashboard/fees/payments/new", icon: CreditCard, color: "bg-emerald-500/10 text-emerald-400" },
    { label: "Add Student", href: "/dashboard/students/enroll", icon: UserPlus, color: "bg-amber-500/10 text-amber-400" },
    { label: "Take Attendance", href: "/dashboard/attendance/take", icon: ClipboardList, color: "bg-blue-500/10 text-blue-400" },
    { label: "Send SMS", href: "/dashboard/communication/compose", icon: Send, color: "bg-purple-500/10 text-purple-400" },
    { label: "Enter Marks", href: "/dashboard/academics/marks", icon: BookOpen, color: "bg-cyan-500/10 text-cyan-400" },
    { label: "Report Cards", href: "/dashboard/academics/report-cards", icon: FileText, color: "bg-orange-500/10 text-orange-400" },
  ];

  return (
    <Card className="border-border-subtle bg-surface">
      <CardHeader>
        <CardTitle className="text-lg">Quick Actions</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 gap-3">
          {actions.map((action) => (
            <Link key={action.href} href={action.href}>
              <div className="flex items-center gap-3 p-3 rounded-lg bg-navy-900/50 hover:bg-navy-900 transition-colors cursor-pointer group">
                <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${action.color}`}>
                  <action.icon className="w-5 h-5" />
                </div>
                <span className="text-sm font-medium group-hover:text-amber-400 transition-colors">
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

function OnboardingChecklist() {
  const [steps, setSteps] = useState([
    { label: "Add your first class", done: false, href: "/dashboard/students/classes" },
    { label: "Enroll students", done: false, href: "/dashboard/students/enroll" },
    { label: "Set up fee structure", done: false, href: "/dashboard/fees/structure" },
    { label: "Add a teacher", done: false, href: "/dashboard/staff" },
    { label: "Send your first SMS", done: false, href: "/dashboard/communication/compose" },
    { label: "Set up Mobile Money collection", done: false, href: "/dashboard/settings/api" },
  ]);

  const completedCount = steps.filter((s) => s.done).length;
  const allDone = completedCount === steps.length;

  if (allDone) return null;

  return (
    <motion.div {...fadeInUp} transition={{ delay: 0.3 }}>
      <Card className="border-amber-400/20 bg-amber-400/5">
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-lg">Get Started with SKULI</CardTitle>
            <Badge variant="default">
              {completedCount}/{steps.length}
            </Badge>
          </div>
          <div className="w-full bg-navy-800 rounded-full h-2 mt-2">
            <div
              className="bg-amber-400 h-2 rounded-full transition-all duration-500"
              style={{ width: `${(completedCount / steps.length) * 100}%` }}
            />
          </div>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            {steps.map((step) => (
              <Link key={step.label} href={step.href}>
                <div className="flex items-center gap-3 p-2 rounded-lg hover:bg-navy-800/50 transition-colors cursor-pointer">
                  <div
                    className={`w-5 h-5 rounded-full border-2 flex items-center justify-center ${
                      step.done
                        ? "bg-emerald-500 border-emerald-500"
                        : "border-foreground/30"
                    }`}
                  >
                    {step.done && (
                      <CheckCircle2 className="w-3 h-3 text-white" />
                    )}
                  </div>
                  <span
                    className={`text-sm ${
                      step.done ? "line-through text-foreground/40" : ""
                    }`}
                  >
                    {step.label}
                  </span>
                </div>
              </Link>
            ))}
          </div>
        </CardContent>
      </Card>
    </motion.div>
  );
}

export default function DashboardPage() {
  const { school, currentTerm } = useSchoolStore();
  const supabase = createBrowserClient();
  const [loading, setLoading] = useState(true);
  const [kpIs, setKPIs] = useState<DashboardKPIs>({
    totalExpected: 0,
    totalCollected: 0,
    totalOutstanding: 0,
    collectionRate: 0,
  });
  const [recentPayments, setRecentPayments] = useState<FeePayment[]>([]);
  const [defaulterAccounts, setDefaulterAccounts] = useState<(FeeAccount & { student?: Student })[]>([]);
  const [studentCount, setStudentCount] = useState(0);
  const [classCount, setClassCount] = useState(0);
  const [presentToday, setPresentToday] = useState(0);
  const [totalStudentsToday, setTotalStudentsToday] = useState(0);
  const [smsSent, setSmsSent] = useState(0);
  const [feeTrendData, setFeeTrendData] = useState<{ week: string; amount: number }[]>([]);
  const [paymentMethodData, setPaymentMethodData] = useState<{ name: string; value: number }[]>([]);
  const [attendanceByClass, setAttendanceByClass] = useState<{ className: string; teacher: string; present: number; total: number; pct: number }[]>([]);

  useEffect(() => {
    document.title = "Dashboard | SKULI";
  }, []);

  useEffect(() => {
    async function loadDashboard() {
      if (!school) return;

      const schoolId = school.id;
      const termId = currentTerm?.id;

      // Load KPIs
      if (termId) {
        const { data: accounts } = await supabase
          .from("fee_accounts")
          .select("total_expected, total_paid, balance, status")
          .eq("school_id", schoolId)
          .eq("term_id", termId);

        if (accounts) {
          const totalExpected = accounts.reduce((sum: number, a: FeeAccountRow) => sum + (a.total_expected || 0), 0);
          const totalCollected = accounts.reduce((sum: number, a: FeeAccountRow) => sum + (a.total_paid || 0), 0);
          const totalOutstanding = accounts.reduce((sum: number, a: FeeAccountRow) => sum + (a.balance || 0), 0);
          setKPIs({
            totalExpected,
            totalCollected,
            totalOutstanding,
            collectionRate: totalExpected > 0 ? Math.round((totalCollected / totalExpected) * 100) : 0,
          });
        }

        // Load defaulters
        const { data: defaulters } = await supabase
          .from("fee_accounts")
          .select("*, student:students(*)")
          .eq("school_id", schoolId)
          .eq("term_id", termId)
          .gt("balance", 0)
          .order("balance", { ascending: false })
          .limit(5);

        if (defaulters) setDefaulterAccounts(defaulters);
      }

      // Load recent payments
      const { data: payments } = await supabase
        .from("fee_payments")
        .select("*, student:students(full_name, admission_number)")
        .eq("school_id", schoolId)
        .order("created_at", { ascending: false })
        .limit(5);

      if (payments) setRecentPayments(payments);

      // Student count
      const { count: sCount } = await supabase
        .from("students")
        .select("id", { count: "exact", head: true })
        .eq("school_id", schoolId)
        .eq("is_deleted", false)
        .eq("status", "active");
      setStudentCount(sCount ?? 0);

      // Class count
      const { count: cCount } = await supabase
        .from("classes")
        .select("id", { count: "exact", head: true })
        .eq("school_id", schoolId)
        .eq("is_deleted", false);
      setClassCount(cCount ?? 0);

      // Attendance today
      const today = new Date().toISOString().split("T")[0];
      const { data: todayAttendance } = await supabase
        .from("attendance_records")
        .select("student_id, status")
        .eq("school_id", schoolId)
        .eq("date", today);

      if (todayAttendance) {
        const present = todayAttendance.filter((r: { status: string }) => r.status === "present").length;
        setPresentToday(present);
        setTotalStudentsToday(todayAttendance.length);
      }

      // SMS sent this term
      const { count: smsCount } = await supabase
        .from("sms_logs")
        .select("id", { count: "exact", head: true })
        .eq("school_id", schoolId)
        .eq("status", "sent");
      setSmsSent(smsCount ?? 0);

      // Fee collection trend (group by week for current term)
      if (termId) {
        const { data: termPayments } = await supabase
          .from("fee_payments")
          .select("amount, payment_date")
          .eq("school_id", schoolId)
          .eq("status", "confirmed")
          .order("payment_date");

        if (termPayments && termPayments.length > 0) {
          const weekMap = new Map<string, number>();
          termPayments.forEach((p: { payment_date: string; amount: number }) => {
            const d = new Date(p.payment_date);
            const weekStart = new Date(d);
            weekStart.setDate(d.getDate() - d.getDay());
            const key = weekStart.toISOString().split("T")[0];
            weekMap.set(key, (weekMap.get(key) ?? 0) + Number(p.amount));
          });
          const trend = Array.from(weekMap.entries())
            .sort(([a], [b]) => a.localeCompare(b))
            .slice(-8)
            .map(([date, amount], i) => ({
              week: `W${i + 1}`,
              amount,
            }));
          setFeeTrendData(trend);
        }

        // Payment methods breakdown
        const { data: methodPayments } = await supabase
          .from("fee_payments")
          .select("amount, payment_method")
          .eq("school_id", schoolId)
          .eq("status", "confirmed");

        if (methodPayments) {
          const methodMap = new Map<string, number>();
          methodPayments.forEach((p: { payment_method: string | null; amount: number }) => {
            const method = p.payment_method ?? "other";
            methodMap.set(method, (methodMap.get(method) ?? 0) + Number(p.amount));
          });
          const methodLabels: Record<string, string> = {
            cash: "Cash",
            mobile_money: "Mobile Money",
            bank: "Bank Transfer",
            waiver: "Waiver",
            other: "Other",
          };
          setPaymentMethodData(
            Array.from(methodMap.entries()).map(([k, v]) => ({
              name: methodLabels[k] ?? k,
              value: v,
            }))
          );
        }
      }

      // Attendance by class (today) — always show all classes
      const { data: classData } = await supabase
        .from("classes")
        .select("id, name, class_teacher_id, class_teacher:users!class_teacher_id(full_name)")
        .eq("school_id", schoolId)
        .eq("is_deleted", false);

      if (classData) {
        const { data: classAttendance } = await supabase
          .from("attendance_records")
          .select("class_id, status")
          .eq("school_id", schoolId)
          .eq("date", today);

        const classMap = new Map<string, { present: number; total: number }>();
        (classAttendance || []).forEach((r: { class_id: string; status: string }) => {
          const entry = classMap.get(r.class_id) ?? { present: 0, total: 0 };
          entry.total++;
          if (r.status === "present") entry.present++;
          classMap.set(r.class_id, entry);
        });

        type ClassWithTeacher = {
          id: string;
          name: string;
          class_teacher?: { full_name?: string } | null;
        };

        setAttendanceByClass(
          (classData as unknown as ClassWithTeacher[])
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
              // Sort: unmarked (-1) first, then by pct ascending
              if (a.pct === -1 && b.pct !== -1) return -1;
              if (a.pct !== -1 && b.pct === -1) return 1;
              return a.pct - b.pct;
            })
        );
      }

      setLoading(false);
    }

    loadDashboard();
  }, [school, currentTerm, supabase]);

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map((i) => (
            <Skeleton key={i} className="h-28 rounded-xl" />
          ))}
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Skeleton className="h-80 rounded-xl" />
          <Skeleton className="h-80 rounded-xl" />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div>
        <h1 className="text-2xl font-bold">Dashboard</h1>
        <p className="text-foreground/60 text-sm">
          {currentTerm
            ? `Term ${currentTerm.name.replace("Term", "")} · ${currentTerm.academic_year_id ? "Current Term" : ""}`
            : "Welcome to SKULI"}
        </p>
      </div>

      {/* Onboarding Checklist */}
      <OnboardingChecklist />

      {/* KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          label="Total Expected"
          value={formatUGX(kpIs.totalExpected)}
          icon={Wallet}
          color="bg-amber-500/10 text-amber-400"
          delay={0}
        />
        <StatCard
          label="Total Collected"
          value={formatUGX(kpIs.totalCollected)}
          icon={TrendingUp}
          color="bg-emerald-500/10 text-emerald-400"
          delay={0.1}
        />
        <StatCard
          label="Outstanding Balance"
          value={formatUGX(kpIs.totalOutstanding)}
          icon={AlertTriangle}
          color="bg-rose-500/10 text-rose-400"
          delay={0.2}
        />
        <StatCard
          label="Collection Rate"
          value={`${kpIs.collectionRate}%`}
          icon={BarChart3}
          color="bg-blue-500/10 text-blue-400"
          delay={0.3}
        />
      </div>

      {/* Main Content Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Recent Payments */}
        <div className="lg:col-span-2">
          <RecentPaymentsTable payments={recentPayments} />
        </div>

        {/* Quick Actions */}
        <QuickActions />
      </div>

      {/* Second Row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Defaulters */}
        <DefaultersList accounts={defaulterAccounts} />

        {/* Student Stats */}
        <Card className="border-border-subtle bg-surface">
          <CardHeader>
            <CardTitle className="text-lg">School Overview</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-4">
              <div className="p-4 rounded-lg bg-navy-900/50 text-center">
                <Users className="w-8 h-8 text-amber-400 mx-auto mb-2" />
                <p className="text-2xl font-bold">{studentCount.toLocaleString()}</p>
                <p className="text-xs text-foreground/60">Students</p>
              </div>
              <div className="p-4 rounded-lg bg-navy-900/50 text-center">
                <BookOpen className="w-8 h-8 text-emerald-400 mx-auto mb-2" />
                <p className="text-2xl font-bold">{classCount.toLocaleString()}</p>
                <p className="text-xs text-foreground/60">Classes</p>
              </div>
              <div className="p-4 rounded-lg bg-navy-900/50 text-center">
                <ClipboardList className="w-8 h-8 text-blue-400 mx-auto mb-2" />
                <p className="text-2xl font-bold">
                  {totalStudentsToday > 0 ? `${presentToday}/${totalStudentsToday}` : "—"}
                </p>
                <p className="text-xs text-foreground/60">Present Today</p>
              </div>
              <div className="p-4 rounded-lg bg-navy-900/50 text-center">
                <Send className="w-8 h-8 text-purple-400 mx-auto mb-2" />
                <p className="text-2xl font-bold">{smsSent.toLocaleString()}</p>
                <p className="text-xs text-foreground/60">SMS Sent</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Charts Row */}
      {(feeTrendData.length > 0 || paymentMethodData.length > 0 || attendanceByClass.length > 0) && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Fee Collection Trend */}
          {feeTrendData.length > 0 && (
            <Card className="border-border-subtle bg-surface lg:col-span-1">
              <CardHeader>
                <CardTitle className="text-lg">Fee Collection Trend</CardTitle>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={200}>
                  <BarChart data={feeTrendData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                    <XAxis dataKey="week" tick={{ fontSize: 11, fill: "rgba(255,255,255,0.5)" }} />
                    <YAxis tick={{ fontSize: 11, fill: "rgba(255,255,255,0.5)" }} tickFormatter={(v) => `${(v / 1000000).toFixed(1)}M`} />
                    <Tooltip
                      formatter={(value) => [formatUGX(Number(value)), "Amount"]}
                      contentStyle={{ background: "#1a1a2e", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8, fontSize: 12 }}
                      labelStyle={{ color: "rgba(255,255,255,0.7)" }}
                      itemStyle={{ color: "#f59e0b" }}
                    />
                    <Bar dataKey="amount" fill="#f59e0b" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          )}

          {/* Payment Methods */}
          {paymentMethodData.length > 0 && (
            <Card className="border-border-subtle bg-surface">
              <CardHeader>
                <CardTitle className="text-lg">Payment Methods</CardTitle>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={200}>
                  <PieChart>
                    <Pie
                      data={paymentMethodData}
                      cx="50%"
                      cy="50%"
                      innerRadius={50}
                      outerRadius={80}
                      paddingAngle={2}
                      dataKey="value"
                    >
                      {paymentMethodData.map((_, i) => (
                        <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip
                      formatter={(value) => formatUGX(Number(value))}
                      contentStyle={{ background: "#1a1a2e", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8, fontSize: 12 }}
                    />
                    <Legend
                      iconSize={8}
                      wrapperStyle={{ fontSize: 11, color: "rgba(255,255,255,0.6)" }}
                    />
                  </PieChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          )}

          {/* Attendance by Class */}
          {attendanceByClass.length > 0 && (
            <Card className="border-border-subtle bg-surface">
              <CardHeader>
                <CardTitle className="text-lg">Attendance Today</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {attendanceByClass.map((c) => (
                    <div key={c.className} className="space-y-1">
                      <div className="flex items-center justify-between text-sm">
                        <div className="min-w-0">
                          <span className="font-medium truncate block">{c.className}</span>
                          {c.teacher && (
                            <span className="text-[10px] text-foreground/40">{c.teacher}</span>
                          )}
                        </div>
                        {c.pct === -1 ? (
                          <span className="text-xs text-amber-400">Not marked yet</span>
                        ) : (
                          <span className="text-muted-foreground text-xs">{c.pct}%</span>
                        )}
                      </div>
                      {c.pct !== -1 && (
                        <div className="w-full bg-navy-800 rounded-full h-2">
                          <div
                            className={`h-2 rounded-full transition-all ${
                              c.pct >= 80 ? "bg-emerald-400" : c.pct >= 50 ? "bg-amber-400" : "bg-rose-400"
                            }`}
                            style={{ width: `${c.pct}%` }}
                          />
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      )}
    </div>
  );
}

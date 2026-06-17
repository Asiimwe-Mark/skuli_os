"use client";

import { useEffect} from "react";
import { useDocumentTitle } from "@/lib/hooks/useDocumentTitle";
import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { motion } from "framer-motion";
import { useSchoolStore } from "@/store/school";
import { useSupabaseBrowser } from "@/lib/supabase/client";
import { formatUGX } from "@/lib/utils/currency";
import { formatDate } from "@/lib/utils/dates";
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
  Plus,
  Receipt as ReceiptIcon,
  FileText,
  Smartphone,
  Banknote,
  Building2,
  Gift,
  ArrowUpRight,
  Sparkles,
} from "lucide-react";

interface FeeAccountRow {
  id: string;
  student_id: string;
  total_expected: number;
  total_paid: number;
  balance: number;
  status: string;
  student: {
    id: string;
    full_name: string;
    admission_number: string;
    parent_phone: string;
    current_class: { id: string; name: string } | null;
  } | null;
}

interface FeePaymentRow {
  id: string;
  amount: number;
  payment_method: string;
  payment_date: string;
  receipt_number: string;
  student: {
    id: string;
    full_name: string;
    admission_number: string;
  } | null;
}

export default function FeesIndexPage() {
  useDocumentTitle("Fees");
  const school = useSchoolStore((s) => s.school);
  const currentTerm = useSchoolStore((s) => s.currentTerm);
  const supabase = useSupabaseBrowser();

  const { data, isLoading } = useQuery({
    queryKey: ["fees-index", school?.id, currentTerm?.id],
    enabled: !!school?.id && !!currentTerm?.id,
    queryFn: async () => {
      const [{ data: accountsData }, { data: paymentsData }] = await Promise.all([
        supabase
          .from("fee_accounts")
          .select("id, student_id, total_expected, total_paid, balance, status, student:students(id, full_name, admission_number, parent_phone, current_class:classes(id, name))")
          .eq("school_id", school!.id)
          .eq("term_id", currentTerm!.id)
          .eq("is_deleted", false),
        supabase
          .from("fee_payments")
          .select("id, amount, payment_method, payment_date, receipt_number, student:students(id, full_name, admission_number)")
          .eq("school_id", school!.id)
          .eq("term_id", currentTerm!.id)
          .eq("is_deleted", false)
          .order("payment_date", { ascending: false })
          .limit(5),
      ]);

      const accounts = ((accountsData ?? []) as any[]).map((a) => ({
        ...a,
        student: Array.isArray(a.student) ? a.student[0] : a.student,
      })) as FeeAccountRow[];

      const payments = ((paymentsData ?? []) as any[]).map((p) => ({
        ...p,
        student: Array.isArray(p.student) ? p.student[0] : p.student,
      })) as FeePaymentRow[];

      const totalExpected = accounts.reduce((s, a) => s + (a.total_expected || 0), 0);
      const totalCollected = accounts.reduce((s, a) => s + (a.total_paid || 0), 0);
      const outstanding = accounts.reduce((s, a) => s + Math.max(a.balance, 0), 0);
      const defaulterCount = accounts.filter((a) => a.balance > 0).length;
      const collectionRate = totalExpected > 0
        ? Math.round((totalCollected / totalExpected) * 100)
        : 0;

      return {
        accounts,
        payments,
        totalExpected,
        totalCollected,
        outstanding,
        defaulterCount,
        collectionRate,
      };
    },
  });

  const methodColors: Record<string, string> = {
    mobile_money: "bg-success-50 text-success-600 dark:bg-success-900/30 dark:text-success-400",
    cash:         "bg-warning-50 text-warning-600 dark:bg-warning-900/30 dark:text-warning-400",
    bank:         "bg-info-50 text-info-600 dark:bg-info-900/30 dark:text-info-400",
    waiver:       "bg-bg-tertiary text-muted",
  };

  const methodIcons: Record<string, React.ElementType> = {
    mobile_money: Smartphone,
    cash: Banknote,
    bank: Building2,
    waiver: Gift,
  };

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-32 rounded-3xl" />
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-28 rounded-2xl" />)}
        </div>
        <Skeleton className="h-80 rounded-2xl" />
      </div>
    );
  }

  if (!data) {
    return (
      <div className="flex flex-col items-center justify-center py-20">
        <EmptyState
          icon={Wallet}
          title="Set up your school first"
          description="Add classes and students before managing fees."
          action={
            <Link href="/dashboard/students/classes">
              <Button>Add Classes</Button>
            </Link>
          }
        />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="relative overflow-hidden rounded-3xl border border-border bg-bg-tertiary backdrop-blur-xl p-6 sm:p-8 shadow-card">
        <div className="pointer-events-none absolute -top-20 -right-20 h-64 w-64 rounded-full opacity-15 blur-3xl" />
        <div className="relative flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-2">
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-bg-tertiary text-primary text-[11px] font-semibold border">
                <Sparkles className="h-3 w-3" />
                Fees
              </span>
              {currentTerm && (
                <Badge variant="brand" className="text-[10px]">
                  {currentTerm.name.replace("Term", "Term ")}
                </Badge>
              )}
            </div>
            <h1 className="font-display text-3xl sm:text-4xl font-bold tracking-tight text-heading">
              Fee Management
            </h1>
            <p className="text-muted mt-1.5 text-sm">
              Track collections, send reminders, and reconcile payments.
            </p>
          </div>
          <Link href="/dashboard/fees/payments/new">
            <Button size="lg" variant="default" className="w-full sm:w-auto">
              <Plus className="h-4 w-4" />
              Record Payment
            </Button>
          </Link>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label="Total Expected"  value={data.totalExpected}   format="currency" icon={Wallet}       color="brand"    delay={0} />
        <StatCard label="Total Collected" value={data.totalCollected}  format="currency" icon={TrendingUp}  color="success" delay={0.08} />
        <StatCard label="Outstanding"     value={data.outstanding}     format="currency" icon={AlertTriangle} color="danger"  delay={0.16} />
        <StatCard label="Collection Rate" value={data.collectionRate}  format="percent"  icon={ReceiptIcon} color="info"     delay={0.24} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card className="lg:col-span-2">
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle>Quick Links</CardTitle>
              <p className="text-xs text-muted mt-1">Jump to common tasks</p>
            </div>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              {[
                { label: "Fee Accounts",     href: "/dashboard/fees/accounts",    icon: FileText,    color: "  text-muted" },
                { label: "Record Payment",   href: "/dashboard/fees/payments/new", icon: Plus,      bg: "bg-success-100 text-success-700" },
                { label: "Fee Structure",    href: "/dashboard/fees/structure",   icon: Wallet,      bg: "bg-bg-tertiary text-text-muted" },
                { label: "Discounts",        href: "/dashboard/fees/discounts",   icon: Gift,        bg: "bg-danger-100 text-danger-700" },
                { label: "Defaulters",       href: "/dashboard/fees/defaulters",  icon: AlertTriangle, bg: "bg-danger-100 text-danger-700" },
                { label: "Receipts",         href: "/dashboard/fees/receipts",    icon: ReceiptIcon, bg: "bg-info-100 text-info-700" },
                { label: "Statements",       href: "/dashboard/fees/statements",  icon: FileText,    bg: "bg-warning-100 text-warning-700" },
                { label: "Reports",          href: "/dashboard/fees/reports",     icon: TrendingUp,  bg: "bg-success-100 text-success-700" },
              ].map((item) => (
                <Link key={item.href} href={item.href}>
                  <div className="group flex items-center gap-3 p-3 rounded-xl bg-bg-tertiary hover:bg-card-hover border border-border transition-all hover:shadow-soft">
                    <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ring-1 ring-border ${item.bg}`}>
                      <item.icon className="h-5 w-5" />
                    </div>
                    <span className="text-sm font-semibold text-heading group-hover:text-brand-600 transition-colors">
                      {item.label}
                    </span>
                    <ArrowUpRight className="ml-auto h-4 w-4 text-muted opacity-0 group-hover:opacity-100 transition-opacity" />
                  </div>
                </Link>
              ))}
            </div>
          </CardContent>
        </Card>

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
            {data.payments.length === 0 ? (
              <EmptyState
                icon={Wallet}
                title="No payments yet"
                description="Record your first fee payment to see it here."
                action={
                  <Link href="/dashboard/fees/payments/new">
                    <Button>Record First Payment</Button>
                  </Link>
                }
              />
            ) : (
              <div className="space-y-2.5">
                {data.payments.map((p, i) => {
                  const Icon = methodIcons[p.payment_method] ?? Wallet;
                  return (
                    <motion.div
                      key={p.id}
                      initial={{ opacity: 0, x: -8 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: i * 0.05 }}
                      className="flex items-center justify-between p-3 rounded-xl bg-bg-tertiary hover:bg-card-hover border border-border transition-all"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="w-10 h-10 rounded-xl bg-brand-100 text-brand-700 flex items-center justify-center shadow-sm">
                          <Icon className="w-4 h-4" />
                        </div>
                        <div className="min-w-0">
                          <p className="text-sm font-semibold truncate">
                            {p.student?.full_name || "Student"}
                          </p>
                          <div className="flex items-center gap-1.5 mt-0.5">
                            <span
                              className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-md ${methodColors[p.payment_method] || methodColors.cash}`}
                            >
                              {p.payment_method === "mobile_money" ? "Mobile Money"
                                : p.payment_method === "cash" ? "Cash"
                                : p.payment_method === "bank" ? "Bank"
                                : "Waiver"}
                            </span>
                            <span className="text-xs text-muted">
                              * {formatDate(p.payment_date)}
                            </span>
                          </div>
                        </div>
                      </div>
                      <p className="text-sm font-bold text-success-600 dark:text-success-400 tabular-nums shrink-0">
                        {formatUGX(p.amount)}
                      </p>
                    </motion.div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

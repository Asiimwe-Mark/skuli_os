"use client";

import { useState, useMemo, useRef, useEffect} from "react";
import { useDocumentTitle } from "@/lib/hooks/useDocumentTitle";
import Link from "next/link";
import { motion } from "framer-motion";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useSupabaseBrowser } from "@/lib/supabase/client";
import { useSchoolStore } from "@/store/school";
import { invalidate } from "@/lib/query-keys";
import { cn } from "@/lib/utils/cn";
import { formatUGX } from "@/lib/utils/currency";
import type { FeeAccountStatus } from "@/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/shared/empty-state";
import { useToast } from "@/components/ui/use-toast";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Wallet,
  Search,
  Send,
  Loader2,
  AlertTriangle,
  CheckCircle2,
  Clock,
  XCircle,
  ArrowUpDown,
  ChevronUp,
  ChevronDown,
  Users,
  TrendingUp,
  BarChart3,
  CreditCard,
  Smartphone,
} from "lucide-react";
import { ApplyDiscountDialog } from "@/components/fees/apply-discount-dialog";

interface FeeAccountRow {
  id: string;
  student_id: string;
  total_expected: number;
  total_paid: number;
  balance: number;
  status: FeeAccountStatus;
  student: {
    id: string;
    full_name: string;
    admission_number: string;
    parent_phone: string;
    current_class: { id: string; name: string } | null;
  } | null;
}

type SortField = "balance" | "student_name" | "expected" | "paid";
type SortDir = "asc" | "desc";

const statusConfig: Record<
  FeeAccountStatus,
  { label: string; color: string; icon: React.ElementType }
> = {
  current: {
    label: "CURRENT",
    color: "bg-info-50 text-info-700 border-info-100",
    icon: CheckCircle2,
  },
  paid: {
    label: "PAID",
    color: "bg-success-50 text-success-700 border-success-100",
    icon: CheckCircle2,
  },
  partial: {
    label: "PARTIAL",
    color: "bg-warning-50 text-warning-700 border-warning-100",
    icon: Clock,
  },
  unpaid: {
    label: "UNPAID",
    color: "bg-danger-50 text-danger-700 border-danger-100",
    icon: XCircle,
  },
  overpaid: {
    label: "OVERPAID",
    color: "bg-bg-tertiary text-text-heading border-border",
    icon: AlertTriangle,
  },
};

export default function FeeAccountsPage() {
  useDocumentTitle("Fee Accounts");
  const school = useSchoolStore((s) => s.school);
  const currentTerm = useSchoolStore((s) => s.currentTerm);
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const supabase = useSupabaseBrowser();

  const [search, setSearch] = useState("");
  const [filterClass, setFilterClass] = useState("all");
  const [filterStatus, setFilterStatus] = useState("all");
  const [sortField, setSortField] = useState<SortField>("balance");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [smsDialogOpen, setSmsDialogOpen] = useState(false);
  const [stkPushOpen, setStkPushOpen] = useState(false);
  const [stkAccount, setStkAccount] = useState<FeeAccountRow | null>(null);
  const [stkPhone, setStkPhone] = useState("");
  const [stkAmount, setStkAmount] = useState("");
  const [stkStatus, setStkStatus] = useState<"idle" | "initiating" | "polling" | "success" | "timeout" | "error">("idle");
  const [discountOpen, setDiscountOpen] = useState(false);
  const [selectedStudent, setSelectedStudent] = useState<{ id: string; name: string } | null>(null);
  const [stkMessage, setStkMessage] = useState("");
  const stkPollingTimerRef = useRef<NodeJS.Timeout | null>(null);

  // ?"EUR?"EUR Queries ?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR

  const { data: accounts = [], isLoading } = useQuery({
    queryKey: ["fee-accounts", school?.id, currentTerm?.id],
    // Audit 5.4: the previous code used `currentTerm!.id` here
    // with a non-null assertion. The `enabled` clause below is
    // a runtime guarantee that `currentTerm` is non-null when
    // the queryFn runs, but the `!` was a lie to the type
    // system. We now capture the term id into a local that
    // TypeScript can narrow to string, and return an empty
    // page if it ever changes to null under us.
    queryFn: async () => {
      const termId = currentTerm?.id;
      if (!termId) return [];
      const res = await fetch(`/api/fees/accounts?term_id=${termId}`);
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Failed to load fee accounts");
      // Audit 2.9 (3.23): with Supabase JS v2 a to-one join is always
      // an object (or null), never an array. The old `Array.isArray`
      // normalisation was dead code; the API now consistently returns
      // a single object per row.
      interface RawFeeAccountRow {
        id: string;
        student_id: string;
        total_expected: number;
        total_paid: number;
        balance: number;
        status: FeeAccountStatus;
        student?: FeeAccountRow['student'] | null;
        student_current_class?: { id: string; name: string } | null;
      }
      return ((json.data?.accounts || json.accounts || []) as unknown as RawFeeAccountRow[]).map((a) => ({
        ...a,
        student: a.student ?? null,
        student_current_class: a.student_current_class ?? null,
      })) as FeeAccountRow[];
    },
    enabled: !!school?.id && !!currentTerm?.id,
  });

  const { data: classes = [] } = useQuery({
    queryKey: ["classes", school?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("classes")
        .select("id, name")
        .eq("school_id", school!.id)
        .eq("is_deleted", false)
        .order("name");
      if (error) throw error;
      return (data ?? []) as { id: string; name: string }[];
    },
    enabled: !!school?.id,
  });

  // ?"EUR?"EUR SMS mutation ?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR

  const sendReminderMutation = useMutation({
    mutationFn: async () => {
      const unpaid = accounts.filter((a) => a.status === "unpaid" && a.student);
      if (unpaid.length === 0) throw new Error("No unpaid accounts found");

      let sent = 0;
      for (const a of unpaid) {
        const message = `Dear Parent, this is a reminder that ${a.student!.full_name} has an outstanding balance of ${formatUGX(a.balance)} for ${currentTerm?.name ?? "the current term"}. Please clear the balance. Thank you, ${school?.name}.`;
        const { error } = await supabase.from("sms_logs").insert({
          school_id: school!.id,
          recipient_phone: a.student!.parent_phone,
          message_body: message,
          message_type: "fee_reminder",
          status: "pending",
          africa_talking_message_id: null,
          cost: null,
          sent_at: null,
          related_entity_type: null,
          related_entity_id: null,
        } as any);
        if (!error) sent++;
      }
      return { sent, total: unpaid.length };
    },
    onSuccess: (result) => {
      toast({
        title: "Reminders queued",
        description: `${result.sent} SMS reminders sent to parents of unpaid students.`,
      });
      setSmsDialogOpen(false);
    },
    onError: (err) => {
      toast({
        title: "Error sending reminders",
        description: err instanceof Error ? err.message : "Something went wrong",
        variant: "destructive",
      });
    },
  });

  // ?"EUR?"EUR Filtering & sorting ?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR

  const filteredAndSorted = useMemo(() => {
    let result = [...accounts];

    if (search) {
      const q = search.toLowerCase();
      result = result.filter(
        (a) =>
          a.student?.full_name?.toLowerCase().includes(q) ||
          a.student?.admission_number?.toLowerCase().includes(q)
      );
    }
    if (filterClass !== "all") {
      result = result.filter(
        (a) => a.student?.current_class?.id === filterClass
      );
    }
    if (filterStatus !== "all") {
      result = result.filter((a) => a.status === filterStatus);
    }

    result.sort((a, b) => {
      let aVal: string | number;
      let bVal: string | number;
      switch (sortField) {
        case "student_name":
          aVal = a.student?.full_name || "";
          bVal = b.student?.full_name || "";
          break;
        case "expected":
          aVal = a.total_expected;
          bVal = b.total_expected;
          break;
        case "paid":
          aVal = a.total_paid;
          bVal = b.total_paid;
          break;
        default:
          aVal = a.balance;
          bVal = b.balance;
      }
      if (typeof aVal === "string") {
        return sortDir === "asc"
          ? aVal.localeCompare(bVal as string)
          : (bVal as string).localeCompare(aVal);
      }
      return sortDir === "asc"
        ? (aVal as number) - (bVal as number)
        : (bVal as number) - (aVal as number);
    });

    return result;
  }, [accounts, search, filterClass, filterStatus, sortField, sortDir]);

  // ?"EUR?"EUR Summary stats ?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR

  const summary = useMemo(() => {
    const totalExpected = filteredAndSorted.reduce(
      (s, a) => s + a.total_expected,
      0
    );
    const totalPaid = filteredAndSorted.reduce(
      (s, a) => s + a.total_paid,
      0
    );
    const totalOutstanding = filteredAndSorted.reduce(
      (s, a) => s + Math.max(a.balance, 0),
      0
    );
    const rate =
      totalExpected > 0 ? Math.round((totalPaid / totalExpected) * 100) : 0;
    return { totalExpected, totalPaid, totalOutstanding, rate };
  }, [filteredAndSorted]);

  const unpaidCount = accounts.filter((a) => a.status === "unpaid").length;

  // ?"EUR?"EUR STK Push ?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR

  async function initiateStkPush() {
    if (!stkAccount || !stkPhone || !stkAmount) return;
    setStkStatus("initiating");
    setStkMessage("Initiating payment request...");

    try {
      const response = await fetch("/api/fees/stk-push", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          phone: stkPhone,
          amount: Number(stkAmount),
          student_id: stkAccount.student_id,
          fee_account_id: stkAccount.id,
        }),
      });

      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Failed to initiate payment");

      setStkStatus("polling");
      setStkMessage(`Waiting for payment confirmation on ${stkPhone}...`);

      let pollCount = 0;
      const maxPolls = 40;
      const timer = setInterval(async () => {
        pollCount++;
        try {
          const { data: payments } = await supabase
            .from("fee_payments")
            .select("id, status, amount, receipt_number")
            .eq("student_id", stkAccount.student_id)
            .eq("payment_method", "mobile_money")
            .eq("status", "confirmed")
            .gte("created_at", new Date(Date.now() - 180000).toISOString())
            .order("created_at", { ascending: false })
            .limit(1);

          if (payments && payments.length > 0) {
            clearInterval(timer);
            stkPollingTimerRef.current = null;
            setStkStatus("success");
            setStkMessage(`Payment of ${formatUGX(payments[0].amount)} confirmed! Receipt: ${payments[0].receipt_number}`);
            // Audit (Bug #5): use the centralised invalidator so a
            // confirmed payment refreshes the student's account, the
            // defaulters list, the dashboard, and the receipts view
            // in one shot. The old code only invalidated ["fee-accounts"]
            // which matched every school's cache.
            if (school?.id) {
              invalidate.feePaymentRecorded(queryClient, school.id);
            } else {
              queryClient.invalidateQueries({ queryKey: ["fee-accounts"] });
            }
            toast({ title: "Payment Confirmed", description: `Receipt: ${payments[0].receipt_number}`, variant: "success" });
          } else if (pollCount >= maxPolls) {
            clearInterval(timer);
            stkPollingTimerRef.current = null;
            setStkStatus("timeout");
            setStkMessage("Payment confirmation timed out. The payment may still be processing.");
          }
        } catch {
          // Silently continue polling
        }
      }, 3000);

      stkPollingTimerRef.current = timer;
    } catch (err) {
      setStkStatus("error");
      setStkMessage(err instanceof Error ? err.message : "Failed to initiate payment");
    }
  }

  function resetStkPush() {
    if (stkPollingTimerRef.current) clearInterval(stkPollingTimerRef.current);
    stkPollingTimerRef.current = null;
    setStkStatus("idle");
    setStkMessage("");
    setStkPhone("");
    setStkAmount("");
    setStkAccount(null);
    setStkPushOpen(false);
  }

  function toggleSort(field: SortField) {
    if (sortField === field) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortField(field);
      setSortDir(field === "balance" ? "desc" : "asc");
    }
  }

  function SortIndicator({ field }: { field: SortField }) {
    if (sortField !== field)
      return <ArrowUpDown className="w-3 h-3 text-muted" />;
    return sortDir === "asc" ? (
      <ChevronUp className="w-3 h-3 text-text-heading" />
    ) : (
      <ChevronDown className="w-3 h-3 text-text-heading" />
    );
  }

  // ?"EUR?"EUR Render ?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <Skeleton className="h-8 w-48" />
            <Skeleton className="h-4 w-32 mt-2" />
          </div>
        </div>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map((i) => (
            <Skeleton key={i} className="h-24 rounded-xl" />
          ))}
        </div>
        <Skeleton className="h-96 rounded-xl" />
      </div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="space-y-6"
    >
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold font-display">Fee Accounts</h1>
          <p className="text-sm text-disabled">
            {currentTerm?.name?.replace("Term", "Term ")} -{" "}
            {accounts.length} accounts
          </p>
        </div>
        <div className="flex gap-2">
          {unpaidCount > 0 && (
            <Button
              variant="outline"
              onClick={() => setSmsDialogOpen(true)}
            >
              <Send className="w-4 h-4 mr-2" />
              Send Reminder SMS ({unpaidCount})
            </Button>
          )}
          <Link href="/dashboard/fees/payments/new">
            <Button>
              <CreditCard className="w-4 h-4 mr-2" />
              Record Payment
            </Button>
          </Link>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          {
            label: "Total Expected",
            value: summary.totalExpected,
            color: "text-text-heading",
            icon: Wallet,
            iconBg: "bg-warning-50 text-warning-700",
            delay: 0,
          },
          {
            label: "Total Collected",
            value: summary.totalPaid,
            color: "text-success-700",
            icon: TrendingUp,
            iconBg: "bg-success-50 text-success-700",
            delay: 0.05,
          },
          {
            label: "Outstanding",
            value: summary.totalOutstanding,
            color: "text-danger-700",
            icon: AlertTriangle,
            iconBg: "bg-danger-50 text-danger-700",
            delay: 0.1,
          },
          {
            label: "Collection Rate",
            value: summary.rate,
            color: "text-info-700",
            icon: BarChart3,
            iconBg: "bg-info-50 text-info-700",
            delay: 0.15,
            suffix: "%",
          },
        ].map((stat) => (
          <motion.div
            key={stat.label}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: stat.delay }}
            className="bg-bg-tertiary border border-border rounded-xl p-5"
          >
            <div className="flex items-start justify-between">
              <div>
                <p className="text-xs text-muted mb-1">{stat.label}</p>
                <p className={cn("text-xl font-bold", stat.color)}>
                  {stat.suffix
                    ? `${stat.value}${stat.suffix}`
                    : formatUGX(stat.value)}
                </p>
              </div>
              <div className={cn("p-2.5 rounded-lg", stat.iconBg)}>
                <stat.icon className="w-5 h-5" />
              </div>
            </div>
          </motion.div>
        ))}
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted" />
          <Input
            placeholder="Search by name or admission no..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-10"
          />
        </div>
        <Select value={filterClass} onValueChange={setFilterClass}>
          <SelectTrigger className="w-full sm:w-[180px]">
            <SelectValue placeholder="All Classes" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Classes</SelectItem>
            {classes.map((c) => (
              <SelectItem key={c.id} value={c.id}>
                {c.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={filterStatus} onValueChange={setFilterStatus}>
          <SelectTrigger className="w-full sm:w-[160px]">
            <SelectValue placeholder="All Statuses" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Statuses</SelectItem>
            <SelectItem value="current">CURRENT</SelectItem>
            <SelectItem value="paid">PAID</SelectItem>
            <SelectItem value="partial">PARTIAL</SelectItem>
            <SelectItem value="unpaid">UNPAID</SelectItem>
            <SelectItem value="overpaid">OVERPAID</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Table */}
      <div className="bg-bg-tertiary border border-border rounded-xl overflow-hidden">
        {filteredAndSorted.length === 0 ? (
          <EmptyState
            icon={Users}
            title="No fee accounts found"
            description={
              accounts.length === 0
                ? "Generate fee accounts from the Fee Structure page"
                : "Try adjusting your filters"
            }
          />
        ) : (
          <>
            {/* Desktop Table */}
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-border">
                    <th
                      className="px-4 py-3 text-left text-xs font-medium text-disabled uppercase cursor-pointer hover:text-heading"
                      onClick={() => toggleSort("student_name")}
                    >
                      <div className="flex items-center gap-1">
                        Student <SortIndicator field="student_name" />
                      </div>
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-disabled uppercase">
                      Adm. No.
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-disabled uppercase">
                      Class
                    </th>
                    <th
                      className="px-4 py-3 text-right text-xs font-medium text-disabled uppercase cursor-pointer hover:text-heading"
                      onClick={() => toggleSort("expected")}
                    >
                      <div className="flex items-center justify-end gap-1">
                        Expected <SortIndicator field="expected" />
                      </div>
                    </th>
                    <th
                      className="px-4 py-3 text-right text-xs font-medium text-disabled uppercase cursor-pointer hover:text-heading"
                      onClick={() => toggleSort("paid")}
                    >
                      <div className="flex items-center justify-end gap-1">
                        Paid <SortIndicator field="paid" />
                      </div>
                    </th>
                    <th
                      className="px-4 py-3 text-right text-xs font-medium text-disabled uppercase cursor-pointer hover:text-heading"
                      onClick={() => toggleSort("balance")}
                    >
                      <div className="flex items-center justify-end gap-1">
                        Balance <SortIndicator field="balance" />
                      </div>
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-disabled uppercase">
                      Status
                    </th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-disabled uppercase">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {filteredAndSorted.map((account, i) => {
                    const s = account.student;
                    const cfg =
                      statusConfig[account.status] ?? statusConfig.unpaid;
                    const StatusIcon = cfg.icon;
                    return (
                      <motion.tr
                        key={account.id}
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        transition={{ delay: i * 0.015 }}
                        className="border-b border-border hover:bg-card-hover transition-colors"
                      >
                        <td className="px-4 py-3">
                          <p className="text-sm font-medium">
                            {s?.full_name || "Unknown"}
                          </p>
                        </td>
                        <td className="px-4 py-3 text-sm text-disabled font-mono">
                          {s?.admission_number || "\u2014"}
                        </td>
                        <td className="px-4 py-3">
                          <Badge variant="secondary">
                            {s?.current_class?.name || "\u2014"}
                          </Badge>
                        </td>
                        <td className="px-4 py-3 text-sm text-right">
                          {formatUGX(account.total_expected)}
                        </td>
                        <td className="px-4 py-3 text-sm text-right text-success-700">
                          {formatUGX(account.total_paid)}
                        </td>
                        <td className="px-4 py-3 text-sm text-right font-medium">
                          <span
                            className={
                              account.balance > 0
                                ? "text-danger-700"
                                : account.balance < 0
                                ? "text-warning-700"
                                : "text-text-heading"
                            }
                          >
                            {formatUGX(Math.abs(account.balance))}
                            {account.balance < 0 && (
                              <span className="text-[10px] ml-1 opacity-70">
                                over
                              </span>
                            )}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <Badge
                            className={cn("text-xs border", cfg.color)}
                          >
                            <StatusIcon className="w-3 h-3 mr-1" />
                            {cfg.label}
                          </Badge>
                        </td>
                        <td className="px-4 py-3 text-right">
                          <div className="flex items-center justify-end gap-1">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => {
                                setSelectedStudent({ id: account.student_id, name: account.student?.full_name || "Student" });
                                setDiscountOpen(true);
                              }}
                            >
                              Apply Discount
                            </Button>
                            {account.status !== "paid" && (
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => {
                                  setStkAccount(account);
                                  setStkPhone(account.student?.parent_phone || "");
                                  setStkAmount(String(Math.max(account.balance, 0)));
                                  setStkPushOpen(true);
                                }}
                              >
                                <Smartphone className="w-4 h-4 mr-1" />
                                Request Payment
                              </Button>
                            )}
                          </div>
                        </td>
                      </motion.tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Mobile Cards */}
            <div className="md:hidden divide-y divide-border/50">
              {filteredAndSorted.map((account) => {
                const s = account.student;
                const cfg = statusConfig[account.status] ?? statusConfig.unpaid;
                const StatusIcon = cfg.icon;
                return (
                  <div key={account.id} className="p-4 hover:bg-card-hover transition-colors">
                    <div className="flex items-start justify-between mb-2">
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium truncate">{s?.full_name || "Unknown"}</p>
                        <p className="text-xs text-disabled font-mono">{s?.admission_number || "\u2014"}</p>
                      </div>
                      <Badge className={cn("text-xs border ml-2 shrink-0", cfg.color)}>
                        <StatusIcon className="w-3 h-3 mr-1" />
                        {cfg.label}
                      </Badge>
                    </div>
                    <div className="flex items-center gap-2 mb-3">
                      <Badge variant="secondary" className="text-xs">{s?.current_class?.name || "\u2014"}</Badge>
                    </div>
                    <div className="grid grid-cols-3 gap-2 text-center mb-3">
                      <div>
                        <p className="text-[10px] text-muted">Expected</p>
                        <p className="text-xs font-medium">{formatUGX(account.total_expected)}</p>
                      </div>
                      <div>
                        <p className="text-[10px] text-muted">Paid</p>
                        <p className="text-xs font-medium text-success-700">{formatUGX(account.total_paid)}</p>
                      </div>
                      <div>
                        <p className="text-[10px] text-muted">Balance</p>
                        <p className={cn("text-xs font-medium", account.balance > 0 ? "text-danger-700" : "text-text-heading")}>
                          {formatUGX(Math.abs(account.balance))}
                        </p>
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <Button variant="ghost" size="sm" className="flex-1 text-xs h-8" onClick={() => {
                        setSelectedStudent({ id: account.student_id, name: account.student?.full_name || "Student" });
                        setDiscountOpen(true);
                      }}>
                        Discount
                      </Button>
                      {account.status !== "paid" && (
                        <Button variant="ghost" size="sm" className="flex-1 text-xs h-8" onClick={() => {
                          setStkAccount(account);
                          setStkPhone(account.student?.parent_phone || "");
                          setStkAmount(String(Math.max(account.balance, 0)));
                          setStkPushOpen(true);
                        }}>
                          <Smartphone className="w-3 h-3 mr-1" />
                          Request
                        </Button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        )}
        <div className="px-4 py-3 border-t border-border">
          <p className="text-xs text-muted">
            Showing {filteredAndSorted.length} of {accounts.length} accounts
          </p>
        </div>
      </div>

      {/* SMS Dialog */}
      <AlertDialog open={smsDialogOpen} onOpenChange={setSmsDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Send Fee Reminders</AlertDialogTitle>
            <AlertDialogDescription>
              Send SMS reminders to parents of{" "}
              <strong>{unpaidCount} students</strong> with unpaid fees.
              Estimated cost: {formatUGX(unpaidCount * 50)}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <Button
              variant="ghost"
              onClick={() => setSmsDialogOpen(false)}
              disabled={sendReminderMutation.isPending}
            >
              Cancel
            </Button>
            <Button
              onClick={() => sendReminderMutation.mutate()}
              loading={sendReminderMutation.isPending}
            >
              <Send className="w-4 h-4 mr-2" />
              Send Reminders
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* STK Push Dialog */}
      <AlertDialog open={stkPushOpen} onOpenChange={(open) => { if (!open) resetStkPush(); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Request Mobile Money Payment</AlertDialogTitle>
            <AlertDialogDescription>
              {stkAccount?.student?.full_name} - Balance: {formatUGX(stkAccount?.balance || 0)}
            </AlertDialogDescription>
          </AlertDialogHeader>

          {stkStatus === "idle" && (
            <div className="space-y-4 py-2">
              <div className="space-y-2">
                <Label>Phone Number</Label>
                <Input
                  placeholder="07XXXXXXXX"
                  value={stkPhone}
                  onChange={(e) => setStkPhone(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label>Amount (UGX)</Label>
                <Input
                  type="number"
                  placeholder="0"
                  value={stkAmount}
                  onChange={(e) => setStkAmount(e.target.value)}
                />
              </div>
            </div>
          )}

          {(stkStatus === "initiating" || stkStatus === "polling") && (
            <div className="flex flex-col items-center py-6">
              <Loader2 className="w-12 h-12 text-brand-600 animate-spin mb-4" />
              <p className="text-sm text-center">{stkMessage}</p>
              {stkStatus === "polling" && (
                <p className="text-xs text-heading mt-2">Checking every 3 seconds...</p>
              )}
            </div>
          )}

          {stkStatus === "success" && (
            <div className="flex flex-col items-center py-6">
              <CheckCircle2 className="w-12 h-12 text-success-600 mb-4" />
              <p className="text-sm text-center font-medium text-success-700">{stkMessage}</p>
            </div>
          )}

          {stkStatus === "timeout" && (
            <div className="flex flex-col items-center py-6">
              <Clock className="w-12 h-12 text-warning-600 mb-4" />
              <p className="text-sm text-center">{stkMessage}</p>
            </div>
          )}

          {stkStatus === "error" && (
            <div className="flex flex-col items-center py-6">
              <XCircle className="w-12 h-12 text-danger-600 mb-4" />
              <p className="text-sm text-center text-danger-700">{stkMessage}</p>
            </div>
          )}

          <AlertDialogFooter>
            {stkStatus === "idle" && (
              <>
                <Button variant="ghost" onClick={resetStkPush}>Cancel</Button>
                <Button onClick={initiateStkPush} disabled={!stkPhone || !stkAmount}>
                  <Smartphone className="w-4 h-4 mr-2" />
                  Send STK Push
                </Button>
              </>
            )}
            {(stkStatus === "initiating" || stkStatus === "polling") && (
              <Button variant="ghost" onClick={resetStkPush}>Cancel</Button>
            )}
            {stkStatus === "success" && (
              <Button onClick={resetStkPush}>Done</Button>
            )}
            {stkStatus === "timeout" && (
              <>
                <Button variant="ghost" onClick={resetStkPush}>Close</Button>
                <Button onClick={() => setStkStatus("idle")}>Retry</Button>
              </>
            )}
            {stkStatus === "error" && (
              <>
                <Button variant="ghost" onClick={resetStkPush}>Close</Button>
                <Button onClick={() => setStkStatus("idle")}>Retry</Button>
              </>
            )}
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Apply Discount Dialog */}
      {selectedStudent && (
        <ApplyDiscountDialog
          open={discountOpen}
          onOpenChange={setDiscountOpen}
          studentId={selectedStudent.id}
          studentName={selectedStudent.name}
          currentTermId={currentTerm?.id || ""}
        />
      )}
    </motion.div>
  );
}

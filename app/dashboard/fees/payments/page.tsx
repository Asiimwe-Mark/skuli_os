"use client";

import { useState, useMemo } from "react";
import { motion } from "framer-motion";
import { useQuery } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import { useSchoolStore } from "@/store/school";
import { formatUGX } from "@/lib/utils/currency";
import { formatDate } from "@/lib/utils/dates";
import { cn } from "@/lib/utils/cn";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/shared/empty-state";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Wallet,
  Search,
  CreditCard,
  Eye,
  Smartphone,
  Banknote,
  Building2,
  Gift,
  Receipt,
  ChevronLeft,
  ChevronRight,
  CheckCircle2,
  Clock,
  XCircle,
} from "lucide-react";
import Link from "next/link";

interface PaymentRow {
  id: string;
  amount: number;
  payment_method: string;
  mobile_money_provider: string | null;
  mobile_money_transaction_id: string | null;
  phone_used: string | null;
  payment_date: string;
  receipt_number: string;
  status: string;
  notes: string | null;
  created_at: string;
  student: {
    id: string;
    full_name: string;
    admission_number: string;
    current_class: { name: string } | null;
  } | null;
  received_by: { full_name: string } | null;
  fee_account: {
    total_expected: number;
    total_paid: number;
    balance: number;
  } | null;
}

const methodIcons: Record<string, React.ElementType> = {
  mobile_money: Smartphone,
  cash: Banknote,
  bank: Building2,
  waiver: Gift,
};

const methodLabels: Record<string, string> = {
  mobile_money: "Mobile Money",
  cash: "Cash",
  bank: "Bank Transfer",
  waiver: "Waiver",
};

const providerLabels: Record<string, string> = {
  mtn: "MTN Mobile Money",
  airtel: "Airtel Money",
};

const statusConfig: Record<
  string,
  { label: string; variant: "success" | "warning" | "destructive"; icon: React.ElementType }
> = {
  confirmed: { label: "Confirmed", variant: "success", icon: CheckCircle2 },
  pending: { label: "Pending", variant: "warning", icon: Clock },
  failed: { label: "Failed", variant: "destructive", icon: XCircle },
};

const PAGE_SIZE = 20;

export default function AllPaymentsPage() {
  const school = useSchoolStore((s) => s.school);
  const currentTerm = useSchoolStore((s) => s.currentTerm);
  const supabase = createClient();

  const [search, setSearch] = useState("");
  const [filterMethod, setFilterMethod] = useState("all");
  const [filterStatus, setFilterStatus] = useState("all");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [page, setPage] = useState(0);
  const [selectedPayment, setSelectedPayment] = useState<PaymentRow | null>(null);
  const [receiptModalOpen, setReceiptModalOpen] = useState(false);

  // ── Query ────────────────────────────────────────────────────────────

  const { data, isLoading } = useQuery({
    queryKey: [
      "fee-payments-all",
      school?.id,
      currentTerm?.id,
      page,
      filterMethod,
      filterStatus,
      dateFrom,
      dateTo,
    ],
    queryFn: async () => {
      let query = supabase
        .from("fee_payments")
        .select(
          `id, amount, payment_method, mobile_money_provider, mobile_money_transaction_id,
           phone_used, payment_date, receipt_number, status, notes, created_at,
           student:students(id, full_name, admission_number, current_class:classes(name)),
           received_by:users!received_by_user_id(full_name),
           fee_account:fee_accounts!fee_account_id(total_expected, total_paid, balance)`,
          { count: "exact" }
        )
        .eq("school_id", school!.id)
        .eq("is_deleted", false)
        .order("created_at", { ascending: false })
        .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1);

      if (currentTerm?.id) {
        const { data: termAccounts } = await supabase
          .from("fee_accounts")
          .select("id")
          .eq("term_id", currentTerm.id)
          .eq("school_id", school!.id);
        const accountIds = (termAccounts ?? []).map((a: { id: string }) => a.id);
        if (accountIds.length > 0) {
          query = query.in("fee_account_id", accountIds);
        }
      }
      if (filterMethod !== "all") query = query.eq("payment_method", filterMethod);
      if (filterStatus !== "all") query = query.eq("status", filterStatus);
      if (dateFrom) query = query.gte("payment_date", dateFrom);
      if (dateTo) query = query.lte("payment_date", dateTo);

      const { data, count, error } = await query;
      if (error) throw error;

      const rows = ((data ?? []) as any[]).map((p) => ({
        ...p,
        student: Array.isArray(p.student) ? p.student[0] : p.student,
        received_by: Array.isArray(p.received_by) ? p.received_by[0] : p.received_by,
        fee_account: Array.isArray(p.fee_account) ? p.fee_account[0] : p.fee_account,
      })) as PaymentRow[];

      return { rows, total: count ?? 0 };
    },
    enabled: !!school?.id,
  });

  const payments = data?.rows ?? [];
  const totalCount = data?.total ?? 0;
  const totalPages = Math.ceil(totalCount / PAGE_SIZE);

  // ── Client-side search on current page ───────────────────────────────

  const filtered = useMemo(() => {
    if (!search) return payments;
    const q = search.toLowerCase();
    return payments.filter(
      (p) =>
        p.receipt_number?.toLowerCase().includes(q) ||
        p.student?.full_name?.toLowerCase().includes(q) ||
        p.student?.admission_number?.toLowerCase().includes(q)
    );
  }, [payments, search]);

  function clearFilters() {
    setSearch("");
    setFilterMethod("all");
    setFilterStatus("all");
    setDateFrom("");
    setDateTo("");
    setPage(0);
  }

  const hasActiveFilters =
    search || filterMethod !== "all" || filterStatus !== "all" || dateFrom || dateTo;

  // ── Render ───────────────────────────────────────────────────────────

  if (isLoading && !data) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <Skeleton className="h-8 w-48" />
          <Skeleton className="h-10 w-40" />
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
          <h1 className="text-2xl font-bold font-display">All Payments</h1>
          <p className="text-sm text-gray-400">
            {totalCount} payment{totalCount !== 1 ? "s" : ""} recorded
          </p>
        </div>
        <Link href="/dashboard/fees/payments/new">
          <Button>
            <CreditCard className="w-4 h-4 mr-2" />
            Record Payment
          </Button>
        </Link>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3 flex-wrap">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
          <Input
            placeholder="Search receipt no. or student..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-10"
          />
        </div>
        <div className="flex gap-2">
          <Input
            type="date"
            value={dateFrom}
            onChange={(e) => {
              setDateFrom(e.target.value);
              setPage(0);
            }}
            className="w-[150px]"
          />
          <Input
            type="date"
            value={dateTo}
            onChange={(e) => {
              setDateTo(e.target.value);
              setPage(0);
            }}
            className="w-[150px]"
          />
        </div>
        <Select
          value={filterMethod}
          onValueChange={(v) => {
            setFilterMethod(v);
            setPage(0);
          }}
        >
          <SelectTrigger className="w-[160px]">
            <SelectValue placeholder="All Methods" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Methods</SelectItem>
            <SelectItem value="mobile_money">Mobile Money</SelectItem>
            <SelectItem value="cash">Cash</SelectItem>
            <SelectItem value="bank">Bank Transfer</SelectItem>
            <SelectItem value="waiver">Waiver</SelectItem>
          </SelectContent>
        </Select>
        <Select
          value={filterStatus}
          onValueChange={(v) => {
            setFilterStatus(v);
            setPage(0);
          }}
        >
          <SelectTrigger className="w-[160px]">
            <SelectValue placeholder="All Statuses" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Statuses</SelectItem>
            <SelectItem value="confirmed">Confirmed</SelectItem>
            <SelectItem value="pending">Pending</SelectItem>
            <SelectItem value="failed">Failed</SelectItem>
          </SelectContent>
        </Select>
        {hasActiveFilters && (
          <Button variant="ghost" size="sm" onClick={clearFilters}>
            Clear filters
          </Button>
        )}
      </div>

      {/* Table */}
      <div className="bg-navy-800 border border-navy-700 rounded-xl overflow-hidden">
        {filtered.length === 0 ? (
          <EmptyState
            icon={Receipt}
            title="No payments found"
            description={
              totalCount === 0
                ? "No payments have been recorded yet"
                : "Try adjusting your filters"
            }
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-navy-700">
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-400 uppercase">
                    Receipt No.
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-400 uppercase">
                    Student
                  </th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-400 uppercase">
                    Amount
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-400 uppercase">
                    Method
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-400 uppercase">
                    Date
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-400 uppercase">
                    Status
                  </th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-400 uppercase">
                    Action
                  </th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((payment, i) => {
                  const MethodIcon =
                    methodIcons[payment.payment_method] || Receipt;
                  const status =
                    statusConfig[payment.status] || statusConfig.confirmed;
                  const StatusIcon = status.icon;
                  return (
                    <motion.tr
                      key={payment.id}
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      transition={{ delay: i * 0.02 }}
                      className="border-b border-navy-700/50 hover:bg-navy-700/30 transition-colors"
                    >
                      <td className="px-4 py-3">
                        <span className="text-sm font-mono font-medium text-amber-400">
                          {payment.receipt_number}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <p className="text-sm font-medium">
                          {payment.student?.full_name || "Unknown"}
                        </p>
                        <p className="text-xs text-gray-500">
                          {payment.student?.admission_number}
                        </p>
                      </td>
                      <td className="px-4 py-3 text-sm text-right font-semibold text-emerald-400">
                        {formatUGX(payment.amount)}
                      </td>
                      <td className="px-4 py-3">
                        <Badge variant="secondary" className="text-xs">
                          <MethodIcon className="w-3 h-3 mr-1" />
                          {methodLabels[payment.payment_method] ||
                            payment.payment_method}
                        </Badge>
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-400">
                        {formatDate(payment.payment_date)}
                      </td>
                      <td className="px-4 py-3">
                        <Badge variant={status.variant} className="text-xs">
                          <StatusIcon className="w-3 h-3 mr-1" />
                          {status.label}
                        </Badge>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => {
                            setSelectedPayment(payment);
                            setReceiptModalOpen(true);
                          }}
                        >
                          <Eye className="w-4 h-4" />
                        </Button>
                      </td>
                    </motion.tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-navy-700/50">
            <p className="text-xs text-gray-500">
              Page {page + 1} of {totalPages} ({totalCount} total)
            </p>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                disabled={page === 0}
                onClick={() => setPage((p) => Math.max(0, p - 1))}
              >
                <ChevronLeft className="w-4 h-4" />
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={page >= totalPages - 1}
                onClick={() => setPage((p) => p + 1)}
              >
                <ChevronRight className="w-4 h-4" />
              </Button>
            </div>
          </div>
        )}
      </div>

      {/* Receipt Modal */}
      <Dialog open={receiptModalOpen} onOpenChange={setReceiptModalOpen}>
        <DialogContent className="max-w-md">
          {selectedPayment && (
            <div className="space-y-6">
              <div className="text-center border-b border-navy-700 pb-4">
                {school?.logo_url && (
                  <img
                    src={school.logo_url}
                    alt=""
                    className="w-16 h-16 mx-auto mb-2 rounded-full"
                  />
                )}
                <h2 className="text-lg font-bold">
                  {school?.name || "School Name"}
                </h2>
                {school?.address && (
                  <p className="text-xs text-gray-400">{school.address}</p>
                )}
              </div>

              <div className="text-center">
                <h3 className="text-sm font-semibold text-amber-400 uppercase tracking-wider">
                  Payment Receipt
                </h3>
                <p className="text-2xl font-bold font-mono mt-1">
                  {selectedPayment.receipt_number}
                </p>
              </div>

              <div className="bg-navy-900 rounded-lg p-4 space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-gray-400">Student</span>
                  <span className="font-medium">
                    {selectedPayment.student?.full_name}
                  </span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-400">Admission No.</span>
                  <span className="font-mono">
                    {selectedPayment.student?.admission_number}
                  </span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-400">Class</span>
                  <span>
                    {selectedPayment.student?.current_class?.name || "\u2014"}
                  </span>
                </div>
              </div>

              <div className="space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-gray-400">Amount Paid</span>
                  <span className="text-lg font-bold text-emerald-400">
                    {formatUGX(selectedPayment.amount)}
                  </span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-400">Method</span>
                  <span>
                    {methodLabels[selectedPayment.payment_method]}
                  </span>
                </div>
                {selectedPayment.payment_method === "mobile_money" && (
                  <>
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-400">Provider</span>
                      <span>
                        {providerLabels[
                          selectedPayment.mobile_money_provider || ""
                        ] || "\u2014"}
                      </span>
                    </div>
                    {selectedPayment.mobile_money_transaction_id && (
                      <div className="flex justify-between text-sm">
                        <span className="text-gray-400">Transaction ID</span>
                        <span className="font-mono">
                          {selectedPayment.mobile_money_transaction_id}
                        </span>
                      </div>
                    )}
                  </>
                )}
                <div className="flex justify-between text-sm">
                  <span className="text-gray-400">Date</span>
                  <span>{formatDate(selectedPayment.payment_date)}</span>
                </div>
              </div>

              {selectedPayment.fee_account && (
                <div className="bg-navy-900 rounded-lg p-4 space-y-2">
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-400">Total Expected</span>
                    <span>
                      {formatUGX(selectedPayment.fee_account.total_expected)}
                    </span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-400">Total Paid</span>
                    <span className="text-emerald-400">
                      {formatUGX(selectedPayment.fee_account.total_paid)}
                    </span>
                  </div>
                  <div className="flex justify-between text-sm font-bold border-t border-navy-700 pt-2">
                    <span>Balance</span>
                    <span
                      className={
                        selectedPayment.fee_account.balance > 0
                          ? "text-rose-400"
                          : "text-emerald-400"
                      }
                    >
                      {formatUGX(
                        Math.abs(selectedPayment.fee_account.balance)
                      )}
                    </span>
                  </div>
                </div>
              )}

              {selectedPayment.received_by && (
                <div className="flex justify-between text-sm">
                  <span className="text-gray-400">Received By</span>
                  <span>{selectedPayment.received_by.full_name}</span>
                </div>
              )}

              <div className="text-center text-xs text-gray-500 pt-4 border-t border-navy-700">
                <p>Generated by SKULI School Management System</p>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </motion.div>
  );
}

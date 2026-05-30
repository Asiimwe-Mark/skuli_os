"use client";

import { useState, useMemo, useRef } from "react";
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
import { useToast } from "@/components/ui/use-toast";
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
} from "@/components/ui/dialog";
import { pdf } from "@react-pdf/renderer";
import { saveAs } from "file-saver";
import { QRCodeSVG as QRCode } from "qrcode.react";
import { ReceiptPDF } from "@/lib/pdf/receipt";
import {
  Receipt,
  Search,
  Printer,
  Download,
  Eye,
  Smartphone,
  Banknote,
  Building2,
  Gift,
} from "lucide-react";

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

export default function ReceiptsPage() {
  const school = useSchoolStore((s) => s.school);
  const currentTerm = useSchoolStore((s) => s.currentTerm);
  const { toast } = useToast();
  const supabase = createClient();

  const [search, setSearch] = useState("");
  const [filterClass, setFilterClass] = useState("all");
  const [filterMethod, setFilterMethod] = useState("all");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [selectedPayment, setSelectedPayment] = useState<PaymentRow | null>(null);
  const [receiptModalOpen, setReceiptModalOpen] = useState(false);

  // ── Queries ──────────────────────────────────────────────────────────

  const { data: payments = [], isLoading } = useQuery({
    queryKey: ["fee-receipts", school?.id, currentTerm?.id],
    queryFn: async () => {
      let query = supabase
        .from("fee_payments")
        .select(
          `id, amount, payment_method, mobile_money_provider, mobile_money_transaction_id,
           phone_used, payment_date, receipt_number, status, notes, created_at,
           student:students(id, full_name, admission_number, current_class:classes(name)),
           received_by:users!received_by_user_id(full_name),
           fee_account:fee_accounts!fee_account_id(total_expected, total_paid, balance)`
        )
        .eq("school_id", school!.id)
        .eq("is_deleted", false)
        .order("created_at", { ascending: false });

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

      const { data, error } = await query;
      if (error) throw error;
      return ((data ?? []) as any[]).map((p) => ({
        ...p,
        student: Array.isArray(p.student) ? p.student[0] : p.student,
        received_by: Array.isArray(p.received_by) ? p.received_by[0] : p.received_by,
        fee_account: Array.isArray(p.fee_account) ? p.fee_account[0] : p.fee_account,
      })) as PaymentRow[];
    },
    enabled: !!school?.id,
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

  // ── Filtering ────────────────────────────────────────────────────────

  const filtered = useMemo(() => {
    let result = [...payments];
    if (search) {
      const q = search.toLowerCase();
      result = result.filter(
        (p) =>
          p.receipt_number?.toLowerCase().includes(q) ||
          p.student?.full_name?.toLowerCase().includes(q) ||
          p.student?.admission_number?.toLowerCase().includes(q)
      );
    }
    if (filterClass !== "all") {
      result = result.filter((p) => p.student?.current_class?.name === filterClass);
    }
    if (filterMethod !== "all") {
      result = result.filter((p) => p.payment_method === filterMethod);
    }
    if (dateFrom) result = result.filter((p) => p.payment_date >= dateFrom);
    if (dateTo) result = result.filter((p) => p.payment_date <= dateTo);
    return result;
  }, [payments, search, filterClass, filterMethod, dateFrom, dateTo]);

  // ── Export ───────────────────────────────────────────────────────────

  function handleExportCSV() {
    const headers = ["Receipt No", "Student", "Admission No", "Class", "Amount", "Method", "Date", "Status"];
    const rows = filtered.map((p) => [
      p.receipt_number,
      p.student?.full_name || "",
      p.student?.admission_number || "",
      p.student?.current_class?.name || "",
      String(p.amount),
      methodLabels[p.payment_method] || p.payment_method,
      p.payment_date,
      p.status,
    ]);
    const csv = [headers, ...rows].map((r) => r.map((c) => `"${c}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `receipts-${new Date().toISOString().split("T")[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  // ── Render ───────────────────────────────────────────────────────────

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-48" />
        <div className="flex gap-3">
          <Skeleton className="h-10 flex-1" />
          <Skeleton className="h-10 w-[180px]" />
          <Skeleton className="h-10 w-[160px]" />
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
          <h1 className="text-2xl font-bold font-display">Receipts</h1>
          <p className="text-sm text-gray-400">
            {filtered.length} payment receipt{filtered.length !== 1 ? "s" : ""}
          </p>
        </div>
        <Button variant="outline" onClick={handleExportCSV}>
          <Download className="w-4 h-4 mr-2" />
          Export CSV
        </Button>
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
            onChange={(e) => setDateFrom(e.target.value)}
            className="w-[150px]"
            placeholder="From"
          />
          <Input
            type="date"
            value={dateTo}
            onChange={(e) => setDateTo(e.target.value)}
            className="w-[150px]"
            placeholder="To"
          />
        </div>
        <Select value={filterClass} onValueChange={setFilterClass}>
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder="All Classes" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Classes</SelectItem>
            {classes.map((c) => (
              <SelectItem key={c.id} value={c.name}>
                {c.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={filterMethod} onValueChange={setFilterMethod}>
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
      </div>

      {/* Table */}
      <div className="bg-navy-800 border border-navy-700 rounded-xl overflow-hidden">
        {filtered.length === 0 ? (
          <EmptyState
            icon={Receipt}
            title="No receipts found"
            description={
              payments.length === 0
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
                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-400 uppercase">
                    Action
                  </th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((payment, i) => {
                  const MethodIcon = methodIcons[payment.payment_method] || Receipt;
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
                          {methodLabels[payment.payment_method] || payment.payment_method}
                        </Badge>
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-400">
                        {formatDate(payment.payment_date)}
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
                          <Eye className="w-4 h-4 mr-1" />
                          View
                        </Button>
                      </td>
                    </motion.tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        <div className="px-4 py-3 border-t border-navy-700/50">
          <p className="text-xs text-gray-500">
            Showing {filtered.length} of {payments.length} receipts
          </p>
        </div>
      </div>

      {/* Receipt Modal */}
      <Dialog open={receiptModalOpen} onOpenChange={setReceiptModalOpen}>
        <DialogContent className="max-w-md print:max-w-full print:shadow-none print:border-0">
          {selectedPayment && (
            <div id="receipt-content" className="space-y-6 print:text-black">
              {/* School Header */}
              <div className="text-center border-b border-navy-700 print:border-gray-300 pb-4">
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
                  <p className="text-xs text-gray-400 print:text-gray-600">
                    {school.address}
                  </p>
                )}
                {school?.phone && (
                  <p className="text-xs text-gray-400 print:text-gray-600">
                    {school.phone}
                  </p>
                )}
              </div>

              {/* Receipt Title */}
              <div className="text-center">
                <h3 className="text-sm font-semibold text-amber-400 print:text-amber-700 uppercase tracking-wider">
                  Payment Receipt
                </h3>
                <p className="text-2xl font-bold font-mono mt-1">
                  {selectedPayment.receipt_number}
                </p>
              </div>

              {/* Student Info */}
              <div className="bg-navy-900 print:bg-gray-50 rounded-lg p-4 space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-gray-400 print:text-gray-600">Student Name</span>
                  <span className="font-medium">
                    {selectedPayment.student?.full_name}
                  </span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-400 print:text-gray-600">Admission No.</span>
                  <span className="font-mono">
                    {selectedPayment.student?.admission_number}
                  </span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-400 print:text-gray-600">Class</span>
                  <span>
                    {selectedPayment.student?.current_class?.name || "\u2014"}
                  </span>
                </div>
              </div>

              {/* Payment Details */}
              <div className="space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-gray-400 print:text-gray-600">Amount Paid</span>
                  <span className="text-lg font-bold text-emerald-400 print:text-emerald-700">
                    {formatUGX(selectedPayment.amount)}
                  </span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-400 print:text-gray-600">Payment Method</span>
                  <span>{methodLabels[selectedPayment.payment_method]}</span>
                </div>
                {selectedPayment.payment_method === "mobile_money" && (
                  <>
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-400 print:text-gray-600">Provider</span>
                      <span>
                        {providerLabels[selectedPayment.mobile_money_provider || ""] || "\u2014"}
                      </span>
                    </div>
                    {selectedPayment.mobile_money_transaction_id && (
                      <div className="flex justify-between text-sm">
                        <span className="text-gray-400 print:text-gray-600">Transaction ID</span>
                        <span className="font-mono">
                          {selectedPayment.mobile_money_transaction_id}
                        </span>
                      </div>
                    )}
                    {selectedPayment.phone_used && (
                      <div className="flex justify-between text-sm">
                        <span className="text-gray-400 print:text-gray-600">Phone</span>
                        <span className="font-mono">{selectedPayment.phone_used}</span>
                      </div>
                    )}
                  </>
                )}
                <div className="flex justify-between text-sm">
                  <span className="text-gray-400 print:text-gray-600">Date</span>
                  <span>{formatDate(selectedPayment.payment_date)}</span>
                </div>
              </div>

              {/* Balance */}
              {selectedPayment.fee_account && (
                <div className="bg-navy-900 print:bg-gray-50 rounded-lg p-4 space-y-2">
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-400 print:text-gray-600">Total Expected</span>
                    <span>
                      {formatUGX(selectedPayment.fee_account.total_expected)}
                    </span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-400 print:text-gray-600">Total Paid</span>
                    <span className="text-emerald-400 print:text-emerald-700">
                      {formatUGX(selectedPayment.fee_account.total_paid)}
                    </span>
                  </div>
                  <div className="flex justify-between text-sm font-bold border-t border-navy-700 print:border-gray-300 pt-2">
                    <span>Balance</span>
                    <span
                      className={
                        selectedPayment.fee_account.balance > 0
                          ? "text-rose-400 print:text-rose-700"
                          : "text-emerald-400 print:text-emerald-700"
                      }
                    >
                      {formatUGX(Math.abs(selectedPayment.fee_account.balance))}
                      {selectedPayment.fee_account.balance < 0 && " (overpaid)"}
                    </span>
                  </div>
                </div>
              )}

              {/* Received By */}
              {selectedPayment.received_by && (
                <div className="flex justify-between text-sm">
                  <span className="text-gray-400 print:text-gray-600">Received By</span>
                  <span>{selectedPayment.received_by.full_name}</span>
                </div>
              )}

              {/* Notes */}
              {selectedPayment.notes && (
                <div className="text-sm">
                  <span className="text-gray-400 print:text-gray-600">Notes: </span>
                  <span>{selectedPayment.notes}</span>
                </div>
              )}

              {/* QR Code */}
              <div className="flex justify-center pt-2">
                <div className="text-center">
                  <QRCode
                    value={`${typeof window !== "undefined" ? window.location.origin : ""}/verify-receipt/${selectedPayment.receipt_number}`}
                    size={80}
                    level="M"
                    fgColor="#F5A623"
                    bgColor="transparent"
                  />
                  <p className="text-[10px] text-gray-500 mt-1">Scan to verify</p>
                </div>
              </div>

              {/* Footer */}
              <div className="text-center text-xs text-gray-500 print:text-gray-400 pt-4 border-t border-navy-700 print:border-gray-300">
                <p>Thank you for your payment</p>
                <p className="mt-1">Generated by SKULI School Management System</p>
              </div>

              {/* Actions (hidden on print) */}
              <div className="flex gap-3 print:hidden">
                <Button
                  variant="outline"
                  className="flex-1"
                  onClick={() => window.print()}
                >
                  <Printer className="w-4 h-4 mr-2" />
                  Print Receipt
                </Button>
                <Button
                  className="flex-1"
                  onClick={async () => {
                    try {
                      // Generate QR code as data URL for PDF
                      const qrValue = `${window.location.origin}/verify-receipt/${selectedPayment.receipt_number}`;
                      let qrDataUrl: string | undefined;
                      try {
                        const canvas = document.createElement("canvas");
                        canvas.width = 120;
                        canvas.height = 120;
                        const ctx = canvas.getContext("2d")!;
                        // Render QRCode SVG to canvas via offscreen div
                        const svg = document.querySelector("#receipt-content svg");
                        if (svg) {
                          const svgData = new XMLSerializer().serializeToString(svg);
                          const img = new Image();
                          img.src = "data:image/svg+xml;base64," + btoa(svgData);
                          await new Promise((resolve) => { img.onload = resolve; });
                          ctx.drawImage(img, 0, 0, 120, 120);
                          qrDataUrl = canvas.toDataURL("image/png");
                        }
                      } catch {
                        // QR generation for PDF is optional
                      }

                      const blob = await pdf(
                        <ReceiptPDF
                          school={{
                            name: school?.name || "School",
                            address: school?.address || undefined,
                            motto: school?.motto || undefined,
                            logo_url: school?.logo_url || undefined,
                            phone: school?.phone || undefined,
                          }}
                          student={{
                            full_name: selectedPayment.student?.full_name || "Student",
                            admission_number: selectedPayment.student?.admission_number || "N/A",
                            current_class: selectedPayment.student?.current_class?.name,
                          }}
                          payment={{
                            receipt_number: selectedPayment.receipt_number,
                            amount: selectedPayment.amount,
                            payment_method: selectedPayment.payment_method,
                            payment_date: selectedPayment.payment_date,
                            mobile_money_transaction_id: selectedPayment.mobile_money_transaction_id || undefined,
                            notes: selectedPayment.notes || undefined,
                          }}
                          balance={selectedPayment.fee_account?.balance ?? 0}
                          received_by={selectedPayment.received_by?.full_name || "Staff"}
                          qrDataUrl={qrDataUrl}
                        />
                      ).toBlob();
                      if (blob) saveAs(blob, `receipt-${selectedPayment.receipt_number}.pdf`);
                    } catch {
                      toast({ title: "PDF generation failed", variant: "destructive" });
                    }
                  }}
                >
                  <Download className="w-4 h-4 mr-2" />
                  Download PDF
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Print styles */}
      <style jsx global>{`
        @media print {
          /* Hide everything except receipt */
          body > div,
          body > nav,
          body > header,
          body > aside,
          [data-radix-portal],
          .fixed {
            display: none !important;
          }
          body * {
            visibility: hidden;
          }
          #receipt-content,
          #receipt-content * {
            visibility: visible;
          }
          #receipt-content {
            position: absolute;
            left: 0;
            top: 0;
            width: 100%;
            max-width: 100%;
            padding: 2rem;
            background: white !important;
            color: black !important;
          }
          #receipt-content .text-amber-400 { color: #92400e !important; }
          #receipt-content .text-emerald-400 { color: #047857 !important; }
          #receipt-content .text-rose-400 { color: #be123c !important; }
          #receipt-content .text-gray-400,
          #receipt-content .text-gray-500 { color: #6b7280 !important; }
          #receipt-content .bg-navy-900 { background-color: #f3f4f6 !important; }
          #receipt-content .border-navy-700 { border-color: #d1d5db !important; }
          #receipt-content .print\\:hidden { display: none !important; }

          /* Hide the dialog overlay and portal */
          [data-state="open"] {
            position: static !important;
            background: none !important;
            backdrop-filter: none !important;
          }
        }
      `}</style>
    </motion.div>
  );
}

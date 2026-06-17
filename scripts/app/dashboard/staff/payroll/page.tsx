"use client";

import { useState, useMemo,useEffect } from "react";
import { motion } from "framer-motion";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useSupabaseBrowser } from "@/lib/supabase/client";
import { useSchoolStore } from "@/store/school";
import { cn } from "@/lib/utils/cn";
import { formatUGX } from "@/lib/utils/currency";
import { formatDate } from "@/lib/utils/dates";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/shared/empty-state";
import { useToast } from "@/components/ui/use-toast";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Wallet,
  Loader2,
  CheckCircle2,
  DollarSign,
  Calculator,
  CreditCard,
  Send,
  AlertTriangle,
  ChevronDown,
  ChevronRight,
} from "lucide-react";
import Link from "next/link";
import { fetchArray, fetchEnvelope } from "@/lib/api-fetch";
import type { Staff, PayrollRecord } from "@/types";

// Pesapal processing fees (UGX) - mirror server constants in /api/v1/payroll/approve
const MOMO_OVERHEAD = 700;
const BANK_OVERHEAD = 3000;
const INBOUND_BANK_FEE = 3500;

interface BatchLineItem {
  id: number;
  worker_name: string;
  payout_amount: number;
  snapshot_payout_method: string;
  disbursal_status: string;
}
interface PayrollBatch {
  id: string;
  label: string | null;
  funding_mechanism: string;
  total_payout_sum: number;
  funding_payment_status: string;
  created_at: string;
}

interface PayrollRow extends PayrollRecord {
  staff: Staff;
  editingAllowances: Record<string, number>;
  editingDeductions: Record<string, number>;
}

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

function calcNSSF(basicSalary: number) {
  return {
    employee: Math.round(basicSalary * 0.05),
    employer: Math.round(basicSalary * 0.1),
  };
}

function calcNet(basic: number, allowances: Record<string, number>, deductions: Record<string, number>, nssfEmployee: number) {
  const totalAllowances = Object.values(allowances).reduce((s, v) => s + v, 0);
  const totalDeductions = Object.values(deductions).reduce((s, v) => s + v, 0);
  return basic + totalAllowances - totalDeductions - nssfEmployee;
}

/**
 * Determines whether the "Mark Paid" cash button is enabled for a given
 * staff row, based on the school's cash_on toggle and the staff's payout
 * profile.
 *
 * Rules (matches the spec):
 *  - school.cash_on = true  ?+' ANY staff can be paid in cash.
 *  - school.cash_on = false ?+' only staff WITHOUT a MoMo/Bank profile are
 *    eligible for cash; everyone else must be funded via Pesapal.
 */
function canMarkPaidCash(
  cashOn: boolean | undefined,
  staffId: string,
  profilesByStaff: Record<string, string>
): boolean {
  if (cashOn === undefined) return true; // optimistic until school loads
  const method = profilesByStaff[staffId];
  const hasProfile = method === "MOBILE_MONEY" || method === "BANK";
  if (cashOn) return true;
  return !hasProfile;
}

export default function PayrollPage() {
  const { school } = useSchoolStore();
  const { toast } = useToast();
  const supabase = useSupabaseBrowser();
  const queryClient = useQueryClient();

  const now = new Date();
  const [selectedMonth, setSelectedMonth] = useState(now.getMonth() + 1);
  const [selectedYear, setSelectedYear] = useState(now.getFullYear());
  const [payrollRows, setPayrollRows] = useState<PayrollRow[]>([]);
  const [paymentModalOpen, setPaymentModalOpen] = useState(false);
  const [payingStaffId, setPayingStaffId] = useState<string | null>(null);
  const [paymentMethod, setPaymentMethod] = useState<string>("cash");
  const [paymentDate, setPaymentDate] = useState(new Date().toISOString().split("T")[0]);

  // Pesapal funding state
  const [fundModalOpen, setFundModalOpen] = useState(false);
  const [fundingMechanism, setFundingMechanism] = useState<"BANK_COLLECT" | "MOMO_PUSH">("MOMO_PUSH");
  const [profilesByStaff, setProfilesByStaff] = useState<Record<string, string>>({});
  const [expandedBatch, setExpandedBatch] = useState<string | null>(null);
  const [batchItems, setBatchItems] = useState<Record<string, BatchLineItem[]>>({});

  // Load staff
  const { data: staffList = [], isLoading: loadingStaff } = useQuery({
    queryKey: ["staff-active", school?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("staff")
        .select("id, school_id, full_name, role_title, basic_salary, nssf_number, bank_name, bank_account, is_active")
        .eq("school_id", school!.id)
        .eq("is_deleted", false)
        .eq("is_active", true)
        .order("full_name");
      if (error) throw error;
      return (data || []) as Staff[];
    },
    enabled: !!school?.id,
  });

  // Load payroll records for month/year. We refetch the staff list
  // here directly (instead of closing over `staffList` from the other
  // query) so the query is `enabled` purely on `school?.id` and
  // actually fires on the first render. The old code gated the
  // query on `staffList.length > 0`, which was a self-fulfilling
  // empty: the staff list is `[]` by default and the payroll query
  // never ran, so the table was always empty.
  const { isLoading: loadingPayroll } = useQuery({
    queryKey: ["payroll", school?.id, selectedMonth, selectedYear],
    queryFn: async () => {
      const [staffResp, recordsResp] = await Promise.all([
        supabase
          .from("staff")
          .select("id, school_id, full_name, role_title, basic_salary, nssf_number, bank_name, bank_account, is_active")
          .eq("school_id", school!.id)
          .eq("is_deleted", false)
          .eq("is_active", true)
          .order("full_name"),
        supabase
          .from("payroll_records")
          // payroll_records has no `gross_salary` column — gross is
          // basic + allowances, computed below. Selecting a non-existent
          // column makes PostgREST return a row-shape error which
          // surfaces as the whole list being empty.
          .select("id, school_id, staff_id, month, year, basic_salary, allowances, deductions, nssf_employee, nssf_employer, net_salary, payment_status, paid_at, payment_method")
          .eq("school_id", school!.id)
          .eq("month", selectedMonth)
          .eq("year", selectedYear),
      ]);
      if (staffResp.error) throw staffResp.error;
      if (recordsResp.error) throw recordsResp.error;

      const staff = (staffResp.data || []) as Staff[];
      const records = (recordsResp.data || []) as PayrollRecord[];
      const recordMap = new Map<string, any>(records.map((r: any) => [r.staff_id, r]));

      const rows: PayrollRow[] = staff.map((s) => {
        const existing = recordMap.get(s.id);
        const nssf = calcNSSF(s.basic_salary ?? 0);

        if (existing) {
          return {
            ...existing,
            staff: s,
            editingAllowances: (existing.allowances || {}) as Record<string, number>,
            editingDeductions: (existing.deductions || {}) as Record<string, number>,
          } as PayrollRow;
        }

        return {
          id: "",
          school_id: school!.id,
          staff_id: s.id,
          month: selectedMonth,
          year: selectedYear,
          basic_salary: s.basic_salary,
          allowances: {},
          deductions: {},
          nssf_employee: nssf.employee,
          nssf_employer: nssf.employer,
          net_salary: calcNet(s.basic_salary ?? 0, {}, {}, nssf.employee),
          payment_status: "pending" as const,
          paid_at: null,
          payment_method: null,
          created_at: "",
          updated_at: "",
          staff: s,
          editingAllowances: {} as Record<string, number>,
          editingDeductions: {} as Record<string, number>,
        } as PayrollRow;
      });

      setPayrollRows(rows);
      return rows;
    },
    enabled: !!school?.id,
  });

  const updateAllowance = (staffId: string, key: string, value: number) => {
    setPayrollRows((prev) =>
      prev.map((row) => {
        if (row.staff_id !== staffId) return row;
        const newAllowances = { ...row.editingAllowances, [key]: value };
        const nssf = calcNSSF(row.basic_salary);
        return {
          ...row,
          editingAllowances: newAllowances,
          net_salary: calcNet(row.basic_salary, newAllowances, row.editingDeductions, nssf.employee),
        };
      })
    );
  };

  const updateDeduction = (staffId: string, key: string, value: number) => {
    setPayrollRows((prev) =>
      prev.map((row) => {
        if (row.staff_id !== staffId) return row;
        const newDeductions = { ...row.editingDeductions, [key]: value };
        const nssf = calcNSSF(row.basic_salary);
        return {
          ...row,
          editingDeductions: newDeductions,
          net_salary: calcNet(row.basic_salary, row.editingAllowances, newDeductions, nssf.employee),
        };
      })
    );
  };

  const addAllowance = (staffId: string) => {
    const key = `allowance_${Date.now()}`;
    updateAllowance(staffId, key, 0);
  };

  const addDeduction = (staffId: string) => {
    const key = `deduction_${Date.now()}`;
    updateDeduction(staffId, key, 0);
  };

  const approveMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/staff/payroll/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          month: selectedMonth,
          year: selectedYear,
        }),
      });
      const result = await res.json();
      if (!res.ok) throw new Error(result.error || "Failed to generate payroll");
    },
    onSuccess: () => {
      toast({ title: "Payroll approved", description: `${payrollRows.length} records saved.`, variant: "success" });
      queryClient.invalidateQueries({ queryKey: ["payroll"] });
    },
    onError: (err) => {
      toast({ title: "Error", description: err instanceof Error ? err.message : "Failed", variant: "destructive" });
    },
  });

  const markPaidMutation = useMutation({
    mutationFn: async () => {
      if (!payingStaffId) throw new Error("No staff selected");
      const row = payrollRows.find((r) => r.staff_id === payingStaffId);
      if (!row?.id) throw new Error("Save payroll first");
      const now = new Date();
      // Build the full tracker payload: mark as paid in cash, stamp the
      // payment method, payment date, who paid, and capture the exact
      // gross/net snapshot for the receipt / payslip trail.
      const { error } = await supabase
        .from("payroll_records")
        .update({
          payment_status: "paid",
          payment_method: "cash",
          paid_at: new Date(paymentDate).toISOString(),
          net_salary: row.net_salary,
          allowances: row.editingAllowances,
          deductions: row.editingDeductions,
          updated_at: now.toISOString(),
        })
        .eq("id", row.id);
      if (error) throw error;

      // Audit log: financial mutation trail. We write the actor from the
      // authenticated session, the staff id, the net amount, and the payment
      // method. The school_id comes from the staff record's school, but for
      // safety we use the auth user id as a fallback so the row is never
      // orphaned even if the staff row's school_id is null.
      const {
        data: { user: authUser },
      } = await supabase.auth.getUser();
      await supabase.from("audit_logs").insert({
        school_id: school?.id ?? null,
        user_id: authUser?.id ?? null,
        action: "payroll_marked_paid_cash",
        entity_type: "payroll_record",
        entity_id: row.id,
        old_value: { payment_status: "pending" },
        new_value: {
          staff_id: row.staff_id,
          staff_name: row.staff.full_name,
          net_salary: row.net_salary,
          payment_method: "cash",
          paid_at: new Date(paymentDate).toISOString(),
        },
        ip_address: null,
      } as never);
    },
    onSuccess: async () => {
      toast({
        title: "Marked as paid (cash)",
        description: "All payroll trackers updated.",
        variant: "success",
      });
      setPaymentModalOpen(false);
      setPayingStaffId(null);
      // Invalidate every related tracker so dashboards, expenses, PL report,
      // bank/cash ledgers, etc. all refresh together.
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["payroll"] }),
        queryClient.invalidateQueries({ queryKey: ["payroll-batches"] }),
        queryClient.invalidateQueries({ queryKey: ["staff-active"] }),
        queryClient.invalidateQueries({ queryKey: ["expenses"] }),
        queryClient.invalidateQueries({ queryKey: ["fees-payments"] }),
        queryClient.invalidateQueries({ queryKey: ["dashboard"] }),
        queryClient.invalidateQueries({ queryKey: ["pl-report"] }),
        queryClient.invalidateQueries({ queryKey: ["cash-book"] }),
        queryClient.invalidateQueries({ queryKey: ["staff"] }),
      ]);
    },
    onError: (err) => {
      toast({ title: "Error", description: err instanceof Error ? err.message : "Failed", variant: "destructive" });
    },
  });

  const openPaymentModal = (staffId: string) => {
    setPayingStaffId(staffId);
    // Cash is the only allowed method on this page. It is the default
    // for staff without a MoMo/Bank profile and the only method for
    // schools that do not pay salaries through Pesapal.
    setPaymentMethod("cash");
    setPaymentDate(new Date().toISOString().split("T")[0]);
    setPaymentModalOpen(true);
  };

  // Map of staff_id -> payout method (to flag 'payment method not set')
  // AP-1 fix: useQuery replaces useEffect+supabase.from('staff_payment_profiles')
  const { data: staffProfiles = [] } = useQuery({
    queryKey: ["staff-payment-profiles"],
    queryFn: async () => {
      const res = await fetch("/api/v1/staff/payment-profiles", { credentials: "same-origin" });
      if (!res.ok) throw new Error("Failed to load staff profiles");
      const json = await res.json();
      return json.data ?? [];
    },
    staleTime: 2 * 60_000,
  });

  // Disbursement batch history
  const { data: batches = [] } = useQuery({
    queryKey: ["payroll-batches", school?.id],
    queryFn: async () => {
      const { data } = await supabase
        .from("payroll_batches")
        .select("id, label, funding_mechanism, total_payout_sum, funding_payment_status, created_at")
        .eq("school_id", school!.id)
        .order("created_at", { ascending: false });
      return (data ?? []) as PayrollBatch[];
    },
    enabled: !!school?.id,
  });

  async function toggleBatch(batchId: string) {
    if (expandedBatch === batchId) { setExpandedBatch(null); return; }
    setExpandedBatch(batchId);
    if (!batchItems[batchId]) {
      const { data } = await supabase
        .from("batch_line_items")
        .select("id, worker_name, payout_amount, snapshot_payout_method, disbursal_status")
        .eq("batch_id", batchId);
      setBatchItems((prev) => ({ ...prev, [batchId]: (data ?? []) as BatchLineItem[] }));
    }
  }

  // Eligible (saved + pending) payroll records for funding
  const fundableRows = payrollRows.filter((r) => r.id && r.payment_status !== "paid");
  const momoCount = fundableRows.filter((r) => (profilesByStaff[r.staff_id] ?? "MOBILE_MONEY") !== "BANK").length;
  const bankCount = fundableRows.length - momoCount;
  const fundNetTotal = fundableRows.reduce((s, r) => s + r.net_salary, 0);
  const fundOverhead = momoCount * MOMO_OVERHEAD + bankCount * BANK_OVERHEAD;
  const fundInbound = fundingMechanism === "BANK_COLLECT" ? INBOUND_BANK_FEE : 0;
  const fundGrandTotal = fundNetTotal + fundOverhead + fundInbound;

  const fundMutation = useMutation({
    mutationFn: async () => {
      return fetchEnvelope<{ funding_url: string }>("/api/v1/payroll/approve", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          payroll_record_ids: fundableRows.map((r) => r.id),
          funding_mechanism: fundingMechanism,
        }),
      });
    },
    onSuccess: (data) => {
      setFundModalOpen(false);
      queryClient.invalidateQueries({ queryKey: ["payroll-batches"] });
      if (data.funding_url) window.open(data.funding_url, "_blank");
      toast({ title: "Funding link generated", description: "Complete payment to release salaries.", variant: "success" });
    },
    onError: (err) => {
      toast({ title: "Error", description: err instanceof Error ? err.message : "Failed", variant: "destructive" });
    },
  });

  const totalGross = payrollRows.reduce((s: number, r: PayrollRow) => s + r.basic_salary, 0);
  const totalNet = payrollRows.reduce((s: number, r: PayrollRow) => s + r.net_salary, 0);
  const totalNSSF = payrollRows.reduce((s: number, r: PayrollRow) => s + calcNSSF(r.basic_salary).employee, 0);
  const paidCount = payrollRows.filter((r) => r.payment_status === "paid").length;

  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold font-display">Payroll</h1>
          <p className="text-muted text-sm mt-1">Manage staff salaries, allowances, and deductions</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={() => approveMutation.mutate()} disabled={approveMutation.isPending || payrollRows.length === 0}>
            {approveMutation.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <CheckCircle2 className="w-4 h-4 mr-2" />}
            Approve Payroll
          </Button>
          <Button onClick={() => setFundModalOpen(true)} disabled={fundableRows.length === 0}>
            <Send className="w-4 h-4 mr-2" />
            Approve & Fund via Pesapal
          </Button>
        </div>
      </div>

      {/* Month/Year Selector */}
      <Card className="bg-card">
        <CardContent className="p-4">
          <div className="flex items-end gap-4 flex-wrap">
            <div className="space-y-1">
              <Label className="text-xs">Month</Label>
              <select
                value={selectedMonth}
                onChange={(e) => setSelectedMonth(Number(e.target.value))}
                className="h-10 px-3 rounded-lg bg-bg-tertiary border border-border text-heading text-sm"
              >
                {MONTHS.map((m, i) => (
                  <option key={i} value={i + 1}>{m}</option>
                ))}
              </select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Year</Label>
              <select
                value={selectedYear}
                onChange={(e) => setSelectedYear(Number(e.target.value))}
                className="h-10 px-3 rounded-lg bg-bg-tertiary border border-border text-heading text-sm"
              >
                {[now.getFullYear() - 1, now.getFullYear(), now.getFullYear() + 1].map((y) => (
                  <option key={y} value={y}>{y}</option>
                ))}
              </select>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Summary */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: "Total Gross", value: formatUGX(totalGross), icon: Wallet, color: "text-warning-700", iconColor: "text-warning-700", bg: "bg-warning-100" },
          { label: "Total NSSF", value: formatUGX(totalNSSF), icon: Calculator, color: "text-text-heading", iconColor: "text-text-muted", bg: "bg-bg-tertiary" },
          { label: "Total Net", value: formatUGX(totalNet), icon: DollarSign, color: "text-success-700", iconColor: "text-success-700", bg: "bg-success-100" },
          { label: "Paid", value: `${paidCount}/${payrollRows.length}`, icon: CreditCard, color: "text-info-700", iconColor: "text-info-700", bg: "bg-info-100" },
        ].map((s) => (
          <Card key={s.label} className="bg-card border-border">
            <CardContent className="p-4 flex items-center gap-3">
              <div className={cn("w-10 h-10 rounded-lg flex items-center justify-center", s.bg, s.iconColor)}>
                <s.icon className="w-5 h-5" />
              </div>
              <div>
                <p className="text-xs text-text-muted">{s.label}</p>
                <p className={cn("text-lg font-bold", s.color)}>{s.value}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Payroll Table */}
      {loadingStaff || loadingPayroll ? (
        <div className="space-y-2">{[...Array(5)].map((_, i) => <Skeleton key={i} className="h-16 rounded-lg" />)}</div>
      ) : payrollRows.length === 0 ? (
        <EmptyState
          icon={Wallet}
          title="No active staff"
          description="Add staff members to run payroll."
        />
      ) : (
        <Card className="bg-card">
          <CardContent className="p-0 overflow-x-auto">
            <Table className="min-w-[700px]">
              <TableHeader>
                <TableRow>
                  <TableHead>Staff</TableHead>
                  <TableHead>Gross</TableHead>
                  <TableHead>Allowances</TableHead>
                  <TableHead>Deductions</TableHead>
                  <TableHead>NSSF (5%)</TableHead>
                  <TableHead>Net Salary</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="w-24">Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {payrollRows.map((row) => {
                  const nssf = calcNSSF(row.basic_salary);
                  const totalAlw = Object.values(row.editingAllowances).reduce((s, v) => s + v, 0);
                  const totalDed = Object.values(row.editingDeductions).reduce((s, v) => s + v, 0);
                  const cashOn = school?.cash_on ?? true;
                  const method = profilesByStaff[row.staff_id];
                  const hasProfile = method === "MOBILE_MONEY" || method === "BANK";
                  const cashEligible = canMarkPaidCash(cashOn, row.staff_id, profilesByStaff);

                  return (
                    <TableRow key={row.staff_id}>
                      <TableCell>
                        <div>
                          <p className="text-sm font-medium">{row.staff.full_name}</p>
                          <p className="text-xs text-heading">{row.staff.role_title}</p>
                          <div className="mt-1 flex flex-wrap items-center gap-1">
                            {!method ? (
                              <span className="inline-flex items-center gap-1 rounded-full bg-warning-100 px-2 py-0.5 text-[10px] font-medium text-warning-700">
                                <AlertTriangle className="h-2.5 w-2.5" /> No payment method
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 rounded-full bg-bg-tertiary px-2 py-0.5 text-[10px] font-medium text-heading">
                                {method === "MOBILE_MONEY" ? "Mobile Money" : "Bank"}
                              </span>
                            )}
                            {row.payment_status !== "paid" && !cashEligible && (
                              <span
                                className="inline-flex items-center gap-1 rounded-full bg-danger-50 px-2 py-0.5 text-[10px] font-medium text-danger-600"
                                title="Cash payouts are off for this school. Use Pesapal."
                              >
                                Pesapal only
                              </span>
                            )}
                          </div>
                        </div>
                      </TableCell>
                      <TableCell className="font-medium">{formatUGX(row.basic_salary)}</TableCell>
                      <TableCell>
                        <div className="space-y-1">
                          {Object.entries(row.editingAllowances).map(([key, val]) => (
                            <Input
                              key={key}
                              type="number"
                              value={val}
                              onChange={(e) => updateAllowance(row.staff_id, key, Number(e.target.value))}
                              className="h-7 w-28 text-xs"
                            />
                          ))}
                          <button
                            onClick={() => addAllowance(row.staff_id)}
                            className="text-xs text-secondary hover:text-secondary"
                          >
                            + Add
                          </button>
                          <p className="text-xs text-heading">Total: {formatUGX(totalAlw)}</p>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="space-y-1">
                          {Object.entries(row.editingDeductions).map(([key, val]) => (
                            <Input
                              key={key}
                              type="number"
                              value={val}
                              onChange={(e) => updateDeduction(row.staff_id, key, Number(e.target.value))}
                              className="h-7 w-28 text-xs"
                            />
                          ))}
                          <button
                            onClick={() => addDeduction(row.staff_id)}
                            className="text-xs text-secondary hover:text-secondary"
                          >
                            + Add
                          </button>
                          <p className="text-xs text-heading">Total: {formatUGX(totalDed)}</p>
                        </div>
                      </TableCell>
                      <TableCell className="text-secondary">{formatUGX(nssf.employee)}</TableCell>
                      <TableCell className="font-bold text-secondary">{formatUGX(row.net_salary)}</TableCell>
                      <TableCell>
                        {row.payment_status === "paid" ? (
                          <div>
                            <Badge variant="success">Paid</Badge>
                            {row.paid_at && (
                              <p className="text-[10px] text-heading mt-1">
                                {formatDate(row.paid_at)} via {row.payment_method || "Cash"}
                              </p>
                            )}
                          </div>
                        ) : (
                          <Badge variant="warning">Pending</Badge>
                        )}
                      </TableCell>
                      <TableCell>
                        {row.payment_status !== "paid" && (() => {
                          const cashOn = school?.cash_on ?? true;
                          const hasProfile =
                            profilesByStaff[row.staff_id] === "MOBILE_MONEY" ||
                            profilesByStaff[row.staff_id] === "BANK";
                          const enabled = canMarkPaidCash(
                            cashOn,
                            row.staff_id,
                            profilesByStaff
                          );
                          const disabledReason = !row.id
                            ? "Save payroll first"
                            : !enabled
                            ? "Cash payouts are off. Fund this staff via Pesapal."
                            : undefined;
                          return (
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => openPaymentModal(row.staff_id)}
                              disabled={!row.id || !enabled}
                              title={disabledReason}
                            >
                              Mark Paid
                            </Button>
                          );
                        })()}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
      {/* Disbursement Batches */}
      {batches.length > 0 && (
        <Card className="bg-card">
          <CardHeader><CardTitle>Disbursement Batches</CardTitle></CardHeader>
          <CardContent className="p-0 overflow-x-auto">
            <Table className="min-w-[640px]">
              <TableHeader>
                <TableRow>
                  <TableHead className="w-8"></TableHead>
                  <TableHead>Batch</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead>Total</TableHead>
                  <TableHead>Funding</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {batches.map((b) => (
                  <>
                    <TableRow key={b.id} className="cursor-pointer" onClick={() => toggleBatch(b.id)}>
                      <TableCell>
                        {expandedBatch === b.id ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                      </TableCell>
                      <TableCell className="text-sm font-medium">{b.label || b.id}</TableCell>
                      <TableCell className="text-sm">{formatDate(b.created_at)}</TableCell>
                      <TableCell className="text-sm font-semibold">{formatUGX(b.total_payout_sum)}</TableCell>
                      <TableCell>
                        <Badge
                          variant={
                            b.funding_payment_status === "SUCCESS"
                              ? "success"
                              : b.funding_payment_status === "FAILED"
                              ? "destructive"
                              : "warning"
                          }
                        >
                          {b.funding_payment_status === "AWAITING_EXTERNAL_FUNDING" ? "AWAITING" : b.funding_payment_status}
                        </Badge>
                      </TableCell>
                    </TableRow>
                    {expandedBatch === b.id && (batchItems[b.id] ?? []).map((li) => (
                      <TableRow key={`li-${li.id}`} className="bg-bg-tertiary">
                        <TableCell></TableCell>
                        <TableCell className="text-xs text-heading">{li.worker_name}</TableCell>
                        <TableCell className="text-xs text-heading">{li.snapshot_payout_method}</TableCell>
                        <TableCell className="text-xs">{formatUGX(li.payout_amount)}</TableCell>
                        <TableCell><Badge variant={li.disbursal_status === "SUCCESS" ? "success" : li.disbursal_status === "FAILED" ? "destructive" : "warning"}>{li.disbursal_status}</Badge></TableCell>
                      </TableRow>
                    ))}
                  </>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {/* Approve & Fund via Pesapal Modal */}
      <Dialog open={fundModalOpen} onOpenChange={setFundModalOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Approve & Fund via Pesapal</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-heading">{fundableRows.length} worker(s) will be funded.</p>
            <div className="max-h-40 space-y-1 overflow-y-auto rounded-lg bg-bg-tertiary p-3">
              {fundableRows.map((r) => (
                <div key={r.staff_id} className="flex items-center justify-between text-xs">
                  <span className="text-heading-500">{r.staff.full_name}</span>
                  <span className="text-heading">
                    {profilesByStaff[r.staff_id] ? profilesByStaff[r.staff_id] : (
                      <Link href={`/dashboard/staff/${r.staff_id}/payment-profile`} className="inline-flex items-center gap-1 text-secondary">
                        <AlertTriangle className="h-3 w-3" /> Method not set
                      </Link>
                    )}
                  </span>
                </div>
              ))}
            </div>
            <div className="space-y-2">
              <Label>Funding Mechanism</Label>
              <div className="flex gap-3">
                {(["MOMO_PUSH", "BANK_COLLECT"] as const).map((m) => (
                  <button
                    key={m}
                    type="button"
                    onClick={() => setFundingMechanism(m)}
                    className={cn(
                      "flex-1 rounded-lg border-2 px-3 py-2 text-sm font-medium transition-all",
                      fundingMechanism === m
                        ? "border-warning-500 bg-warning-100 text-warning-700"
                        : "border-border text-text-muted hover:border-border hover:text-text-heading"
                    )}
                  >
                    {m === "MOMO_PUSH" ? "Mobile Money" : "Bank Transfer"}
                  </button>
                ))}
              </div>
            </div>
            <div className="space-y-1 rounded-lg bg-bg-tertiary p-3 text-sm">
              <div className="flex justify-between"><span className="text-heading">Net Salaries</span><span>{formatUGX(fundNetTotal)}</span></div>
              <div className="flex justify-between"><span className="text-heading">MoMo overhead ({momoCount} - {MOMO_OVERHEAD})</span><span>{formatUGX(momoCount * MOMO_OVERHEAD)}</span></div>
              <div className="flex justify-between"><span className="text-heading">Bank overhead ({bankCount} - {BANK_OVERHEAD})</span><span>{formatUGX(bankCount * BANK_OVERHEAD)}</span></div>
              {fundInbound > 0 && <div className="flex justify-between"><span className="text-heading">Inbound funding fee</span><span>{formatUGX(fundInbound)}</span></div>}
              <div className="flex justify-between border-t border-border pt-1 font-bold text-secondary"><span>Grand Total</span><span>{formatUGX(fundGrandTotal)}</span></div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setFundModalOpen(false)}>Cancel</Button>
            <Button onClick={() => fundMutation.mutate()} disabled={fundMutation.isPending}>
              {fundMutation.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Generate Funding Link
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Payment Method Modal - cash only */}
      <Dialog open={paymentModalOpen} onOpenChange={setPaymentModalOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Confirm Cash Payment</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Payment Method</Label>
              <div className="flex items-center gap-2 rounded-lg border-2 border-warning-500 bg-warning-100 px-3 py-2.5 text-sm font-medium text-warning-700">
                <Wallet className="h-4 w-4" /> Cash
                <span className="ml-auto text-[10px] uppercase tracking-wider text-heading">Locked</span>
              </div>
              <p className="text-xs text-heading">
                Cash is the only method available on this page. Salaries paid through
                MoMo or Bank must be funded via the "Approve & Fund via Pesapal" action.
              </p>
            </div>
            <div className="space-y-2">
              <Label>Payment Date</Label>
              <Input
                type="date"
                value={paymentDate}
                onChange={(e) => setPaymentDate(e.target.value)}
              />
            </div>
            {payingStaffId && (
              <div className="p-3 rounded-lg bg-bg-tertiary border border-border">
                <p className="text-sm text-heading">
                  Amount:{" "}
                  <span className="font-bold text-secondary">
                    {formatUGX(payrollRows.find((r) => r.staff_id === payingStaffId)?.net_salary || 0)}
                  </span>
                </p>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setPaymentModalOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={() => markPaidMutation.mutate()}
              disabled={markPaidMutation.isPending}
            >
              {markPaidMutation.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Confirm Cash Payment
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </motion.div>
  );
}

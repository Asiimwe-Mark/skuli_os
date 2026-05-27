"use client";

import { useState, useMemo } from "react";
import { motion } from "framer-motion";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
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
  Plus,
  Loader2,
  CheckCircle2,
  DollarSign,
  Calculator,
  CreditCard,
} from "lucide-react";
import type { Staff, PayrollRecord } from "@/types";

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

export default function PayrollPage() {
  const { school } = useSchoolStore();
  const { toast } = useToast();
  const supabase = createClient();
  const queryClient = useQueryClient();

  const now = new Date();
  const [selectedMonth, setSelectedMonth] = useState(now.getMonth() + 1);
  const [selectedYear, setSelectedYear] = useState(now.getFullYear());
  const [payrollRows, setPayrollRows] = useState<PayrollRow[]>([]);
  const [paymentModalOpen, setPaymentModalOpen] = useState(false);
  const [payingStaffId, setPayingStaffId] = useState<string | null>(null);
  const [paymentMethod, setPaymentMethod] = useState<string>("cash");
  const [paymentDate, setPaymentDate] = useState(new Date().toISOString().split("T")[0]);

  // Load staff
  const { data: staffList = [], isLoading: loadingStaff } = useQuery({
    queryKey: ["staff-active", school?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("staff")
        .select("*")
        .eq("school_id", school!.id)
        .eq("is_active", true)
        .order("full_name");
      if (error) throw error;
      return (data || []) as Staff[];
    },
    enabled: !!school?.id,
  });

  // Load payroll records for month/year
  const { isLoading: loadingPayroll } = useQuery({
    queryKey: ["payroll", school?.id, selectedMonth, selectedYear],
    queryFn: async () => {
      const { data: records, error } = await supabase
        .from("payroll_records")
        .select("*")
        .eq("school_id", school!.id)
        .eq("month", selectedMonth)
        .eq("year", selectedYear);
      if (error) throw error;

      const recordMap = new Map((records || []).map((r: PayrollRecord) => [r.staff_id, r]));

      const rows: PayrollRow[] = staffList.map((staff) => {
        const existing = recordMap.get(staff.id);
        const nssf = calcNSSF(staff.basic_salary);

        if (existing) {
          return {
            ...existing,
            staff,
            editingAllowances: existing.allowances || {},
            editingDeductions: existing.deductions || {},
          };
        }

        return {
          id: "",
          school_id: school!.id,
          staff_id: staff.id,
          month: selectedMonth,
          year: selectedYear,
          basic_salary: staff.basic_salary,
          allowances: {},
          deductions: {},
          nssf_employee: nssf.employee,
          nssf_employer: nssf.employer,
          net_salary: calcNet(staff.basic_salary, {}, {}, nssf.employee),
          payment_status: "pending" as const,
          paid_at: null,
          payment_method: null,
          created_at: "",
          updated_at: "",
          staff,
          editingAllowances: {},
          editingDeductions: {},
        };
      });

      setPayrollRows(rows);
      return rows;
    },
    enabled: !!school?.id && staffList.length > 0,
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
      for (const row of payrollRows) {
        const nssf = calcNSSF(row.basic_salary);
        const record = {
          school_id: school!.id,
          staff_id: row.staff_id,
          month: selectedMonth,
          year: selectedYear,
          basic_salary: row.basic_salary,
          allowances: row.editingAllowances,
          deductions: row.editingDeductions,
          nssf_employee: nssf.employee,
          nssf_employer: nssf.employer,
          net_salary: row.net_salary,
          payment_status: "pending" as const,
        };

        if (row.id) {
          await supabase.from("payroll_records").update(record).eq("id", row.id);
        } else {
          await supabase.from("payroll_records").insert(record);
        }
      }
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
      await supabase
        .from("payroll_records")
        .update({
          payment_status: "paid",
          paid_at: new Date(paymentDate).toISOString(),
          payment_method: paymentMethod,
        })
        .eq("id", row.id);
    },
    onSuccess: () => {
      toast({ title: "Marked as paid", variant: "success" });
      setPaymentModalOpen(false);
      setPayingStaffId(null);
      queryClient.invalidateQueries({ queryKey: ["payroll"] });
    },
    onError: (err) => {
      toast({ title: "Error", description: err instanceof Error ? err.message : "Failed", variant: "destructive" });
    },
  });

  const openPaymentModal = (staffId: string) => {
    setPayingStaffId(staffId);
    setPaymentMethod("cash");
    setPaymentDate(new Date().toISOString().split("T")[0]);
    setPaymentModalOpen(true);
  };

  const totalGross = payrollRows.reduce((s, r) => s + r.basic_salary, 0);
  const totalNet = payrollRows.reduce((s, r) => s + r.net_salary, 0);
  const totalNSSF = payrollRows.reduce((s, r) => s + calcNSSF(r.basic_salary).employee, 0);
  const paidCount = payrollRows.filter((r) => r.payment_status === "paid").length;

  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold font-display">Payroll</h1>
          <p className="text-muted-foreground text-sm mt-1">Manage staff salaries, allowances, and deductions</p>
        </div>
        <Button onClick={() => approveMutation.mutate()} disabled={approveMutation.isPending || payrollRows.length === 0}>
          {approveMutation.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <CheckCircle2 className="w-4 h-4 mr-2" />}
          Approve Payroll
        </Button>
      </div>

      {/* Month/Year Selector */}
      <Card className="border-border-subtle bg-surface">
        <CardContent className="p-4">
          <div className="flex items-end gap-4 flex-wrap">
            <div className="space-y-1">
              <Label className="text-xs">Month</Label>
              <select
                value={selectedMonth}
                onChange={(e) => setSelectedMonth(Number(e.target.value))}
                className="h-10 px-3 rounded-lg bg-navy-800 border border-navy-600 text-foreground text-sm"
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
                className="h-10 px-3 rounded-lg bg-navy-800 border border-navy-600 text-foreground text-sm"
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
          { label: "Total Gross", value: formatUGX(totalGross), icon: Wallet, color: "text-amber-400", bg: "bg-amber-400/10" },
          { label: "Total NSSF", value: formatUGX(totalNSSF), icon: Calculator, color: "text-blue-400", bg: "bg-blue-500/10" },
          { label: "Total Net", value: formatUGX(totalNet), icon: DollarSign, color: "text-emerald-400", bg: "bg-emerald-500/10" },
          { label: "Paid", value: `${paidCount}/${payrollRows.length}`, icon: CreditCard, color: "text-foreground", bg: "bg-navy-700" },
        ].map((s) => (
          <Card key={s.label} className="border-border-subtle bg-surface">
            <CardContent className="p-4 flex items-center gap-3">
              <div className={cn("w-10 h-10 rounded-lg flex items-center justify-center", s.bg)}>
                <s.icon className={cn("w-5 h-5", s.color)} />
              </div>
              <div>
                <p className="text-xs text-foreground/60">{s.label}</p>
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
        <Card className="border-border-subtle bg-surface">
          <CardContent className="p-0 overflow-x-auto">
            <Table>
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

                  return (
                    <TableRow key={row.staff_id}>
                      <TableCell>
                        <div>
                          <p className="text-sm font-medium">{row.staff.full_name}</p>
                          <p className="text-xs text-foreground/50">{row.staff.role_title}</p>
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
                            className="text-xs text-amber-400 hover:text-amber-300"
                          >
                            + Add
                          </button>
                          <p className="text-xs text-foreground/50">Total: {formatUGX(totalAlw)}</p>
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
                            className="text-xs text-amber-400 hover:text-amber-300"
                          >
                            + Add
                          </button>
                          <p className="text-xs text-foreground/50">Total: {formatUGX(totalDed)}</p>
                        </div>
                      </TableCell>
                      <TableCell className="text-blue-400">{formatUGX(nssf.employee)}</TableCell>
                      <TableCell className="font-bold text-emerald-400">{formatUGX(row.net_salary)}</TableCell>
                      <TableCell>
                        {row.payment_status === "paid" ? (
                          <div>
                            <Badge variant="success">Paid</Badge>
                            {row.paid_at && (
                              <p className="text-[10px] text-foreground/50 mt-1">
                                {formatDate(row.paid_at)} via {row.payment_method || "Cash"}
                              </p>
                            )}
                          </div>
                        ) : (
                          <Badge variant="warning">Pending</Badge>
                        )}
                      </TableCell>
                      <TableCell>
                        {row.payment_status !== "paid" && (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => openPaymentModal(row.staff_id)}
                            disabled={!row.id}
                          >
                            Mark Paid
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
      {/* Payment Method Modal */}
      <Dialog open={paymentModalOpen} onOpenChange={setPaymentModalOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Confirm Payment</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Payment Method</Label>
              <div className="flex gap-3">
                {["cash", "bank_transfer"].map((method) => (
                  <button
                    key={method}
                    type="button"
                    onClick={() => setPaymentMethod(method)}
                    className={cn(
                      "flex-1 py-2.5 px-4 rounded-lg border-2 text-sm font-medium transition-all",
                      paymentMethod === method
                        ? "border-amber-400 bg-amber-400/5 text-amber-400"
                        : "border-navy-600 text-foreground/60 hover:border-navy-500"
                    )}
                  >
                    {method === "cash" ? "Cash" : "Bank Transfer"}
                  </button>
                ))}
              </div>
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
              <div className="p-3 rounded-lg bg-navy-700/50 border border-navy-600">
                <p className="text-sm text-foreground/60">
                  Amount:{" "}
                  <span className="font-bold text-emerald-400">
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
              Confirm Payment
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </motion.div>
  );
}

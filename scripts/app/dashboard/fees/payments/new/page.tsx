"use client";

import { useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import { useSchoolStore } from "@/store/school";
import { recordPaymentSchema, type RecordPaymentFormData } from "@/lib/validations/fees";
import { formatUGX } from "@/lib/utils/currency";
import { formatDate } from "@/lib/utils/dates";
import { normalizePhone, isValidUgandaPhone } from "@/lib/utils/phone";
import { cn } from "@/lib/utils/cn";
import { useToast, toastSuccess, toastError } from "@/components/ui/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Loader2,
  CreditCard,
  CheckCircle2,
  Search,
  Smartphone,
  Banknote,
  Building2,
  Gift,
  AlertTriangle,
  ArrowLeft,
  Printer,
} from "lucide-react";

interface StudentOption {
  id: string;
  full_name: string;
  admission_number: string;
  balance: number;
  fee_account_id: string;
  class_name: string;
  parent_phone: string;
}

// Debounce a value: returns the value after `delay` ms of no changes.
// Used to throttle the student-picker search so we don't fire a
// request on every keystroke.
function useDebounced<T>(value: T, delay = 250): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return debounced;
}

export default function RecordPaymentPage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const school = useSchoolStore((s) => s.school);
  const currentTerm = useSchoolStore((s) => s.currentTerm);
  const { toast } = useToast();

  const [searchQuery, setSearchQuery] = useState("");
  const [showDropdown, setShowDropdown] = useState(false);
  const [selectedStudent, setSelectedStudent] = useState<StudentOption | null>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const [success, setSuccess] = useState(false);
  const [receiptNumber, setReceiptNumber] = useState("");
  const [submittedAmount, setSubmittedAmount] = useState(0);
  const [submittedMethod, setSubmittedMethod] = useState("");

  // Server-side search (audit 4.4). The endpoint is capped at 50
  // rows, and the search filter is pushed to the database via
  // ilike on students.full_name / admission_number. The previous
  // client-side impl loaded all 2000 fee accounts for the term in
  // one shot; this is bounded by `limit` regardless of school size.
  const debouncedQuery = useDebounced(searchQuery, 250);

  const { data: students = [], isLoading: studentsLoading } = useQuery({
    queryKey: [
      "fee-accounts-search",
      school?.id,
      currentTerm?.id,
      debouncedQuery.trim(),
    ],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (debouncedQuery.trim()) params.set("q", debouncedQuery.trim());
      if (currentTerm?.id) params.set("term_id", currentTerm.id);
      params.set("limit", "20");
      const res = await fetch(`/api/fees/accounts/search?${params.toString()}`);
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Search failed");
      return (json.data?.students ?? []) as StudentOption[];
    },
    enabled: !!school?.id && !!currentTerm?.id,
  });

  // ?"EUR?"EUR Form ?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR

  const form = useForm<RecordPaymentFormData>({
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    resolver: zodResolver(recordPaymentSchema) as any,
    defaultValues: {
      student_id: "",
      amount: 0,
      payment_method: "cash",
      mobile_money_provider: null,
      phone_used: null,
      mobile_money_transaction_id: null,
      payment_date: new Date().toISOString().split("T")[0],
      notes: null,
    },
  });

  const paymentMethod = form.watch("payment_method");
  const amountValue = form.watch("amount");

  // Close dropdown on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setShowDropdown(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  // Server already returns only matching students. We keep the
  // local variable so the JSX below doesn't need to change.
  const filteredStudents = students;

  function selectStudent(student: StudentOption) {
    setSelectedStudent(student);
    form.setValue("student_id", student.id);
    setSearchQuery(student.full_name);
    setShowDropdown(false);
  }

  const amountWarning =
    selectedStudent && amountValue > 0 && amountValue > selectedStudent.balance;

  // ?"EUR?"EUR Mutation ?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR

  const submitMutation = useMutation({
    mutationFn: async (data: RecordPaymentFormData) => {
      if (!selectedStudent) throw new Error("Missing data");

      const res = await fetch("/api/fees/payments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          student_id: data.student_id,
          amount: data.amount,
          payment_method: data.payment_method,
          mobile_money_provider: data.payment_method === "mobile_money" ? data.mobile_money_provider : null,
          phone_used: data.payment_method === "mobile_money" && data.phone_used ? normalizePhone(data.phone_used) : null,
          mobile_money_transaction_id: data.payment_method === "mobile_money" ? data.mobile_money_transaction_id || null : null,
          payment_date: data.payment_date,
          notes: data.notes || null,
          fee_account_id: selectedStudent.fee_account_id,
        }),
      });
      const result = await res.json();
      if (!res.ok) throw new Error(result.error || "Failed to record payment");
      const receipt = result.data?.receipt_number ?? result.receipt_number ?? "";
      // Refund fee account balance, defaulters, statements, receipts, dashboard
      // aggregates, and any other page that depends on this term's payments.
      queryClient.invalidateQueries({ queryKey: ["fee-accounts-for-payment"] });
      queryClient.invalidateQueries({ queryKey: ["fee-accounts"] });
      queryClient.invalidateQueries({ queryKey: ["fee-payments"] });
      queryClient.invalidateQueries({ queryKey: ["fee-payments-all"] });
      queryClient.invalidateQueries({ queryKey: ["fee-payments-income"] });
      queryClient.invalidateQueries({ queryKey: ["fee-receipts"] });
      queryClient.invalidateQueries({ queryKey: ["fee-defaulters"] });
      queryClient.invalidateQueries({ queryKey: ["fee-statements-students"] });
      queryClient.invalidateQueries({ queryKey: ["fee-statement"] });
      queryClient.invalidateQueries({ queryKey: ["fees-index"] });
      queryClient.invalidateQueries({ queryKey: ["student-fee-status"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard"] });
      queryClient.invalidateQueries({ queryKey: ["sms-logs"] });
      queryClient.invalidateQueries({ queryKey: ["sms-balance"] });
      return receipt;
    },
    onSuccess: (receipt) => {
      setReceiptNumber(receipt);
      setSubmittedAmount(form.getValues("amount"));
      setSubmittedMethod(form.getValues("payment_method"));
      setSuccess(true);
      toastSuccess({ title: "Payment recorded successfully" });
    },
    onError: (err) => {
      toastError({
        title: "Error recording payment",
        description: err instanceof Error ? err.message : "Something went wrong",
      });
    },
  });

  function resetForm() {
    setSelectedStudent(null);
    setSearchQuery("");
    form.reset({
      student_id: "",
      amount: 0,
      payment_method: "cash",
      mobile_money_provider: null,
      phone_used: null,
      mobile_money_transaction_id: null,
      payment_date: new Date().toISOString().split("T")[0],
      notes: null,
    });
    setSuccess(false);
    setReceiptNumber("");
  }

  // ?"EUR?"EUR Loading state ?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR

  if (studentsLoading) {
    return (
      <div className="max-w-2xl mx-auto space-y-6">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-4 w-64" />
        <Skeleton className="h-64 rounded-xl" />
        <Skeleton className="h-96 rounded-xl" />
      </div>
    );
  }

  // ?"EUR?"EUR Success state ?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR

  if (success) {
    return (
      <div className="max-w-lg mx-auto">
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ type: "spring", damping: 20, stiffness: 300 }}
          className="bg-bg-tertiary border border-success-500 rounded-2xl p-8 text-center"
        >
          <motion.div
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            transition={{ delay: 0.2, type: "spring", damping: 15 }}
            className="w-20 h-20 rounded-full bg-success-100 flex items-center justify-center mx-auto mb-6"
          >
            <CheckCircle2 className="w-10 h-10 text-success-700" />
          </motion.div>

          <h2 className="text-2xl font-bold mb-2">Payment Recorded</h2>
          <p className="text-disabled mb-6">
            The payment has been successfully recorded.
          </p>

          <div className="bg-bg-tertiary rounded-xl p-6 mb-6 text-left space-y-3">
            <div className="flex justify-between">
              <span className="text-sm text-disabled">Receipt Number</span>
              <span className="text-sm font-mono font-bold text-text-heading">
                {receiptNumber}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-sm text-disabled">Student</span>
              <span className="text-sm font-medium text-text-heading">
                {selectedStudent?.full_name}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-sm text-disabled">Amount</span>
              <span className="text-sm font-bold text-success-700">
                {formatUGX(submittedAmount)}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-sm text-disabled">Method</span>
              <span className="text-sm capitalize">
                {submittedMethod.replace("_", " ")}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-sm text-disabled">Date</span>
              <span className="text-sm">{formatDate(new Date())}</span>
            </div>
          </div>

          <div className="flex gap-3 justify-center">
            <Button variant="outline" onClick={resetForm}>
              Record Another
            </Button>
            <Button onClick={() => router.push("/dashboard/fees/receipts")}>
              <Printer className="w-4 h-4 mr-2" />
              View Receipts
            </Button>
          </div>
        </motion.div>
      </div>
    );
  }

  // ?"EUR?"EUR Form state ?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="max-w-2xl mx-auto"
    >
      {/* Header */}
      <div className="mb-6">
        <Link
          href="/dashboard/fees/accounts"
          className="inline-flex items-center text-sm text-disabled hover:text-heading mb-3"
        >
          <ArrowLeft className="w-4 h-4 mr-1" />
          Back to Fee Accounts
        </Link>
        <h1 className="text-2xl font-bold font-display">Record Payment</h1>
        <p className="text-sm text-disabled">
          Record a fee payment for a student
        </p>
      </div>

      <form
        onSubmit={form.handleSubmit((data) => {
          if (amountWarning) {
            if (
              !window.confirm(
                `The amount ${formatUGX(data.amount)} exceeds the balance of ${formatUGX(
                  selectedStudent!.balance
                )}. Continue?`
              )
            )
              return;
          }
          submitMutation.mutate(data);
        })}
        className="space-y-6"
      >
        {/* Student Selector */}
        <Card className="">
          <CardHeader>
            <CardTitle className="text-base">Select Student</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="relative" ref={dropdownRef}>
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted" />
              <Input
                placeholder="Search by name or admission number..."
                value={searchQuery}
                onChange={(e) => {
                  setSearchQuery(e.target.value);
                  setShowDropdown(true);
                  if (!e.target.value) {
                    setSelectedStudent(null);
                    form.setValue("student_id", "");
                  }
                }}
                onFocus={() => setShowDropdown(true)}
                className="pl-10"
              />
              {showDropdown && filteredStudents.length > 0 && (
                <div className="absolute z-20 w-full mt-1 bg-bg-tertiary border border-border rounded-lg shadow-xl max-h-60 overflow-y-auto">
                  {filteredStudents.slice(0, 10).map((s) => (
                    <button
                      key={s.id}
                      type="button"
                      onClick={() => selectStudent(s)}
                      className="w-full flex items-center justify-between px-4 py-3 hover:bg-card-hover transition-colors text-left border-b border-border last:border-0"
                    >
                      <div>
                        <p className="text-sm font-medium">{s.full_name}</p>
                        <p className="text-xs text-muted">
                          {s.admission_number}
                          {s.class_name && ` \u00b7 ${s.class_name}`}
                        </p>
                      </div>
                      <span
                        className={cn(
                          "text-sm font-medium",
                          s.balance > 0 ? "text-secondary" : "text-secondary"
                        )}
                      >
                        {formatUGX(s.balance)}
                      </span>
                    </button>
                  ))}
                </div>
              )}
              {form.formState.errors.student_id && (
                <p className="text-xs text-secondary mt-1">
                  {form.formState.errors.student_id.message}
                </p>
              )}
            </div>

            {selectedStudent && (
              <motion.div
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                className="mt-3 p-4 rounded-lg bg-bg-tertiary border border-border flex items-center justify-between"
              >
                <div>
                  <p className="text-sm font-medium">
                    {selectedStudent.full_name}
                  </p>
                  <p className="text-xs text-muted">
                    {selectedStudent.admission_number}
                    {selectedStudent.class_name &&
                      ` \u00b7 ${selectedStudent.class_name}`}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-xs text-muted">Outstanding Balance</p>
                  <p className="text-lg font-bold text-danger-700">
                    {formatUGX(selectedStudent.balance)}
                  </p>
                </div>
              </motion.div>
            )}
          </CardContent>
        </Card>

        {/* Payment Details */}
        <Card className="">
          <CardHeader>
            <CardTitle className="text-base">Payment Details</CardTitle>
          </CardHeader>
          <CardContent className="space-y-5">
            {/* Amount & Date */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="amount">Amount (UGX)</Label>
                <Input
                  id="amount"
                  type="number"
                  placeholder="0"
                  min={0}
                  {...form.register("amount", { valueAsNumber: true })}
                />
                {form.formState.errors.amount && (
                  <p className="text-xs text-danger-600">
                    {form.formState.errors.amount.message}
                  </p>
                )}
                {amountValue > 0 && (
                  <p className="text-xs text-text-secondary">
                    {formatUGX(amountValue)}
                  </p>
                )}
                {amountWarning && (
                  <div className="flex items-center gap-1.5 text-xs text-warning-700">
                    <AlertTriangle className="w-3 h-3" />
                    Amount exceeds balance by{" "}
                    {formatUGX(amountValue - selectedStudent!.balance)}
                  </div>
                )}
              </div>
              <div className="space-y-2">
                <Label htmlFor="payment_date">Date of Payment</Label>
                <Input
                  id="payment_date"
                  type="date"
                  {...form.register("payment_date")}
                />
              </div>
            </div>

            {/* Payment Method */}
            <div className="space-y-2">
              <Label>Payment Method</Label>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                {[
                  {
                    value: "mobile_money" as const,
                    label: "Mobile Money",
                    icon: Smartphone,
                  },
                  { value: "cash" as const, label: "Cash", icon: Banknote },
                  {
                    value: "bank" as const,
                    label: "Bank Transfer",
                    icon: Building2,
                  },
                  { value: "waiver" as const, label: "Waiver", icon: Gift },
                ].map((m) => (
                  <button
                    key={m.value}
                    type="button"
                    onClick={() => form.setValue("payment_method", m.value)}
                    className={cn(
                      "flex flex-col items-center gap-1.5 p-3 rounded-lg border transition-all",
                      paymentMethod === m.value
                        ? "border-brand-500 bg-brand-50 text-brand-700"
                        : "border-border text-disabled hover:border-border"
                    )}
                  >
                    <m.icon className="w-5 h-5" />
                    <span className="text-xs font-medium">{m.label}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Mobile Money Fields */}
            <AnimatePresence>
              {paymentMethod === "mobile_money" && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: "auto" }}
                  exit={{ opacity: 0, height: 0 }}
                  className="space-y-4 overflow-hidden"
                >
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label>Provider</Label>
                      <div className="flex gap-2">
                        {(
                          [
                            {
                              value: "mtn" as const,
                              label: "MTN",
                              color:
                                "border-warning-500 bg-warning-100 text-warning-700",
                            },
                            {
                              value: "airtel" as const,
                              label: "Airtel",
                              color:
                                "border-danger-500 bg-danger-100 text-danger-700",
                            },
                          ] as const
                        ).map((p) => (
                          <button
                            key={p.value}
                            type="button"
                            onClick={() =>
                              form.setValue("mobile_money_provider", p.value)
                            }
                            className={cn(
                              "flex-1 py-2.5 rounded-lg border text-sm font-medium transition-all",
                              form.watch("mobile_money_provider") === p.value
                                ? p.color
                                : "border-border text-disabled"
                            )}
                          >
                            {p.label}
                          </button>
                        ))}
                      </div>
                      {form.formState.errors.mobile_money_provider && (
                        <p className="text-xs text-danger-600">
                          {form.formState.errors.mobile_money_provider.message}
                        </p>
                      )}
                    </div>
                    <div className="space-y-2">
                      <Label>Phone Number</Label>
                      <Input
                        placeholder="+256 700 000 000"
                        {...form.register("phone_used")}
                      />
                      {form.formState.errors.phone_used && (
                        <p className="text-xs text-danger-600">
                          {form.formState.errors.phone_used.message}
                        </p>
                      )}
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label>Transaction ID</Label>
                    <Input
                      placeholder="Mobile money transaction reference"
                      {...form.register("mobile_money_transaction_id")}
                    />
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Notes */}
            <div className="space-y-2">
              <Label>Notes (optional)</Label>
              <Textarea
                placeholder="Any notes about this payment..."
                {...form.register("notes")}
                rows={3}
              />
            </div>
          </CardContent>
        </Card>

        {/* Submit */}
        <Button
          type="submit"
          disabled={submitMutation.isPending || !selectedStudent}
          className="w-full h-12 text-base"
        >
          {submitMutation.isPending ? (
            <>
              <Loader2 className="w-4 h-4 mr-2 animate-spin" /> Recording
              Payment...
            </>
          ) : (
            <>
              <CreditCard className="w-4 h-4 mr-2" /> Record Payment
            </>
          )}
        </Button>
      </form>
    </motion.div>
  );
}

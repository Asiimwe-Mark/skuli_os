"use client";

import { useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useQuery, useMutation } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import { useSchoolStore } from "@/store/school";
import { recordPaymentSchema, type RecordPaymentFormData } from "@/lib/validations/fees";
import { formatUGX } from "@/lib/utils/currency";
import { formatDate } from "@/lib/utils/dates";
import { normalizePhone, isValidUgandaPhone } from "@/lib/utils/phone";
import { cn } from "@/lib/utils/cn";
import { useToast } from "@/components/ui/use-toast";
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

export default function RecordPaymentPage() {
  const router = useRouter();
  const school = useSchoolStore((s) => s.school);
  const currentTerm = useSchoolStore((s) => s.currentTerm);
  const { toast } = useToast();
  const supabase = createClient();

  const [searchQuery, setSearchQuery] = useState("");
  const [showDropdown, setShowDropdown] = useState(false);
  const [selectedStudent, setSelectedStudent] = useState<StudentOption | null>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const [success, setSuccess] = useState(false);
  const [receiptNumber, setReceiptNumber] = useState("");
  const [submittedAmount, setSubmittedAmount] = useState(0);
  const [submittedMethod, setSubmittedMethod] = useState("");

  // ── Queries ──────────────────────────────────────────────────────────

  const { data: students = [], isLoading: studentsLoading } = useQuery({
    queryKey: ["fee-accounts-for-payment", school?.id, currentTerm?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("fee_accounts")
        .select(
          `id, balance,
           student:students(id, full_name, admission_number, parent_phone, current_class:classes(name))`
        )
        .eq("school_id", school!.id)
        .eq("term_id", currentTerm!.id)
        .eq("is_deleted", false)
        .order("balance", { ascending: false });
      if (error) throw error;
      interface RawFeeAccountForPayment {
        id: string;
        balance: number;
        student?: {
          id?: string;
          full_name?: string;
          admission_number?: string;
          parent_phone?: string;
          current_class?: { name?: string } | { name?: string }[];
        } | null;
      }
      return ((data ?? []) as unknown as RawFeeAccountForPayment[]).map((a) => {
        const s = Array.isArray(a.student) ? a.student[0] : a.student;
        const cls = Array.isArray(s?.current_class)
          ? s.current_class[0]
          : s?.current_class;
        return {
          id: s?.id || "",
          full_name: s?.full_name || "Unknown",
          admission_number: s?.admission_number || "",
          balance: a.balance,
          fee_account_id: a.id,
          class_name: cls?.name || "",
          parent_phone: s?.parent_phone || "",
        } as StudentOption;
      });
    },
    enabled: !!school?.id && !!currentTerm?.id,
  });

  // ── Form ─────────────────────────────────────────────────────────────

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

  const filteredStudents = students.filter(
    (s) =>
      s.full_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      s.admission_number.toLowerCase().includes(searchQuery.toLowerCase())
  );

  function selectStudent(student: StudentOption) {
    setSelectedStudent(student);
    form.setValue("student_id", student.id);
    setSearchQuery(student.full_name);
    setShowDropdown(false);
  }

  const amountWarning =
    selectedStudent && amountValue > 0 && amountValue > selectedStudent.balance;

  // ── Mutation ─────────────────────────────────────────────────────────

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
      return result.receipt_number || result.data?.receipt_number || "";
    },
    onSuccess: (receipt) => {
      setReceiptNumber(receipt);
      setSubmittedAmount(form.getValues("amount"));
      setSubmittedMethod(form.getValues("payment_method"));
      setSuccess(true);
      toast({ title: "Payment recorded successfully" });
    },
    onError: (err) => {
      toast({
        title: "Error recording payment",
        description: err instanceof Error ? err.message : "Something went wrong",
        variant: "destructive",
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

  // ── Loading state ────────────────────────────────────────────────────

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

  // ── Success state ────────────────────────────────────────────────────

  if (success) {
    return (
      <div className="max-w-lg mx-auto">
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ type: "spring", damping: 20, stiffness: 300 }}
          className="bg-navy-800 border border-emerald-500/30 rounded-2xl p-8 text-center"
        >
          <motion.div
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            transition={{ delay: 0.2, type: "spring", damping: 15 }}
            className="w-20 h-20 rounded-full bg-emerald-500/20 flex items-center justify-center mx-auto mb-6"
          >
            <CheckCircle2 className="w-10 h-10 text-emerald-400" />
          </motion.div>

          <h2 className="text-2xl font-bold mb-2">Payment Recorded</h2>
          <p className="text-gray-400 mb-6">
            The payment has been successfully recorded.
          </p>

          <div className="bg-navy-900 rounded-xl p-6 mb-6 text-left space-y-3">
            <div className="flex justify-between">
              <span className="text-sm text-gray-400">Receipt Number</span>
              <span className="text-sm font-mono font-bold text-amber-400">
                {receiptNumber}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-sm text-gray-400">Student</span>
              <span className="text-sm font-medium">
                {selectedStudent?.full_name}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-sm text-gray-400">Amount</span>
              <span className="text-sm font-bold text-emerald-400">
                {formatUGX(submittedAmount)}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-sm text-gray-400">Method</span>
              <span className="text-sm capitalize">
                {submittedMethod.replace("_", " ")}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-sm text-gray-400">Date</span>
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

  // ── Form state ───────────────────────────────────────────────────────

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
          className="inline-flex items-center text-sm text-gray-400 hover:text-foreground mb-3"
        >
          <ArrowLeft className="w-4 h-4 mr-1" />
          Back to Fee Accounts
        </Link>
        <h1 className="text-2xl font-bold font-display">Record Payment</h1>
        <p className="text-sm text-gray-400">
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
        <Card className="border-border-subtle">
          <CardHeader>
            <CardTitle className="text-base">Select Student</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="relative" ref={dropdownRef}>
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
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
                <div className="absolute z-20 w-full mt-1 bg-navy-900 border border-navy-600 rounded-lg shadow-xl max-h-60 overflow-y-auto">
                  {filteredStudents.slice(0, 10).map((s) => (
                    <button
                      key={s.id}
                      type="button"
                      onClick={() => selectStudent(s)}
                      className="w-full flex items-center justify-between px-4 py-3 hover:bg-navy-800 transition-colors text-left border-b border-navy-700/50 last:border-0"
                    >
                      <div>
                        <p className="text-sm font-medium">{s.full_name}</p>
                        <p className="text-xs text-gray-500">
                          {s.admission_number}
                          {s.class_name && ` \u00b7 ${s.class_name}`}
                        </p>
                      </div>
                      <span
                        className={cn(
                          "text-sm font-medium",
                          s.balance > 0 ? "text-rose-400" : "text-emerald-400"
                        )}
                      >
                        {formatUGX(s.balance)}
                      </span>
                    </button>
                  ))}
                </div>
              )}
              {form.formState.errors.student_id && (
                <p className="text-xs text-rose-400 mt-1">
                  {form.formState.errors.student_id.message}
                </p>
              )}
            </div>

            {selectedStudent && (
              <motion.div
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                className="mt-3 p-4 rounded-lg bg-navy-900 border border-navy-700 flex items-center justify-between"
              >
                <div>
                  <p className="text-sm font-medium">
                    {selectedStudent.full_name}
                  </p>
                  <p className="text-xs text-gray-500">
                    {selectedStudent.admission_number}
                    {selectedStudent.class_name &&
                      ` \u00b7 ${selectedStudent.class_name}`}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-xs text-gray-500">Outstanding Balance</p>
                  <p className="text-lg font-bold text-rose-400">
                    {formatUGX(selectedStudent.balance)}
                  </p>
                </div>
              </motion.div>
            )}
          </CardContent>
        </Card>

        {/* Payment Details */}
        <Card className="border-border-subtle">
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
                  <p className="text-xs text-rose-400">
                    {form.formState.errors.amount.message}
                  </p>
                )}
                {amountValue > 0 && (
                  <p className="text-xs text-gray-500">
                    {formatUGX(amountValue)}
                  </p>
                )}
                {amountWarning && (
                  <div className="flex items-center gap-1.5 text-xs text-amber-400">
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
                        ? "border-amber-400 bg-amber-400/10 text-amber-400"
                        : "border-navy-600 text-gray-400 hover:border-navy-500"
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
                                "border-yellow-500 bg-yellow-500/10 text-yellow-500",
                            },
                            {
                              value: "airtel" as const,
                              label: "Airtel",
                              color:
                                "border-red-500 bg-red-500/10 text-red-500",
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
                                : "border-navy-600 text-gray-400"
                            )}
                          >
                            {p.label}
                          </button>
                        ))}
                      </div>
                      {form.formState.errors.mobile_money_provider && (
                        <p className="text-xs text-rose-400">
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
                        <p className="text-xs text-rose-400">
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

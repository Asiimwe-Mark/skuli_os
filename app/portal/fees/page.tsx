"use client";

import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { createBrowserClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils/cn";
import { formatUGX } from "@/lib/utils/currency";
import { formatDate } from "@/lib/utils/dates";
import {
  CreditCard,
  Download,
  X,
  CheckCircle2,
  XCircle,
  Loader2,
  Receipt,
  ArrowLeft,
  ChevronDown,
} from "lucide-react";

interface FeeItem {
  id: string;
  name: string;
  amount: number;
}

interface FeeSummary {
  items: FeeItem[];
  total_expected: number;
  total_paid: number;
  balance: number;
}

interface Payment {
  id: string;
  amount: number;
  payment_date: string;
  receipt_number: string;
  method: string;
  status: string;
}

type PaymentModalState = "idle" | "processing" | "success" | "failed";

interface LinkedStudent {
  student_id: string;
  student: {
    id: string;
    first_name: string;
    last_name: string;
    admission_number: string | null;
    class: { id: string; name: string } | null;
    school: { id: string; name: string; motto: string | null } | null;
  };
}

export default function PortalFeesPage() {
  const supabase = createBrowserClient();
  const [loading, setLoading] = useState(true);
  const [linkedStudents, setLinkedStudents] = useState<LinkedStudent[]>([]);
  const [selectedStudentId, setSelectedStudentId] = useState<string>("");
  const [phone, setPhone] = useState("");
  const [feeSummary, setFeeSummary] = useState<FeeSummary | null>(null);
  const [payments, setPayments] = useState<Payment[]>([]);

  const [showPayModal, setShowPayModal] = useState(false);
  const [payAmount, setPayAmount] = useState("");
  const [payPhone, setPayPhone] = useState("");
  const [payState, setPayState] = useState<PaymentModalState>("idle");
  const [payError, setPayError] = useState("");

  useEffect(() => {
    async function loadData() {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return;

      const { data: profile } = await supabase
        .from("profiles")
        .select("phone")
        .eq("id", user.id)
        .single();
      if (profile?.phone) setPhone(profile.phone);

      const { data: linkedStudentsData } = await supabase
        .from("parent_students")
        .select(`
          student_id,
          student:students (
            id,
            first_name,
            last_name,
            admission_number,
            class:classes ( name ),
            school:schools ( name, motto )
          )
        `)
        .eq("parent_id", user.id);

      if (!linkedStudentsData || linkedStudentsData.length === 0) {
        setLoading(false);
        return;
      }

      setLinkedStudents(linkedStudentsData as unknown as LinkedStudent[]);
      setSelectedStudentId(linkedStudentsData[0].student_id);

      const sid = linkedStudentsData[0].student_id;

      const [feeRes, payRes] = await Promise.all([
        supabase.rpc("get_student_fee_breakdown", { p_student_id: sid }),
        supabase
          .from("payments")
          .select("id, amount, payment_date, receipt_number, method, status")
          .eq("student_id", sid)
          .order("payment_date", { ascending: false }),
      ]);

      if (feeRes.data) {
        setFeeSummary(feeRes.data);
        setPayAmount(feeRes.data.balance?.toString() ?? "");
      }
      if (payRes.data) setPayments(payRes.data);

      setLoading(false);
    }

    loadData();
  }, [supabase]);

  function openPayModal() {
    setPayPhone(phone);
    setPayAmount(feeSummary?.balance?.toString() ?? "");
    setPayState("idle");
    setPayError("");
    setShowPayModal(true);
  }

  async function handlePayment() {
    if (!payPhone || !payAmount) {
      setPayError("Please enter phone number and amount.");
      return;
    }

    setPayState("processing");
    setPayError("");

    try {
      const res = await fetch("/api/payments/stk-push", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          student_id: selectedStudentId,
          phone: payPhone,
          amount: parseFloat(payAmount),
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Payment failed");

      setPayState("success");
    } catch (err: any) {
      setPayState("failed");
      setPayError(err.message ?? "Something went wrong. Please try again.");
    }
  }

  if (loading) {
    return (
      <div className="mx-auto max-w-lg space-y-4 p-4">
        {[1, 2, 3].map((i) => (
          <div key={i} className="h-40 animate-pulse rounded-xl bg-gray-100" />
        ))}
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-lg p-4">
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        className="space-y-4"
      >
        {/* Child Selector - shown when multiple children exist */}
        {linkedStudents.length > 1 && (
          <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
            <div className="mb-3 flex items-center gap-2">
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-indigo-50">
                <Receipt className="h-5 w-5 text-indigo-600" />
              </div>
              <h2 className="text-sm font-semibold text-gray-900">Select Child</h2>
            </div>
            <div className="relative">
              <select
                value={selectedStudentId}
                onChange={(e) => {
                  setSelectedStudentId(e.target.value);
                  // Reload fee data for selected student
                  supabase.rpc("get_student_fee_breakdown", { p_student_id: e.target.value }).then(({ data }) => {
                    if (data) {
                      setFeeSummary(data);
                      setPayAmount(data.balance?.toString() ?? "");
                    }
                  });
                  supabase.from("payments").select("id, amount, payment_date, receipt_number, method, status").eq("student_id", e.target.value).order("payment_date", { ascending: false }).then(({ data }) => {
                    if (data) setPayments(data);
                  });
                }}
                className="w-full appearance-none rounded-lg border border-gray-300 bg-white px-4 py-3 pr-10 text-sm font-medium text-gray-700 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
              >
                {linkedStudents.map((ls) => (
                  <option key={ls.student_id} value={ls.student_id}>
                    {ls.student.first_name} {ls.student.last_name} — {ls.student.class?.name ?? "N/A"}
                  </option>
                ))}
              </select>
              <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
            </div>
          </div>
        )}

        {/* Fee Breakdown */}
        <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
          <div className="mb-4 flex items-center gap-2">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-indigo-50">
              <Receipt className="h-5 w-5 text-indigo-600" />
            </div>
            <h1 className="text-lg font-bold text-gray-900">
              Current Term Fees
            </h1>
          </div>

          {feeSummary && feeSummary.items && feeSummary.items.length > 0 ? (
            <>
              <div className="space-y-2">
                {feeSummary.items.map((item) => (
                  <div
                    key={item.id}
                    className="flex items-center justify-between rounded-lg bg-gray-50 px-3 py-2.5"
                  >
                    <span className="text-sm text-gray-700">{item.name}</span>
                    <span className="text-sm font-semibold text-gray-900">
                      {formatUGX(item.amount)}
                    </span>
                  </div>
                ))}
              </div>

              <div className="mt-4 space-y-2 border-t border-gray-200 pt-4">
                <div className="flex justify-between text-sm">
                  <span className="text-gray-500">Total Expected</span>
                  <span className="font-semibold text-gray-900">
                    {formatUGX(feeSummary.total_expected)}
                  </span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-500">Total Paid</span>
                  <span className="font-semibold text-green-600">
                    {formatUGX(feeSummary.total_paid)}
                  </span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-500">Balance</span>
                  <span
                    className={cn(
                      "font-bold",
                      feeSummary.balance > 0
                        ? "text-red-600"
                        : "text-green-600"
                    )}
                  >
                    {formatUGX(feeSummary.balance)}
                  </span>
                </div>
              </div>

              {feeSummary.balance > 0 && (
                <button
                  onClick={openPayModal}
                  className="mt-4 flex w-full items-center justify-center gap-2 rounded-lg bg-indigo-600 px-4 py-3.5 text-sm font-semibold text-white transition-colors hover:bg-indigo-700 active:bg-indigo-800"
                >
                  <CreditCard className="h-4 w-4" />
                  Pay Now
                </button>
              )}
            </>
          ) : (
            <p className="text-sm text-gray-500">
              No fee breakdown available for this term.
            </p>
          )}
        </div>

        {/* Payment History */}
        <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
          <h2 className="mb-3 text-base font-bold text-gray-900">
            Payment History
          </h2>

          {payments.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100 text-left text-xs font-medium text-gray-500">
                    <th className="pb-2 pr-3">Date</th>
                    <th className="pb-2 pr-3">Receipt #</th>
                    <th className="pb-2 pr-3">Method</th>
                    <th className="pb-2 pr-3 text-right">Amount</th>
                    <th className="pb-2 text-center">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {payments.map((p) => (
                    <tr key={p.id} className="hover:bg-gray-50">
                      <td className="py-2.5 pr-3 text-gray-700">
                        {formatDate(p.payment_date)}
                      </td>
                      <td className="py-2.5 pr-3 font-mono text-xs text-gray-600">
                        {p.receipt_number ?? "-"}
                      </td>
                      <td className="py-2.5 pr-3 text-gray-600">{p.method}</td>
                      <td className="py-2.5 pr-3 text-right font-semibold text-gray-900">
                        {formatUGX(p.amount)}
                      </td>
                      <td className="py-2.5 text-center">
                        <span
                          className={cn(
                            "inline-block rounded-full px-2 py-0.5 text-xs font-medium",
                            p.status === "completed"
                              ? "bg-green-100 text-green-700"
                              : p.status === "pending"
                              ? "bg-yellow-100 text-yellow-700"
                              : "bg-red-100 text-red-700"
                          )}
                        >
                          {p.status}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="text-sm text-gray-500">No payments recorded yet.</p>
          )}
        </div>
      </motion.div>

      {/* Payment Modal */}
      <AnimatePresence>
        {showPayModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 sm:items-center"
            onClick={() => payState !== "processing" && setShowPayModal(false)}
          >
            <motion.div
              initial={{ y: 100, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: 100, opacity: 0 }}
              onClick={(e) => e.stopPropagation()}
              className="w-full max-w-md rounded-t-2xl bg-white p-6 shadow-xl sm:rounded-2xl"
            >
              {/* Idle State */}
              {payState === "idle" && (
                <div>
                  <div className="mb-4 flex items-center justify-between">
                    <h3 className="text-lg font-bold text-gray-900">
                      Make Payment
                    </h3>
                    <button
                      onClick={() => setShowPayModal(false)}
                      className="rounded-full p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
                    >
                      <X className="h-5 w-5" />
                    </button>
                  </div>

                  <div className="space-y-4">
                    <div>
                      <label className="mb-1 block text-sm font-medium text-gray-700">
                        Phone Number
                      </label>
                      <input
                        type="tel"
                        placeholder="07XXXXXXXX"
                        value={payPhone}
                        onChange={(e) => setPayPhone(e.target.value)}
                        className="w-full rounded-lg border border-gray-300 px-4 py-3 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                      />
                    </div>

                    <div>
                      <label className="mb-1 block text-sm font-medium text-gray-700">
                        Amount (UGX)
                      </label>
                      <input
                        type="number"
                        value={payAmount}
                        onChange={(e) => setPayAmount(e.target.value)}
                        className="w-full rounded-lg border border-gray-300 px-4 py-3 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                      />
                    </div>

                    {payError && (
                      <p className="text-sm text-red-600">{payError}</p>
                    )}

                    <button
                      onClick={handlePayment}
                      className="flex w-full items-center justify-center gap-2 rounded-lg bg-indigo-600 px-4 py-3.5 text-sm font-semibold text-white transition-colors hover:bg-indigo-700 active:bg-indigo-800"
                    >
                      <CreditCard className="h-4 w-4" />
                      Confirm Payment
                    </button>
                  </div>
                </div>
              )}

              {/* Processing State */}
              {payState === "processing" && (
                <div className="flex flex-col items-center py-8">
                  <Loader2 className="h-12 w-12 animate-spin text-indigo-600" />
                  <p className="mt-4 text-base font-semibold text-gray-900">
                    Check your phone
                  </p>
                  <p className="mt-1 text-sm text-gray-500">
                    Enter your M-PIN on your phone to complete the payment...
                  </p>
                </div>
              )}

              {/* Success State */}
              {payState === "success" && (
                <motion.div
                  initial={{ scale: 0.8, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  className="flex flex-col items-center py-6"
                >
                  <div className="flex h-16 w-16 items-center justify-center rounded-full bg-green-100">
                    <CheckCircle2 className="h-10 w-10 text-green-600" />
                  </div>
                  <p className="mt-4 text-lg font-bold text-gray-900">
                    Payment Successful!
                </p>
                  <p className="mt-1 text-sm text-gray-500">
                    Your payment of {formatUGX(parseFloat(payAmount))} has been
                    received.
                  </p>
                  <button
                    onClick={() => setShowPayModal(false)}
                    className="mt-6 rounded-lg bg-gray-100 px-6 py-2.5 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-200"
                  >
                    Close
                  </button>
                </motion.div>
              )}

              {/* Failed State */}
              {payState === "failed" && (
                <motion.div
                  initial={{ scale: 0.8, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  className="flex flex-col items-center py-6"
                >
                  <div className="flex h-16 w-16 items-center justify-center rounded-full bg-red-100">
                    <XCircle className="h-10 w-10 text-red-600" />
                  </div>
                  <p className="mt-4 text-lg font-bold text-gray-900">
                    Payment Failed
                  </p>
                  <p className="mt-1 text-center text-sm text-gray-500">
                    {payError}
                  </p>
                  <div className="mt-6 flex gap-3">
                    <button
                      onClick={() => setShowPayModal(false)}
                      className="rounded-lg bg-gray-100 px-6 py-2.5 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-200"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={handlePayment}
                      className="rounded-lg bg-indigo-600 px-6 py-2.5 text-sm font-medium text-white transition-colors hover:bg-indigo-700"
                    >
                      Retry
                    </button>
                  </div>
                </motion.div>
              )}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

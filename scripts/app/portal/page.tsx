"use client";

import { useEffect, useReducer, useState } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import { useSupabaseBrowser } from "@/lib/supabase/client";
import { usePortal } from "@/app/portal/PortalContext";
import { cn } from "@/lib/utils/cn";
import { formatUGX } from "@/lib/utils/currency";
import { formatDate } from "@/lib/utils/dates";
import {
  CreditCard,
  TrendingUp,
  CalendarCheck,
  Megaphone,
  AlertTriangle,
  Download,
  Loader2,
  GraduationCap,
  ChevronDown,
} from "lucide-react";

interface FeeSummary {
  total_due: number;
  total_paid: number;
  balance: number;
}

interface Payment {
  id: string;
  amount: number;
  payment_date: string;
  receipt_number: string;
  payment_method: string;
}

interface SubjectResult {
  subject: string;
  marks: number;
  grade: string;
  remark: string;
}

interface AttendanceSummary {
  days_present: number;
  days_absent: number;
  total_days: number;
  percentage: number;
}

interface Announcement {
  id: string;
  title: string;
  body: string | null;
  created_at: string;
}

const stagger = {
  hidden: { opacity: 0 },
  show: {
    opacity: 1,
    transition: { staggerChildren: 0.08 },
  },
};

const fadeUp = {
  hidden: { opacity: 0, y: 16 },
  show: { opacity: 1, y: 0, transition: { duration: 0.3 } },
};

export default function PortalDashboard() {
  const supabase = useSupabaseBrowser();
  const {
    linkedStudents,
    selectedStudentId,
    setSelectedStudentId,
    selectedStudent,
    loading: contextLoading,
    loadError: contextLoadError,
    termIdByStudent,
    refresh: refreshPortal,
  } = usePortal();

  // Per-student data, held in a single useReducer so the React 19
  // `set-state-in-effect` rule sees dispatched actions instead of
  // inline setState calls. Each effect turn dispatches at most one
  // action. The proper React Query migration is tracked in audit
  // 5.9 / Phase 5; until then, useReducer is the React-19-friendly
  // way to model "fetch-on-key-change" state.
  type PerStudent = {
    loading: boolean;
    feeSummary: FeeSummary | null;
    payments: Payment[];
    results: SubjectResult[];
    classPosition: number | null;
    attendance: AttendanceSummary | null;
    announcements: Announcement[];
  };
  type PerStudentAction =
    | { type: "reset" }
    | { type: "loading" }
    | { type: "data"; payload: Omit<PerStudent, "loading"> };

  const EMPTY: PerStudent = {
    loading: false,
    feeSummary: null,
    payments: [],
    results: [],
    classPosition: null,
    attendance: null,
    announcements: [],
  };

  function perStudentReducer(state: PerStudent, action: PerStudentAction): PerStudent {
    switch (action.type) {
      case "reset":
        return EMPTY;
      case "loading":
        return { ...state, loading: true };
      case "data":
        return { loading: false, ...action.payload };
    }
  }

  const [perStudent, dispatch] = useReducer(perStudentReducer, EMPTY);
  const [stkLoading, setStkLoading] = useState(false);

  // Reload per-student data whenever the selected child changes.
  // Dispatches a single action; the actual fetch lives in the async
  // function called from the effect.
  useEffect(() => {
    if (!selectedStudentId) {
      dispatch({ type: "reset" });
      return;
    }

    let cancelled = false;
    dispatch({ type: "loading" });

    async function loadForStudent() {
      const sid = selectedStudentId;
      const termId: string | null = termIdByStudent.get(sid) ?? null;

      const [feeRes, payRes, resultRes, attendRes, announceRes] =
        await Promise.allSettled([
          supabase.rpc("get_student_fee_summary", {
            p_student_id: sid,
            p_term_id: termId,
          } as never),
          supabase
            .from("fee_payments")
            .select("id, amount, payment_date, receipt_number, payment_method")
            .eq("student_id", sid)
            .order("payment_date", { ascending: false })
            .limit(5),
          supabase.rpc("get_student_current_results", {
            p_student_id: sid,
            p_term_id: termId,
          } as never),
          supabase.rpc("get_student_attendance_summary", {
            p_student_id: sid,
            p_term_id: termId,
          } as never),
          supabase
            .from("announcements")
            .select("id, title, body, created_at")
            .order("created_at", { ascending: false })
            .limit(5),
        ]);

      if (cancelled) return;

      const ok = <T,>(r: PromiseSettledResult<T>): T | null =>
        r.status === "fulfilled" ? r.value : null;
      const fee = ok(feeRes) as { data: unknown } | null;
      const pay = ok(payRes) as { data: unknown } | null;
      const resultR = ok(resultRes) as { data: unknown } | null;
      const attend = ok(attendRes) as { data: unknown } | null;
      const announce = ok(announceRes) as { data: unknown } | null;

      const rd =
        (resultR?.data as { subjects?: SubjectResult[]; class_position?: number | null } | null) ??
        null;

      dispatch({
        type: "data",
        payload: {
          feeSummary: (fee?.data as FeeSummary | null) ?? null,
          payments: (pay?.data as Payment[] | null) ?? [],
          results: rd?.subjects ?? [],
          classPosition: rd?.class_position ?? null,
          attendance: (attend?.data as AttendanceSummary | null) ?? null,
          announcements: (announce?.data as Announcement[] | null) ?? [],
        },
      });
    }

    loadForStudent();
    return () => {
      cancelled = true;
    };
  }, [selectedStudentId, termIdByStudent, supabase]);

  const { feeSummary, payments, results, classPosition, attendance, announcements, loading: dataLoading } = perStudent;

  async function handleStkPush() {
    if (!feeSummary || feeSummary.balance <= 0) return;
    setStkLoading(true);

    try {
      const res = await fetch("/api/fees/stk-push", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          student_id: selectedStudentId,
          amount: feeSummary.balance,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "STK push failed");
      alert("Check your phone and enter your M-PIN to complete payment.");
    } catch (err: unknown) {
      const message =
        err instanceof Error
          ? err.message
          : "Payment initiation failed. Please try again.";
      alert(message);
    } finally {
      setStkLoading(false);
    }
  }

  if (contextLoading) {
    return (
      <div className="mx-auto max-w-lg space-y-4 p-4">
        {[1, 2, 3, 4, 5].map((i) => (
          <div
            key={i}
            className="h-32 animate-pulse rounded-xl bg-bg-tertiary"
          />
        ))}
      </div>
    );
  }

  // Audit 2.1, 3.66: surface parent-friendly states instead of silent
  // empty cards when the API errors or returns no children.
  if (contextLoadError) {
    return (
      <div className="mx-auto max-w-lg p-4">
        <div
          role="alert"
          aria-live="assertive"
          className="rounded-xl border border-danger-100 bg-danger-50 p-5 text-sm text-danger-700 dark:border-danger-800 dark:bg-danger-900/20 dark:text-danger-300"
        >
          <p className="font-semibold">{contextLoadError}</p>
          <button
            type="button"
            onClick={() => void refreshPortal()}
            className="mt-3 inline-flex items-center gap-1.5 rounded-lg bg-danger-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-danger-700"
          >
            Try again
          </button>
        </div>
      </div>
    );
  }

  if (linkedStudents.length === 0) {
    return (
      <div className="mx-auto max-w-lg p-4">
        <div className="rounded-xl border border-border bg-card p-6 text-center shadow-sm">
          <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-warning-50">
            <GraduationCap className="h-6 w-6 text-warning-600" />
          </div>
          <h2 className="text-base font-semibold text-heading">No children linked</h2>
          <p className="mt-1 text-sm text-muted">
            We could not find any children linked to your account. Please contact
            your school to link your child&apos;s record to your phone number.
          </p>
        </div>
      </div>
    );
  }

  // Orphan handling: a child whose school row is missing (audit 3.14).
  const orphanSchool = selectedStudent && !selectedStudent.student.school;

  return (
    <motion.div
      variants={stagger}
      initial="hidden"
      animate="show"
      className="mx-auto max-w-lg space-y-4 p-4"
    >
      {/* Child Selector - shown when multiple children exist */}
      {linkedStudents.length > 1 && (
        <motion.div
          variants={fadeUp}
          className="rounded-xl border border-border bg-card p-5 shadow-sm"
        >
          <div className="mb-3 flex items-center gap-2">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-warning-50">
              <GraduationCap className="h-5 w-5 text-warning-600" />
            </div>
            <h2 className="text-sm font-semibold text-heading">Select Child</h2>
          </div>
          <div className="relative">
            <select
              value={selectedStudentId}
              onChange={(e) => setSelectedStudentId(e.target.value)}
              className="w-full appearance-none rounded-lg border border-border bg-card px-4 py-3 pr-10 text-sm font-medium text-heading focus:border-border-strong focus:outline-none focus:ring-1 focus:ring-brand-100"
            >
              {linkedStudents.map((ls) => (
                <option key={ls.student_id} value={ls.student_id}>
                  {ls.student.full_name} - {ls.student.class?.name ?? "N/A"}
                </option>
              ))}
            </select>
            <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
          </div>
        </motion.div>
      )}

      {/* Orphan-child banner: a child whose `student.school` is null
          means the school's row was deleted but the student record
          wasn't. All downstream RPCs would return no rows. Surface
          this so the parent knows to contact the school. */}
      {orphanSchool && (
        <motion.div
          variants={fadeUp}
          role="alert"
          className="rounded-xl border border-warning-100 bg-warning-50 p-4 text-sm text-warning-700 dark:border-warning-800 dark:bg-warning-900/20 dark:text-warning-300"
        >
          <p className="font-semibold">School record missing</p>
          <p className="mt-0.5 text-xs opacity-90">
            We could not find {selectedStudent?.student.full_name}&apos;s school
            record. Please ask the school administrator to add the child back
            to the school.
          </p>
        </motion.div>
      )}

      {/* Fee Status Card */}
      <motion.div
        variants={fadeUp}
        className="rounded-xl border border-border bg-card p-5 shadow-sm"
      >
        <div className="mb-3 flex items-center gap-2">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-warning-50">
            <CreditCard className="h-5 w-5 text-warning-600" />
          </div>
          <h2 className="text-sm font-semibold text-heading">Fee Status</h2>
        </div>

        {dataLoading && !feeSummary ? (
          <div className="h-20 animate-pulse rounded-lg bg-bg-tertiary" />
        ) : feeSummary ? (
          <>
            <div className="grid grid-cols-3 gap-3 text-center">
              <div>
                <p className="text-xs text-muted">Expected</p>
                <p className="text-sm font-bold text-heading">
                  {formatUGX(feeSummary.total_due)}
                </p>
              </div>
              <div>
                <p className="text-xs text-muted">Paid</p>
                <p className="text-sm font-bold text-success-600">
                  {formatUGX(feeSummary.total_paid)}
                </p>
              </div>
              <div>
                <p className="text-xs text-muted">Balance</p>
                <p
                  className={cn(
                    "text-sm font-bold",
                    feeSummary.balance > 0 ? "text-danger-600" : "text-success-600"
                  )}
                >
                  {formatUGX(feeSummary.balance)}
                </p>
              </div>
            </div>

            {feeSummary.balance > 0 && (
              <button
                onClick={handleStkPush}
                disabled={stkLoading}
                className="mt-4 flex w-full items-center justify-center gap-2 rounded-lg bg-bg-tertiary px-4 py-3 text-sm font-semibold text-white transition-colors hover:bg-card-hover active:bg-bg-tertiary disabled:opacity-50"
              >
                {stkLoading ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <CreditCard className="h-4 w-4" />
                )}
                {stkLoading ? "Processing..." : "Pay Now"}
              </button>
            )}
          </>
        ) : (
          <p className="text-sm text-muted">
            {selectedStudentId
              ? "No fee records found for the current term."
              : "Select a child to see fee status."}
          </p>
        )}
      </motion.div>

      {/* Recent Payments */}
      <motion.div
        variants={fadeUp}
        className="rounded-xl border border-border bg-card p-5 shadow-sm"
      >
        <div className="mb-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-success-50">
              <TrendingUp className="h-5 w-5 text-success-600" />
            </div>
            <h2 className="text-sm font-semibold text-heading">
              Recent Payments
            </h2>
          </div>
          <Link
            href="/portal/fees"
            className="text-xs font-medium text-warning-600 hover:underline"
          >
            View all
          </Link>
        </div>

        {payments.length > 0 ? (
          <div className="space-y-2.5">
            {payments.map((p) => (
              <div
                key={p.id}
                className="flex items-center justify-between rounded-lg bg-bg-tertiary px-3 py-2.5"
              >
                <div>
                  <p className="text-sm font-medium text-heading">
                    {formatUGX(p.amount)}
                  </p>
                  <p className="text-xs text-muted">
                    {formatDate(p.payment_date)} - {p.payment_method}
                  </p>
                </div>
                <button
                  className="flex items-center gap-1 rounded-md px-2 py-1 text-xs text-warning-600 transition-colors hover:bg-card-hover"
                  title="Download receipt"
                  aria-label="Download receipt"
                >
                  <Download className="h-3.5 w-3.5" />
                </button>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm text-muted">No payments recorded yet.</p>
        )}
      </motion.div>

      {/* Latest Results */}
      <motion.div
        variants={fadeUp}
        className="rounded-xl border border-border bg-card p-5 shadow-sm"
      >
        <div className="mb-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-bg-tertiary">
              <TrendingUp className="h-5 w-5 text-secondary" />
            </div>
            <h2 className="text-sm font-semibold text-heading">
              Latest Results
            </h2>
          </div>
          <Link
            href="/portal/results"
            className="text-xs font-medium text-warning-600 hover:underline"
          >
            View all
          </Link>
        </div>

        {results.length > 0 ? (
          <>
            <div className="mb-3 overflow-hidden rounded-lg border border-border">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-bg-tertiary text-left text-xs font-medium text-muted">
                    <th className="px-3 py-2">Subject</th>
                    <th className="px-3 py-2 text-center">Marks</th>
                    <th className="px-3 py-2 text-center">Grade</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {results.slice(0, 6).map((r) => (
                    <tr key={r.subject}>
                      <td className="px-3 py-2 text-heading">{r.subject}</td>
                      <td className="px-3 py-2 text-center font-medium">{r.marks}</td>
                      <td className="px-3 py-2 text-center">
                        <span
                          className={cn(
                            "inline-block rounded-full px-2 py-0.5 text-xs font-semibold",
                            r.grade === "A"
                              ? "bg-success-50 text-success-700 dark:bg-success-900/30 dark:text-success-400"
                              : r.grade === "B"
                              ? "bg-brand-50 text-brand-700 dark:bg-brand-900/30 dark:text-brand-400"
                              : r.grade === "C"
                              ? "bg-warning-50 text-warning-600"
                              : r.grade === "D"
                              ? "bg-orange-100 text-orange-700"
                              : "bg-danger-50 text-danger-600"
                          )}
                        >
                          {r.grade}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {classPosition !== null && (
              <p className="text-center text-sm text-muted">
                Class Position:{" "}
                <span className="font-bold text-warning-600">
                  {classPosition}
                </span>
              </p>
            )}
          </>
        ) : (
          <p className="text-sm text-muted">
            No results published yet this term.
          </p>
        )}
      </motion.div>

      {/* Attendance Summary */}
      <motion.div
        variants={fadeUp}
        className="rounded-xl border border-border bg-card p-5 shadow-sm"
      >
        <div className="mb-3 flex items-center gap-2">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-bg-tertiary">
            <CalendarCheck className="h-5 w-5 text-secondary" />
          </div>
          <h2 className="text-sm font-semibold text-heading">Attendance</h2>
        </div>

        {attendance ? (
          <>
            <div className="mb-3 flex items-end justify-between">
              <div>
                <p className="text-3xl font-bold text-heading">
                  {attendance.percentage}%
                </p>
                <p className="text-xs text-muted">
                  {attendance.days_present} of {attendance.total_days} days
                  present
                </p>
              </div>
              {attendance.percentage < 85 && (
                <div className="flex items-center gap-1 rounded-full bg-danger-50 px-2.5 py-1 text-xs font-medium text-danger-600">
                  <AlertTriangle className="h-3.5 w-3.5" />
                  Below 85%
                </div>
              )}
            </div>
            <div className="h-2.5 w-full overflow-hidden rounded-full bg-bg-tertiary">
              <motion.div
                initial={{ width: 0 }}
                animate={{ width: `${attendance.percentage}%` }}
                transition={{ duration: 0.8, ease: "easeOut" }}
                // Audit 5.16: all three thresholds were bg-bg-tertiary
                // which gave no visual feedback. Now they use the
                // brand semantic palette: success-500 for healthy
                // (>= 85%), warning-500 for at-risk (70-84%), and
                // danger-500 for critical (< 70%).
                className={cn(
                  "h-full rounded-full",
                  attendance.percentage >= 85
                    ? "bg-success-500"
                    : attendance.percentage >= 70
                    ? "bg-warning-500"
                    : "bg-danger-500"
                )}
              />
            </div>
          </>
        ) : (
          <p className="text-sm text-muted">No attendance data available.</p>
        )}
      </motion.div>

      {/* School Messages */}
      <motion.div
        variants={fadeUp}
        className="rounded-xl border border-border bg-card p-5 shadow-sm"
      >
        <div className="mb-3 flex items-center gap-2">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-warning-50">
            <Megaphone className="h-5 w-5 text-warning-600" />
          </div>
          <h2 className="text-sm font-semibold text-heading">
            School Messages
          </h2>
        </div>

        {announcements.length > 0 ? (
          <div className="space-y-3">
            {announcements.map((a) => (
              <div
                key={a.id}
                className="rounded-lg border border-border p-3 transition-colors hover:bg-card-hover"
              >
                <p className="text-sm font-medium text-heading">{a.title}</p>
                <p className="mt-0.5 line-clamp-2 text-xs text-muted">
                  {a.body}
                </p>
                <p className="mt-1 text-xs text-muted">
                  {formatDate(a.created_at)}
                </p>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm text-muted">No announcements yet.</p>
        )}
      </motion.div>
    </motion.div>
  );
}

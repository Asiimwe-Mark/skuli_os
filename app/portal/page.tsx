"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import { createBrowserClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils/cn";
import { formatUGX } from "@/lib/utils/currency";
import { formatDate } from "@/lib/utils/dates";
import {
  CreditCard,
  TrendingUp,
  CalendarCheck,
  Megaphone,
  AlertTriangle,
  ChevronRight,
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
  method: string;
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
  body: string;
  created_at: string;
}

interface LinkedStudent {
  student_id: string;
  student: {
    id: string;
    full_name: string;
    admission_number: string | null;
    class: { id: string; name: string } | null;
    school: { id: string; name: string; motto: string | null } | null;
  };
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
  const supabase = createBrowserClient();
  const [loading, setLoading] = useState(true);
  const [linkedStudents, setLinkedStudents] = useState<LinkedStudent[]>([]);
  const [selectedStudentId, setSelectedStudentId] = useState<string>("");

  const [feeSummary, setFeeSummary] = useState<FeeSummary | null>(null);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [results, setResults] = useState<SubjectResult[]>([]);
  const [classPosition, setClassPosition] = useState<number | null>(null);
  const [attendance, setAttendance] = useState<AttendanceSummary | null>(null);
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [stkLoading, setStkLoading] = useState(false);

  useEffect(() => {
    async function loadDashboard() {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return;

      const { data: linkedStudentsData } = await supabase
        .from("students")
        .select(`
          id,
          full_name,
          admission_number,
          class:classes(id, name),
          school:schools(id, name, motto)
        `)
        .eq("parent_id", user.id);

      if (!linkedStudentsData || linkedStudentsData.length === 0) {
        setLoading(false);
        return;
      }

      const mappedStudents: LinkedStudent[] = linkedStudentsData.map((s: any) => ({
        student_id: s.id,
        student: {
          id: s.id,
          full_name: s.full_name,
          admission_number: s.admission_number,
          class: s.class,
          school: s.school,
        },
      }));

      setLinkedStudents(mappedStudents);
      setSelectedStudentId(mappedStudents[0].student_id);

      const sid = mappedStudents[0].student_id;

      const [feeRes, payRes, resultRes, attendRes, announceRes] =
        await Promise.all([
          supabase.rpc("get_student_fee_summary", { p_student_id: sid }),
          supabase
            .from("fee_payments")
            .select("id, amount, payment_date, receipt_number, method")
            .eq("student_id", sid)
            .order("payment_date", { ascending: false })
            .limit(5),
          supabase.rpc("get_student_current_results", { p_student_id: sid }),
          supabase.rpc("get_student_attendance_summary", { p_student_id: sid }),
          supabase
            .from("announcements")
            .select("id, title, body, created_at")
            .order("created_at", { ascending: false })
            .limit(5),
        ]);

      if (feeRes.data) setFeeSummary(feeRes.data);
      if (payRes.data) setPayments(payRes.data);
      if (resultRes.data) {
        setResults(resultRes.data.subjects ?? []);
        setClassPosition(resultRes.data.class_position ?? null);
      }
      if (attendRes.data) setAttendance(attendRes.data);
      if (announceRes.data) setAnnouncements(announceRes.data);

      setLoading(false);
    }

    loadDashboard();
  }, [supabase]);

  async function handleStkPush() {
    if (!feeSummary || feeSummary.balance <= 0) return;
    setStkLoading(true);

    try {
      const res = await fetch("/api/payments/stk-push", {
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
      const message = err instanceof Error ? err.message : "Payment initiation failed. Please try again.";
      alert(message);
    } finally {
      setStkLoading(false);
    }
  }

  if (loading) {
    return (
      <div className="mx-auto max-w-lg space-y-4 p-4">
        {[1, 2, 3, 4, 5].map((i) => (
          <div
            key={i}
            className="h-32 animate-pulse rounded-xl bg-gray-100"
          />
        ))}
      </div>
    );
  }

  return (
    <motion.div
      variants={stagger}
      initial="hidden"
      animate="show"
      className="mx-auto max-w-lg space-y-4 p-4"
    >
      {/* Child Selector - shown when multiple children exist */}
      {linkedStudents.length > 1 && (
        <motion.div variants={fadeUp} className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
          <div className="mb-3 flex items-center gap-2">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-amber/10">
              <GraduationCap className="h-5 w-5 text-amber" />
            </div>
            <h2 className="text-sm font-semibold text-gray-900">Select Child</h2>
          </div>
          <div className="relative">
            <select
              value={selectedStudentId}
              onChange={(e) => setSelectedStudentId(e.target.value)}
              className="w-full appearance-none rounded-lg border border-gray-300 bg-white px-4 py-3 pr-10 text-sm font-medium text-gray-700 focus:border-amber focus:outline-none focus:ring-1 focus:ring-amber"
            >
              {linkedStudents.map((ls) => (
                <option key={ls.student_id} value={ls.student_id}>
                  {ls.student.full_name} — {ls.student.class?.name ?? "N/A"}
                </option>
              ))}
            </select>
            <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
          </div>
        </motion.div>
      )}

      {/* Fee Status Card */}
      <motion.div variants={fadeUp} className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
        <div className="mb-3 flex items-center gap-2">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-amber/10">
            <CreditCard className="h-5 w-5 text-amber" />
          </div>
          <h2 className="text-sm font-semibold text-gray-900">Fee Status</h2>
        </div>

        {feeSummary ? (
          <>
            <div className="grid grid-cols-3 gap-3 text-center">
              <div>
                <p className="text-xs text-gray-500">Expected</p>
                <p className="text-sm font-bold text-gray-900">
                  {formatUGX(feeSummary.total_due)}
                </p>
              </div>
              <div>
                <p className="text-xs text-gray-500">Paid</p>
                <p className="text-sm font-bold text-green-600">
                  {formatUGX(feeSummary.total_paid)}
                </p>
              </div>
              <div>
                <p className="text-xs text-gray-500">Balance</p>
                <p
                  className={cn(
                    "text-sm font-bold",
                    feeSummary.balance > 0 ? "text-red-600" : "text-green-600"
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
                className="mt-4 flex w-full items-center justify-center gap-2 rounded-lg bg-amber px-4 py-3 text-sm font-semibold text-white transition-colors hover:bg-amber/90 active:bg-amber/80 disabled:opacity-50"
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
          <p className="text-sm text-gray-500">No fee records found.</p>
        )}
      </motion.div>

      {/* Recent Payments */}
      <motion.div variants={fadeUp} className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
        <div className="mb-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-green-50">
              <TrendingUp className="h-5 w-5 text-green-600" />
            </div>
            <h2 className="text-sm font-semibold text-gray-900">
              Recent Payments
            </h2>
          </div>
          <Link
            href="/portal/fees"
            className="text-xs font-medium text-amber hover:underline"
          >
            View all
          </Link>
        </div>

        {payments.length > 0 ? (
          <div className="space-y-2.5">
            {payments.map((p) => (
              <div
                key={p.id}
                className="flex items-center justify-between rounded-lg bg-gray-50 px-3 py-2.5"
              >
                <div>
                  <p className="text-sm font-medium text-gray-900">
                    {formatUGX(p.amount)}
                  </p>
                  <p className="text-xs text-gray-500">
                    {formatDate(p.payment_date)} &middot; {p.method}
                  </p>
                </div>
                <button
                  className="flex items-center gap-1 rounded-md px-2 py-1 text-xs text-amber transition-colors hover:bg-amber/10"
                  title="Download receipt"
                >
                  <Download className="h-3.5 w-3.5" />
                </button>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm text-gray-500">No payments recorded yet.</p>
        )}
      </motion.div>

      {/* Latest Results */}
      <motion.div variants={fadeUp} className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
        <div className="mb-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-purple-50">
              <TrendingUp className="h-5 w-5 text-purple-600" />
            </div>
            <h2 className="text-sm font-semibold text-gray-900">
              Latest Results
            </h2>
          </div>
          <Link
            href="/portal/results"
            className="text-xs font-medium text-amber hover:underline"
          >
            View all
          </Link>
        </div>

        {results.length > 0 ? (
          <>
            <div className="mb-3 overflow-hidden rounded-lg border border-gray-100">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-50 text-left text-xs font-medium text-gray-500">
                    <th className="px-3 py-2">Subject</th>
                    <th className="px-3 py-2 text-center">Marks</th>
                    <th className="px-3 py-2 text-center">Grade</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {results.slice(0, 6).map((r) => (
                    <tr key={r.subject}>
                      <td className="px-3 py-2 text-gray-900">{r.subject}</td>
                      <td className="px-3 py-2 text-center font-medium">
                        {r.marks}
                      </td>
                      <td className="px-3 py-2 text-center">
                        <span
                          className={cn(
                            "inline-block rounded-full px-2 py-0.5 text-xs font-semibold",
                            r.grade === "A"
                              ? "bg-green-100 text-green-700"
                              : r.grade === "B"
                              ? "bg-blue-100 text-blue-700"
                              : r.grade === "C"
                              ? "bg-yellow-100 text-yellow-700"
                              : r.grade === "D"
                              ? "bg-orange-100 text-orange-700"
                              : "bg-red-100 text-red-700"
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
              <p className="text-center text-sm text-gray-600">
                Class Position:{" "}
                <span className="font-bold text-amber">
                  {classPosition}
                </span>
              </p>
            )}
          </>
        ) : (
          <p className="text-sm text-gray-500">
            No results published yet this term.
          </p>
        )}
      </motion.div>

      {/* Attendance Summary */}
      <motion.div variants={fadeUp} className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
        <div className="mb-3 flex items-center gap-2">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-blue-50">
            <CalendarCheck className="h-5 w-5 text-blue-600" />
          </div>
          <h2 className="text-sm font-semibold text-gray-900">Attendance</h2>
        </div>

        {attendance ? (
          <>
            <div className="mb-3 flex items-end justify-between">
              <div>
                <p className="text-3xl font-bold text-gray-900">
                  {attendance.percentage}%
                </p>
                <p className="text-xs text-gray-500">
                  {attendance.days_present} of {attendance.total_days} days
                  present
                </p>
              </div>
              {attendance.percentage < 85 && (
                <div className="flex items-center gap-1 rounded-full bg-red-50 px-2.5 py-1 text-xs font-medium text-red-600">
                  <AlertTriangle className="h-3.5 w-3.5" />
                  Below 85%
                </div>
              )}
            </div>
            <div className="h-2.5 w-full overflow-hidden rounded-full bg-gray-100">
              <motion.div
                initial={{ width: 0 }}
                animate={{ width: `${attendance.percentage}%` }}
                transition={{ duration: 0.8, ease: "easeOut" }}
                className={cn(
                  "h-full rounded-full",
                  attendance.percentage >= 85
                    ? "bg-green-500"
                    : attendance.percentage >= 70
                    ? "bg-yellow-500"
                    : "bg-red-500"
                )}
              />
            </div>
          </>
        ) : (
          <p className="text-sm text-gray-500">No attendance data available.</p>
        )}
      </motion.div>

      {/* School Messages */}
      <motion.div variants={fadeUp} className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
        <div className="mb-3 flex items-center gap-2">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-amber-50">
            <Megaphone className="h-5 w-5 text-amber-600" />
          </div>
          <h2 className="text-sm font-semibold text-gray-900">
            School Messages
          </h2>
        </div>

        {announcements.length > 0 ? (
          <div className="space-y-3">
            {announcements.map((a) => (
              <div
                key={a.id}
                className="rounded-lg border border-gray-100 p-3 transition-colors hover:bg-gray-50"
              >
                <p className="text-sm font-medium text-gray-900">{a.title}</p>
                <p className="mt-0.5 line-clamp-2 text-xs text-gray-600">
                  {a.body}
                </p>
                <p className="mt-1 text-xs text-gray-400">
                  {formatDate(a.created_at)}
                </p>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm text-gray-500">No announcements yet.</p>
        )}
      </motion.div>
    </motion.div>
  );
}

"use client";

import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { createBrowserClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils/cn";
import { formatDate } from "@/lib/utils/dates";
import {
  FileText,
  Download,
  ChevronDown,
  ArrowLeft,
  Loader2,
  GraduationCap,
} from "lucide-react";

interface Term {
  id: string;
  name: string;
  academic_year: string;
}

interface ReportCard {
  id: string;
  term_id: string;
  term_name: string;
  academic_year: string;
  published_at: string;
  total_marks: number;
  average_marks: number;
  aggregate: string;
  class_position: number;
  stream_position: number;
  total_students: number;
  subjects: {
    subject: string;
    marks: number;
    grade: string;
    remark: string;
    teacher_comment: string;
  }[];
  head_comment: string;
  class_teacher_comment: string;
}

export default function PortalResultsPage() {
  const supabase = createBrowserClient();
  const [loading, setLoading] = useState(true);
  const [terms, setTerms] = useState<Term[]>([]);
  const [selectedTermId, setSelectedTermId] = useState<string>("");
  const [reportCards, setReportCards] = useState<ReportCard[]>([]);
  const [viewingReport, setViewingReport] = useState<ReportCard | null>(null);
  const [schoolName, setSchoolName] = useState("");
  const [schoolMotto, setSchoolMotto] = useState("");
  const [studentName, setStudentName] = useState("");
  const [className, setClassName] = useState("");
  const [studentId, setStudentId] = useState("");
  const [downloadingPdf, setDownloadingPdf] = useState(false);

  useEffect(() => {
    async function loadData() {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return;

      const { data: parentStudent } = await supabase
        .from("parent_students")
        .select(
          `
          student:students (
            id,
            first_name,
            last_name,
            class:classes ( name ),
            school:schools ( name, motto )
          )
        `
        )
        .eq("parent_id", user.id)
        .limit(1)
        .single();

      if (!parentStudent) {
        setLoading(false);
        return;
      }

      const student = parentStudent.student as any;
      setStudentId(student.id);
      setStudentName(`${student.first_name} ${student.last_name}`);
      setClassName(student.class?.name ?? "");
      setSchoolName(student.school?.name ?? "");
      setSchoolMotto(student.school?.motto ?? "");

      const { data: termData } = await supabase
        .from("terms")
        .select("id, name, academic_year")
        .order("start_date", { ascending: false })
        .limit(10);

      if (termData && termData.length > 0) {
        setTerms(termData);
        setSelectedTermId(termData[0].id);
      }

      setLoading(false);
    }

    loadData();
  }, [supabase]);

  useEffect(() => {
    async function loadReportCards() {
      if (!selectedTermId) return;

      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return;

      const { data: parentStudent } = await supabase
        .from("parent_students")
        .select("student_id")
        .eq("parent_id", user.id)
        .limit(1)
        .single();

      if (!parentStudent) return;

      const { data } = await supabase
        .from("report_cards")
        .select("*")
        .eq("student_id", parentStudent.student_id)
        .eq("term_id", selectedTermId)
        .eq("is_published", true);

      setReportCards(data ?? []);
    }

    loadReportCards();
  }, [supabase, selectedTermId]);

  if (loading) {
    return (
      <div className="mx-auto max-w-lg space-y-4 p-4">
        <div className="h-10 animate-pulse rounded-lg bg-gray-100" />
        <div className="h-60 animate-pulse rounded-xl bg-gray-100" />
        <div className="h-60 animate-pulse rounded-xl bg-gray-100" />
      </div>
    );
  }

  if (viewingReport) {
    return (
      <div className="mx-auto max-w-lg p-4">
        <motion.div
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
        >
          <button
            onClick={() => setViewingReport(null)}
            className="mb-4 flex items-center gap-1.5 text-sm font-medium text-indigo-600 hover:underline"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to results
          </button>

          {/* Report Card */}
          <div className="rounded-xl border border-gray-200 bg-white shadow-sm">
            {/* Header */}
            <div className="border-b border-gray-200 p-5 text-center">
              <div className="mx-auto mb-2 flex h-14 w-14 items-center justify-center rounded-full bg-indigo-50">
                <GraduationCap className="h-8 w-8 text-indigo-600" />
              </div>
              <h1 className="text-lg font-bold text-gray-900">
                {schoolName}
              </h1>
              {schoolMotto && (
                <p className="text-xs italic text-gray-500">
                  &ldquo;{schoolMotto}&rdquo;
                </p>
              )}
              <p className="mt-2 text-sm font-semibold text-indigo-600">
                Student Report Card
              </p>
              <p className="text-xs text-gray-500">
                {viewingReport.term_name} &middot;{" "}
                {viewingReport.academic_year}
              </p>
            </div>

            {/* Student Info */}
            <div className="grid grid-cols-2 gap-3 border-b border-gray-100 p-5 text-sm">
              <div>
                <p className="text-gray-500">Name</p>
                <p className="font-medium text-gray-900">{studentName}</p>
              </div>
              <div>
                <p className="text-gray-500">Class</p>
                <p className="font-medium text-gray-900">{className}</p>
              </div>
              <div>
                <p className="text-gray-500">Position</p>
                <p className="font-medium text-gray-900">
                  {viewingReport.class_position} of{" "}
                  {viewingReport.total_students}
                </p>
              </div>
              <div>
                <p className="text-gray-500">Aggregate</p>
                <p className="font-bold text-indigo-600">
                  {viewingReport.aggregate}
                </p>
              </div>
            </div>

            {/* Marks Table */}
            <div className="p-5">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-200 text-left text-xs font-medium text-gray-500">
                    <th className="pb-2">Subject</th>
                    <th className="pb-2 text-center">Marks</th>
                    <th className="pb-2 text-center">Grade</th>
                    <th className="pb-2 text-right">Remark</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {viewingReport.subjects.map((s, i) => (
                    <tr key={i}>
                      <td className="py-2.5 text-gray-900">{s.subject}</td>
                      <td className="py-2.5 text-center font-medium">
                        {s.marks}
                      </td>
                      <td className="py-2.5 text-center">
                        <span
                          className={cn(
                            "inline-block rounded-full px-2 py-0.5 text-xs font-semibold",
                            s.grade === "A"
                              ? "bg-green-100 text-green-700"
                              : s.grade === "B"
                              ? "bg-blue-100 text-blue-700"
                              : s.grade === "C"
                              ? "bg-yellow-100 text-yellow-700"
                              : s.grade === "D"
                              ? "bg-orange-100 text-orange-700"
                              : "bg-red-100 text-red-700"
                          )}
                        >
                          {s.grade}
                        </span>
                      </td>
                      <td className="py-2.5 text-right text-xs text-gray-600">
                        {s.remark}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Summary */}
            <div className="grid grid-cols-2 gap-3 border-t border-gray-100 p-5 text-sm">
              <div>
                <p className="text-gray-500">Total Marks</p>
                <p className="font-bold text-gray-900">
                  {viewingReport.total_marks}
                </p>
              </div>
              <div>
                <p className="text-gray-500">Average</p>
                <p className="font-bold text-gray-900">
                  {viewingReport.average_marks}%
                </p>
              </div>
            </div>

            {/* Comments */}
            <div className="space-y-3 border-t border-gray-100 p-5">
              {viewingReport.class_teacher_comment && (
                <div>
                  <p className="text-xs font-medium text-gray-500">
                    Class Teacher&apos;s Comment
                  </p>
                  <p className="mt-0.5 text-sm text-gray-700">
                    {viewingReport.class_teacher_comment}
                  </p>
                </div>
              )}
              {viewingReport.head_comment && (
                <div>
                  <p className="text-xs font-medium text-gray-500">
                    Head Teacher&apos;s Comment
                  </p>
                  <p className="mt-0.5 text-sm text-gray-700">
                    {viewingReport.head_comment}
                  </p>
                </div>
              )}
            </div>

            {/* Download PDF */}
            <div className="border-t border-gray-100 p-5">
              <button
                onClick={async () => {
                  setDownloadingPdf(true);
                  try {
                    const res = await fetch(
                      `/api/portal/report-card-pdf?student_id=${studentId}&term_id=${viewingReport.term_id}`
                    );
                    if (!res.ok) throw new Error("Failed to generate PDF");
                    const blob = await res.blob();
                    const url = URL.createObjectURL(blob);
                    const a = document.createElement("a");
                    a.href = url;
                    a.download = `report-card-${viewingReport.term_name}.pdf`;
                    a.click();
                    URL.revokeObjectURL(url);
                  } catch {
                    alert("Failed to download report card PDF.");
                  } finally {
                    setDownloadingPdf(false);
                  }
                }}
                disabled={downloadingPdf}
                className="flex w-full items-center justify-center gap-2 rounded-lg border border-gray-300 px-4 py-3 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50 disabled:opacity-50"
              >
                {downloadingPdf ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Download className="h-4 w-4" />
                )}
                Download PDF
              </button>
            </div>
          </div>
        </motion.div>
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
        <h1 className="text-lg font-bold text-gray-900">Results</h1>

        {/* Term Selector */}
        <div className="relative">
          <select
            value={selectedTermId}
            onChange={(e) => setSelectedTermId(e.target.value)}
            className="w-full appearance-none rounded-lg border border-gray-300 bg-white px-4 py-3 pr-10 text-sm font-medium text-gray-700 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
          >
            {terms.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name} - {t.academic_year}
              </option>
            ))}
          </select>
          <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
        </div>

        {/* Published Report Cards */}
        {reportCards.length > 0 ? (
          <div className="space-y-3">
            {reportCards.map((rc) => (
              <motion.button
                key={rc.id}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                onClick={() => setViewingReport(rc)}
                className="flex w-full items-center justify-between rounded-xl border border-gray-200 bg-white p-4 text-left shadow-sm transition-colors hover:border-indigo-200 hover:bg-indigo-50/30"
              >
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-purple-50">
                    <FileText className="h-5 w-5 text-purple-600" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-gray-900">
                      {rc.term_name} Report Card
                    </p>
                    <p className="text-xs text-gray-500">
                      Published {formatDate(rc.published_at)}
                    </p>
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-lg font-bold text-indigo-600">
                    {rc.aggregate}
                  </p>
                  <p className="text-xs text-gray-500">
                    Position {rc.class_position}/{rc.total_students}
                  </p>
                </div>
              </motion.button>
            ))}
          </div>
        ) : (
          <div className="rounded-xl border border-gray-200 bg-white p-8 text-center shadow-sm">
            <FileText className="mx-auto h-10 w-10 text-gray-300" />
            <p className="mt-3 text-sm font-medium text-gray-900">
              No report cards yet
            </p>
            <p className="mt-1 text-xs text-gray-500">
              Report cards for this term have not been published yet.
            </p>
          </div>
        )}
      </motion.div>
    </div>
  );
}

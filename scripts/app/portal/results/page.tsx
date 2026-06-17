"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { useSupabaseBrowser } from "@/lib/supabase/client";
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
import type { Tables } from "@/types/database";

// ─── Types ─────────────────────────────────────────────────────────────────────

type ReportCardRow = Tables<"report_cards">;

interface LinkedStudent {
  student_id: string;
  full_name: string;
  admission_number: string | null;
  class_name: string | null;
  school_name: string | null;
  school_motto: string | null;
}

interface TermOption {
  id: string;
  name: string;
  academic_year_id: string;
}

interface SubjectMarks {
  subject: string;
  bot: number | null;
  mid: number | null;
  eot: number | null;
  total: number;
  grade: string;
  remarks: string | null;
}

interface ReportCardDisplay {
  id: string;
  term_id: string;
  term_name: string;
  total_marks: number | null;
  average: number | null;
  position_in_class: number | null;
  class_size: number | null;
  class_teacher_comment: string | null;
  headmaster_comment: string | null;
  conduct_grade: string | null;
  subjects: SubjectMarks[];
}

// ─── Component ─────────────────────────────────────────────────────────────────

export default function PortalResultsPage() {
  const supabase = useSupabaseBrowser();

  const [loading, setLoading] = useState(true);
  const [linkedStudents, setLinkedStudents] = useState<LinkedStudent[]>([]);
  const [selectedStudentId, setSelectedStudentId] = useState<string>("");
  const [terms, setTerms] = useState<TermOption[]>([]);
  const [selectedTermId, setSelectedTermId] = useState<string>("");
  const [reportCards, setReportCards] = useState<ReportCardDisplay[]>([]);
  const [viewingReport, setViewingReport] = useState<ReportCardDisplay | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [downloadingPdf, setDownloadingPdf] = useState(false);
  const [selectedStudent, setSelectedStudent] = useState<LinkedStudent | null>(null);

  // ── Initial data load ────────────────────────────────────────────────────────

  useEffect(() => {
    async function loadData() {
      setLoading(true);
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) { setLoading(false); return; }

      // Get parent's contact details for student lookup
      const { data: userProfile } = await supabase
        .from("users")
        .select("phone, email")
        .eq("id", user.id)
        .single();

      // Find linked students by parent_phone or parent_email
      let studentQuery = supabase
        .from("students")
        .select(`
          id,
          full_name,
          admission_number,
          class:classes ( id, name ),
          school:schools ( id, name, motto )
        `)
        .eq("is_deleted", false)
        .eq("status", "active");

      if (userProfile?.phone) {
        studentQuery = studentQuery.eq("parent_phone", userProfile.phone);
      } else if (userProfile?.email) {
        studentQuery = studentQuery.eq("parent_email", userProfile.email);
      } else {
        setLoading(false);
        return;
      }

      const { data: studentsData } = await studentQuery;

      if (!studentsData || studentsData.length === 0) {
        setLoading(false);
        return;
      }

      const mapped: LinkedStudent[] = studentsData.map((s: any) => ({
        student_id: s.id,
        full_name: s.full_name,
        admission_number: s.admission_number,
        class_name: (s.class as { name: string } | null)?.name ?? null,
        school_name: (s.school as { name: string } | null)?.name ?? null,
        school_motto: (s.school as { motto: string | null } | null)?.motto ?? null,
      }));

      setLinkedStudents(mapped);
      setSelectedStudentId(mapped[0].student_id);
      setSelectedStudent(mapped[0]);

      // Load terms for the school
      const { data: termData } = await supabase
        .from("terms")
        .select("id, name, academic_year_id")
        .order("created_at", { ascending: false })
        .limit(10);

      if (termData && termData.length > 0) {
        setTerms(termData as TermOption[]);
        setSelectedTermId(termData[0].id);
      }

      setLoading(false);
    }

    loadData();
  }, [supabase]);

  // Update selectedStudent when selectedStudentId changes
  useEffect(() => {
    const found = linkedStudents.find((s) => s.student_id === selectedStudentId);
    if (found) setSelectedStudent(found);
  }, [selectedStudentId, linkedStudents]);

  // ── Load published report cards for selected student + term ─────────────────

  useEffect(() => {
    async function loadReportCards() {
      if (!selectedTermId || !selectedStudentId) return;

      // Query report_cards (summary row) — correct columns only
      const { data: cards } = await supabase
        .from("report_cards")
        .select(
          "id, student_id, term_id, total_marks, average, position_in_class, class_size, class_teacher_comment, headmaster_comment, conduct_grade, is_published"
        )
        .eq("student_id", selectedStudentId)
        .eq("term_id", selectedTermId)
        .eq("is_published", true)
        .eq("is_deleted", false);

      if (!cards || cards.length === 0) {
        setReportCards([]);
        return;
      }

      // For each report card, attach the per-subject marks from marks_pivoted
      const enriched: ReportCardDisplay[] = await Promise.all(
        (cards as ReportCardRow[]).map(async (card) => {
          const subjects = await fetchSubjectMarks(selectedStudentId, card.term_id);
          const term = terms.find((t) => t.id === card.term_id);
          return {
            id: card.id,
            term_id: card.term_id,
            term_name: term?.name ?? "Unknown Term",
            total_marks: card.total_marks,
            average: card.average,
            position_in_class: card.position_in_class,
            class_size: card.class_size,
            class_teacher_comment: card.class_teacher_comment,
            headmaster_comment: card.headmaster_comment,
            conduct_grade: card.conduct_grade,
            subjects,
          };
        })
      );

      setReportCards(enriched);
    }

    loadReportCards();
  }, [supabase, selectedTermId, selectedStudentId, terms]);

  // ── Fetch pivoted subject marks from marks_pivoted view ──────────────────────

  async function fetchSubjectMarks(studentId: string, termId: string): Promise<SubjectMarks[]> {
    // Query the marks_pivoted VIEW — contains bot_score, mid_score, eot_score, total_score, grade
    const { data } = await (supabase as any)
      .from("marks_pivoted")
      .select("subject_name, bot_score, mid_score, eot_score, total_score, grade, remarks")
      .eq("student_id", studentId)
      .eq("term_id", termId);

    return (data ?? []).map((m: any) => ({
      subject: m.subject_name ?? "Unknown",
      bot: m.bot_score ?? null,
      mid: m.mid_score ?? null,
      eot: m.eot_score ?? null,
      total: m.total_score ?? 0,
      grade: m.grade ?? "—",
      remarks: m.remarks ?? null,
    }));
  }

  // ── View report card detail ──────────────────────────────────────────────────

  async function openReport(card: ReportCardDisplay) {
    setLoadingDetail(true);
    setViewingReport(card);
    // Subjects already enriched at load time; refresh if empty
    if (card.subjects.length === 0) {
      const subjects = await fetchSubjectMarks(selectedStudentId, card.term_id);
      setViewingReport({ ...card, subjects });
    }
    setLoadingDetail(false);
  }

  // ── PDF download ─────────────────────────────────────────────────────────────

  async function downloadPdf(card: ReportCardDisplay) {
    setDownloadingPdf(true);
    try {
      const res = await fetch(
        `/api/portal/report-card-pdf?student_id=${selectedStudentId}&term_id=${card.term_id}`
      );
      if (!res.ok) throw new Error("Failed to generate PDF");
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `report-card-${card.term_name.replace(/\s+/g, "-")}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      alert("Failed to download report card PDF. Please try again.");
    } finally {
      setDownloadingPdf(false);
    }
  }

  // ── Loading state ────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="mx-auto max-w-lg space-y-4 p-4">
        <div className="h-10 animate-pulse rounded-lg bg-bg-tertiary" />
        <div className="h-60 animate-pulse rounded-xl bg-bg-tertiary" />
        <div className="h-60 animate-pulse rounded-xl bg-bg-tertiary" />
      </div>
    );
  }

  if (linkedStudents.length === 0) {
    return (
      <div className="mx-auto max-w-lg p-4">
        <div className="rounded-xl border border-border bg-card p-8 text-center shadow-sm">
          <GraduationCap className="mx-auto h-10 w-10 text-muted" />
          <p className="mt-3 text-sm font-medium text-heading">No linked students</p>
          <p className="mt-1 text-xs text-muted">
            Contact the school office to link your child's account.
          </p>
        </div>
      </div>
    );
  }

  // ── Detail view ──────────────────────────────────────────────────────────────

  if (viewingReport) {
    return (
      <div className="mx-auto max-w-lg p-4">
        <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }}>
          <button
            onClick={() => setViewingReport(null)}
            className="mb-4 flex items-center gap-1.5 text-sm font-medium text-warning-600 hover:underline"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to results
          </button>

          <div className="rounded-xl border border-border bg-card shadow-sm">
            {/* Header */}
            <div className="border-b border-border p-5 text-center">
              <div className="mx-auto mb-2 flex h-14 w-14 items-center justify-center rounded-full bg-warning-50">
                <GraduationCap className="h-8 w-8 text-warning-600" />
              </div>
              <h1 className="text-lg font-bold text-heading">
                {selectedStudent?.school_name ?? ""}
              </h1>
              {selectedStudent?.school_motto && (
                <p className="text-xs italic text-muted">
                  "{selectedStudent.school_motto}"
                </p>
              )}
              <p className="mt-2 text-sm font-semibold text-warning-600">
                Student Report Card
              </p>
              <p className="text-xs text-muted">{viewingReport.term_name}</p>
            </div>

            {/* Student info */}
            <div className="grid grid-cols-2 gap-3 border-b border-border p-5 text-sm">
              <div>
                <p className="text-muted">Name</p>
                <p className="font-medium text-heading">{selectedStudent?.full_name}</p>
              </div>
              <div>
                <p className="text-muted">Class</p>
                <p className="font-medium text-heading">{selectedStudent?.class_name ?? "—"}</p>
              </div>
              <div>
                <p className="text-muted">Adm. No.</p>
                <p className="font-medium text-heading">
                  {selectedStudent?.admission_number ?? "—"}
                </p>
              </div>
              {viewingReport.position_in_class != null && (
                <div>
                  <p className="text-muted">Position</p>
                  <p className="font-medium text-heading">
                    {viewingReport.position_in_class} of {viewingReport.class_size ?? "—"}
                  </p>
                </div>
              )}
            </div>

            {/* Marks table */}
            {loadingDetail ? (
              <div className="flex items-center justify-center p-8">
                <Loader2 className="h-6 w-6 animate-spin text-muted" />
              </div>
            ) : (
              <div className="overflow-x-auto p-5">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border text-left text-xs font-medium text-muted">
                      <th className="pb-2">Subject</th>
                      <th className="pb-2 text-center">BOT</th>
                      <th className="pb-2 text-center">MID</th>
                      <th className="pb-2 text-center">EOT</th>
                      <th className="pb-2 text-center">Total</th>
                      <th className="pb-2 text-center">Grade</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/50">
                    {viewingReport.subjects.map((s, i) => (
                      <tr key={i}>
                        <td className="py-2.5 font-medium text-heading">{s.subject}</td>
                        <td className="py-2.5 text-center text-muted">
                          {s.bot != null ? s.bot : "—"}
                        </td>
                        <td className="py-2.5 text-center text-muted">
                          {s.mid != null ? s.mid : "—"}
                        </td>
                        <td className="py-2.5 text-center text-muted">
                          {s.eot != null ? s.eot : "—"}
                        </td>
                        <td className="py-2.5 text-center font-bold text-heading">{s.total}</td>
                        <td className="py-2.5 text-center">
                          <span
                            className={cn(
                              "inline-block rounded-full px-2 py-0.5 text-xs font-semibold",
                              getGradeBgColor(s.grade)
                            )}
                          >
                            {s.grade}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {/* Summary */}
            <div className="grid grid-cols-2 gap-3 border-t border-border p-5 text-sm">
              <div>
                <p className="text-muted">Total Marks</p>
                <p className="font-bold text-heading">{viewingReport.total_marks ?? "—"}</p>
              </div>
              <div>
                <p className="text-muted">Average</p>
                <p className="font-bold text-heading">
                  {viewingReport.average != null
                    ? `${viewingReport.average.toFixed(1)}%`
                    : "—"}
                </p>
              </div>
            </div>

            {/* Comments */}
            {(viewingReport.class_teacher_comment || viewingReport.headmaster_comment) && (
              <div className="space-y-3 border-t border-border p-5">
                {viewingReport.class_teacher_comment && (
                  <div>
                    <p className="text-xs font-medium text-muted">Class Teacher's Comment</p>
                    <p className="mt-0.5 text-sm text-heading">
                      {viewingReport.class_teacher_comment}
                    </p>
                  </div>
                )}
                {viewingReport.headmaster_comment && (
                  <div>
                    <p className="text-xs font-medium text-muted">Head Teacher's Comment</p>
                    <p className="mt-0.5 text-sm text-heading">
                      {viewingReport.headmaster_comment}
                    </p>
                  </div>
                )}
              </div>
            )}

            {/* Download PDF */}
            <div className="border-t border-border p-5">
              <button
                onClick={() => downloadPdf(viewingReport)}
                disabled={downloadingPdf}
                className="flex w-full items-center justify-center gap-2 rounded-lg border border-border px-4 py-3 text-sm font-medium text-heading transition-colors hover:bg-card-hover disabled:opacity-50"
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

  // ── List view ────────────────────────────────────────────────────────────────

  return (
    <div className="mx-auto max-w-lg p-4">
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        className="space-y-4"
      >
        {/* Child selector — only shown when parent has multiple children */}
        {linkedStudents.length > 1 && (
          <div className="rounded-xl border border-border bg-card p-5 shadow-sm">
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
                {linkedStudents.map((s) => (
                  <option key={s.student_id} value={s.student_id}>
                    {s.full_name} — {s.class_name ?? "No class"}
                  </option>
                ))}
              </select>
              <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
            </div>
          </div>
        )}

        <h1 className="text-lg font-bold text-heading">Results</h1>

        {/* Term selector */}
        {terms.length > 0 && (
          <div className="relative">
            <select
              value={selectedTermId}
              onChange={(e) => setSelectedTermId(e.target.value)}
              className="w-full appearance-none rounded-lg border border-border bg-card px-4 py-3 pr-10 text-sm font-medium text-heading focus:border-border-strong focus:outline-none focus:ring-1 focus:ring-brand-100"
            >
              {terms.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
            <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
          </div>
        )}

        {/* Report card list */}
        {reportCards.length > 0 ? (
          <div className="space-y-3">
            {reportCards.map((rc) => (
              <motion.button
                key={rc.id}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                onClick={() => openReport(rc)}
                className="flex w-full items-center justify-between rounded-xl border border-border bg-card p-4 text-left shadow-sm transition-colors hover:bg-card-hover/30"
              >
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-bg-tertiary">
                    <FileText className="h-5 w-5 text-secondary" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-heading">
                      {rc.term_name} Report Card
                    </p>
                    <p className="text-xs text-muted">
                      {rc.subjects.length} subject{rc.subjects.length !== 1 ? "s" : ""}
                    </p>
                  </div>
                </div>
                <div className="text-right">
                  {rc.average != null && (
                    <p className="text-lg font-bold text-warning-600">
                      {rc.average.toFixed(1)}%
                    </p>
                  )}
                  {rc.position_in_class != null && (
                    <p className="text-xs text-muted">
                      #{rc.position_in_class} of {rc.class_size ?? "—"}
                    </p>
                  )}
                </div>
              </motion.button>
            ))}
          </div>
        ) : (
          <div className="rounded-xl border border-border bg-card p-8 text-center shadow-sm">
            <FileText className="mx-auto h-10 w-10 text-muted" />
            <p className="mt-3 text-sm font-medium text-heading">No report cards yet</p>
            <p className="mt-1 text-xs text-muted">
              Report cards for this term have not been published yet.
            </p>
          </div>
        )}
      </motion.div>
    </div>
  );
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function getGradeBgColor(grade: string): string {
  const upper = grade.toUpperCase();
  if (upper.startsWith("A")) return "bg-success-50 text-success-600";
  if (upper.startsWith("B"))
    return "bg-brand-50 text-brand-700 dark:bg-brand-900/30 dark:text-brand-400";
  if (upper.startsWith("C")) return "bg-warning-50 text-warning-600";
  if (upper.startsWith("D")) return "bg-orange-100 text-orange-700";
  return "bg-danger-50 text-danger-600";
}
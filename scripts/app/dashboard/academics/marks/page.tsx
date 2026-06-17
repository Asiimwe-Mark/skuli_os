"use client";

import { useEffect, useState, useRef, useCallback, useReducer } from "react";
import { motion } from "framer-motion";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useSupabaseBrowser } from "@/lib/supabase/client";
import { useSchoolStore } from "@/store/school";
import { invalidate, queryKeys } from "@/lib/query-keys";
import { usePermissions } from "@/lib/hooks/usePermissions";
import { cn } from "@/lib/utils/cn";
import { getGrade, getGradeBgColor } from "@/lib/utils/grades";
import type { ExamType } from "@/types";
import { useGradingScales } from "@/lib/hooks/useGradingScales";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/shared/empty-state";
import { useToast } from "@/components/ui/use-toast";
import { fetchEnvelope } from "@/lib/api-fetch";
import {
  ClipboardList,
  Save,
  Send,
  Loader2,
  CheckCircle2,
  AlertCircle,
  Lock,
} from "lucide-react";

interface MarkEntry {
  student_id: string;
  student_name: string;
  admission_number: string;
  score: string;
  remarks: string;
  existing_id?: string;
  review_status?: string;
  review_comment?: string;
}

interface ClassOption {
  id: string;
  name: string;
}
interface SubjectOption {
  id: string;
  name: string;
  code: string;
}
interface TermOption {
  id: string;
  name: string;
  academic_year_id: string;
}

interface ClassSubjectJoin {
  subjects: { id: string; name: string; code: string | null } | null;
}

interface EnrollmentWithStudent {
  student_id: string;
  students: { id: string; full_name: string; admission_number: string } | null;
}

interface ExistingMark {
  id: string;
  student_id: string;
  score: number | null;
  remarks: string | null;
  review_status: string | null;
  review_comment: string | null;
}

interface MarksSheetData {
  enrollments: EnrollmentWithStudent[];
  existingMarks: ExistingMark[];
}

const EXAM_TYPES = [
  { value: "bot", label: "Beginning of Term (BOT)" },
  { value: "midterm", label: "Midterm" },
  { value: "eot", label: "End of Term (EOT)" },
  { value: "assignment", label: "Assignment" },
  { value: "practical", label: "Practical" },
];

export default function MarksEntryPage() {
  // QW-1: selector-based store reads.
  const school = useSchoolStore((s) => s.school);
  const currentTerm = useSchoolStore((s) => s.currentTerm);
  const { isTeacher } = usePermissions();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const supabase = useSupabaseBrowser();

  const [selectedClass, setSelectedClass] = useState("");
  const [selectedSubject, setSelectedSubject] = useState("");
  const [selectedExamType, setSelectedExamType] = useState("");
  const [selectedTermId, setSelectedTermId] = useState(currentTerm?.id ?? "");

  const [marks, setMarks] = useState<MarkEntry[]>([]);
  const [focusCell, setFocusCell] = useState<{
    row: number;
    col: number;
  } | null>(null);
  // Audit 5.10: the three savingMarks / savedMarks / errorMarks
  // useState<Set<string>> calls suffered from concurrent update
  // loss — React can drop a set update if the previous render's
  // value is stale, leaving a mark in the "saving" state forever
  // if two saves race. Consolidating into a single useReducer
  // gives us atomic state transitions: any one mark is in
  // exactly one of saving | saved | error | idle.
  type MarkSaveStatus = "idle" | "saving" | "saved" | "error";
  type MarkSaveMap = Record<string, MarkSaveStatus>;
  const markSaveReducer = (
    state: MarkSaveMap,
    action:
      | { type: "saving"; key: string }
      | { type: "saved"; key: string }
      | { type: "error"; key: string }
      | { type: "clear_saved"; key: string }
      | { type: "reset" },
  ): MarkSaveMap => {
    switch (action.type) {
      case "saving":
        return { ...state, [action.key]: "saving" };
      case "saved":
        return { ...state, [action.key]: "saved" };
      case "error":
        return { ...state, [action.key]: "error" };
      case "clear_saved":
        if (state[action.key] !== "saved") return state;
        const { [action.key]: _, ...rest } = state;
        return rest;
      case "reset":
        return {};
    }
  };
  const [markStatus, dispatchMark] = useReducer(markSaveReducer, {} as MarkSaveMap);
  const savingMarks = new Set(
    Object.entries(markStatus)
      .filter(([, v]) => v === "saving")
      .map(([k]) => k),
  );
  const savedMarks = new Set(
    Object.entries(markStatus)
      .filter(([, v]) => v === "saved")
      .map(([k]) => k),
  );
  const errorMarks = new Set(
    Object.entries(markStatus)
      .filter(([, v]) => v === "error")
      .map(([k]) => k),
  );

  const scoreRefs = useRef<(HTMLInputElement | null)[]>([]);
  const remarkRefs = useRef<(HTMLInputElement | null)[]>([]);

  const { data: gradingScales = [] } = useGradingScales();

  // ---- Queries ----
  const { data: classes = [] } = useQuery<ClassOption[]>({
    queryKey: ["classes", school?.id],
    enabled: !!school?.id,
    queryFn: async () => {
      let query = supabase
        .from("classes")
        .select("id, name")
        .eq("school_id", school!.id)
        .eq("is_deleted", false)
        .order("name");
      const { data, error } = await query;
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: subjects = [] } = useQuery<SubjectOption[]>({
    queryKey: ["class-subjects", selectedClass],
    enabled: !!selectedClass,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("class_subjects")
        .select("subjects(id, name, code)")
        .eq("class_id", selectedClass);
      if (error) throw error;
      return (
        (data
          ?.map((cs: ClassSubjectJoin) => cs.subjects)
          .filter(Boolean) as SubjectOption[]) ?? []
      );
    },
  });

  const { data: terms = [] } = useQuery<TermOption[]>({
    queryKey: ["terms", school?.id],
    enabled: !!school?.id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("terms")
        .select("id, name, academic_year_id")
        .eq("school_id", school!.id)
        .order("start_date", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: marksData, isLoading: marksLoading } = useQuery({
    queryKey: [
      "marks-sheet",
      selectedClass,
      selectedSubject,
      selectedExamType,
      selectedTermId,
    ],
    enabled: !!(
      selectedClass &&
      selectedSubject &&
      selectedExamType &&
      selectedTermId
    ),
    queryFn: async () => {
      const [enrollmentsRes, marksRes] = await Promise.all([
        supabase
          .from("class_enrollments")
          .select("student_id, students(id, full_name, admission_number)")
          .eq("class_id", selectedClass)
          .eq("term_id", selectedTermId),
        supabase
          .from("marks")
          .select("id, student_id, score, remarks, review_status, review_comment")
          .eq("class_id", selectedClass)
          .eq("subject_id", selectedSubject)
          .eq("term_id", selectedTermId)
          .eq("exam_type", selectedExamType as ExamType),
      ]);
      return {
        enrollments: enrollmentsRes.data ?? [],
        existingMarks: marksRes.data ?? [],
      };
    },
  });

  // Sync marks state when data loads
  useEffect(() => {
    if (!marksData) return;
    const data = marksData as MarksSheetData;
    const marksMap = new Map(
      data.existingMarks.map((m) => [m.student_id, m])
    );
    setMarks(
      data.enrollments.map((e) => {
        const existing = marksMap.get(e.student_id);
        return {
          student_id: e.student_id,
          student_name: e.students?.full_name ?? "Unknown",
          admission_number: e.students?.admission_number ?? "",
          score: existing?.score?.toString() ?? "",
          remarks: existing?.remarks ?? "",
          existing_id: existing?.id,
          review_status: existing?.review_status ?? "not_started",
          review_comment: existing?.review_comment ?? "",
        };
      })
    );
    setFocusCell(null);
  }, [marksData]);

  // ---- Mutations ----
  const saveMutation = useMutation({
    mutationFn: async (submitFinal: boolean) => {
      if (!selectedTermId || !school?.id) throw new Error("Missing context");

      const validMarks = marks.filter((m) => m.score !== "");
      if (validMarks.length === 0) throw new Error("No marks to save");

      for (const m of validMarks) {
        const score = parseFloat(m.score);
        if (isNaN(score) || score < 0)
          throw new Error(`Invalid score for ${m.student_name}`);
        if (score > 100)
          throw new Error(
            `Score exceeds max for ${m.student_name}: ${score}/100`
          );
      }

      const blankCount = marks.filter((m) => m.score === "").length;
      if (submitFinal && blankCount > 0) {
        throw new Error(
          `${blankCount} students have no score. Fill all scores before submitting final.`
        );
      }

      const marksPayload = validMarks
        .filter((m) => m.review_status !== "approved")
        .map((m) => ({
          student_id: m.student_id,
          score: parseFloat(m.score),
          max_score: 100,
          remarks: m.remarks || null,
        }));

      if (marksPayload.length > 0) {
        await fetchEnvelope("/api/academics/marks", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            subject_id: selectedSubject,
            class_id: selectedClass,
            term_id: selectedTermId,
            exam_type: selectedExamType,
            // Audit 10.x: the server only flips rows to
            // review_status='submitted' when this flag is true. Without
            // it the marks would stay as 'draft' and the review page
            // would never show approve/reject actions.
            submit_final: submitFinal,
            marks: marksPayload,
          }),
        });
      }
      return { count: validMarks.length, submitFinal };
    },
    onMutate: async (variables) => {
      // Cancel any outgoing refetches.
      // SECURITY/FUNCTIONAL (audit 12.x): the mutation's optimistic
      // update must use the SAME queryKey as the useQuery above —
      // otherwise React Query throws "A query that was cancelled
      // because it's part of a mutation that was previously
      // triggered" and the rollback writes to a key that doesn't
      // exist. The useQuery on line 217 uses `selectedTermId` (local
      // state), not `term?.id` (store). Use the local-state value
      // here too.
      const marksKey = [
        "marks-sheet",
        selectedClass,
        selectedSubject,
        selectedExamType,
        selectedTermId,
      ];
      await queryClient.cancelQueries({ queryKey: marksKey });

      // Snapshot the previous value
      const previousMarks = queryClient.getQueryData<MarksSheetData>(marksKey);

      // Optimistically update to the new value - mark all as saving.
      // The optimistic flag is set on the data but the UI's saving
      // indicator reads from `markStatus` reducer state, not from
      // this flag — so this is effectively a no-op for display, but
      // we keep the snapshot/rollback as a defensive layer.
      queryClient.setQueryData<MarksSheetData | undefined>(marksKey, (old) => {
        if (!old) return old;
        return {
          ...old,
          existingMarks: (old.existingMarks || []).map((m) => ({ ...m, _saving: true })),
        };
      });

      return { previousMarks, marksKey };
    },
    onError: (err, variables, context) => {
      // Rollback to snapshot. Use the key captured in onMutate so
      // we never write to a stale or different cache entry.
      if (context?.previousMarks && context.marksKey) {
        queryClient.setQueryData(context.marksKey, context.previousMarks);
      } else if (context?.previousMarks) {
        // Fallback to local-state key for the (very unlikely) case
        // the onMutate capture missed it.
        queryClient.setQueryData(
          ["marks-sheet", selectedClass, selectedSubject, selectedExamType, selectedTermId],
          context.previousMarks,
        );
      }
      
      toast({
        title: "Error saving marks",
        description: err instanceof Error ? err.message : "Unknown error",
        variant: "destructive",
      });
    },
    onSuccess: (result) => {
      // Audit (Bug #4 + #5): scope the cascade to the current school
      // and route through the centralised invalidator. The marks
      // sheet uses a different key than the centralised marks
      // factory (it includes class/subject/term), so we keep the
      // specific invalidation for it but layer the school-scoped
      // cascade on top.
      if (school?.id) {
        invalidate.marksRecorded(queryClient, school.id);
        queryClient.invalidateQueries({ queryKey: queryKeys.marks(school.id) });
      } else {
        queryClient.invalidateQueries({ queryKey: ["marks-sheet"] });
        queryClient.invalidateQueries({ queryKey: ["mark-groups"] });
        queryClient.invalidateQueries({ queryKey: ["report-cards"] });
        queryClient.invalidateQueries({ queryKey: ["dashboard"] });
      }
      toast({
        title: result.submitFinal ? "Marks submitted" : "Draft saved",
        description: `${result.count} marks saved successfully.`,
      });
    },
  });

  // ---- Derived state ----
  const term = currentTerm;

  // ---- Per-mark optimistic save ----
  const autoSaveMark = useCallback(
    async (mark: MarkEntry) => {
      if (mark.review_status === "approved") return;
      if (!term?.id || !school?.id) return;

      const score = parseFloat(mark.score);
      if (isNaN(score) || score < 0 || score > 100) return;

      const markKey = mark.student_id;
      dispatchMark({ type: "saving", key: markKey });

      try {
        const userId = (await supabase.auth.getUser()).data.user?.id;
        const markData = {
          school_id: school.id,
          student_id: mark.student_id,
          subject_id: selectedSubject,
          class_id: selectedClass,
          term_id: term.id,
          academic_year_id: term.academic_year_id,
          exam_type: selectedExamType,
          score,
          max_score: 100,
          remarks: mark.remarks || null,
          entered_by: userId,
          review_status: mark.review_status === "submitted" ? "submitted" : "draft",
        };

        if (mark.existing_id) {
          await supabase.from("marks").update(markData as any).eq("id", mark.existing_id);
        } else {
          const { data } = await supabase
            .from("marks")
            .insert(markData as any)
            .select("id")
            .single();
          if (data) {
            setMarks((prev) =>
              prev.map((m) =>
                m.student_id === mark.student_id
                  ? { ...m, existing_id: data.id }
                  : m
              )
            );
          }
        }

        dispatchMark({ type: "saved", key: markKey });
        // Clear saved indicator after 1.5s
        setTimeout(() => {
          dispatchMark({ type: "clear_saved", key: markKey });
        }, 1500);
      } catch {
        dispatchMark({ type: "error", key: markKey });
        toast({
          title: `Failed to save ${mark.student_name}`,
          variant: "destructive",
        });
      }
      // No finally: the success path dispatches "saved" and the
      // error path dispatches "error". The "saving" state only
      // persists if the autoSave was never awaited (component
      // unmounted mid-save), which is fine because the Set is
      // recomputed from markStatus on the next render.
    },
    [term, school, selectedSubject, selectedClass, selectedExamType, supabase, toast, dispatchMark]
  );
  const isSaving = saveMutation.isPending;
  const enteredCount = marks.filter((m) => m.score !== "").length;
  const blankCount = marks.filter((m) => m.score === "").length;
  const hasWarnings = blankCount > 0;

  // Derive overall review status from marks
  const reviewStatuses = marks.filter((m) => m.review_status && m.review_status !== "not_started");
  const overallReviewStatus = reviewStatuses.length === 0
    ? "not_started"
    : reviewStatuses.every((m) => m.review_status === "approved")
    ? "approved"
    : reviewStatuses.some((m) => m.review_status === "rejected")
    ? "rejected"
    : reviewStatuses.some((m) => m.review_status === "submitted")
    ? "submitted"
    : reviewStatuses.some((m) => m.review_status === "draft")
    ? "draft"
    : "not_started";
  const isAllApproved = marks.length > 0 && marks.every((m) => m.review_status === "approved");
  const rejectionComment = marks.find((m) => m.review_comment)?.review_comment;

  const firstRejected = marks.find((m) => m.review_status === "rejected");

  const showSheet =
    selectedClass && selectedSubject && selectedExamType && selectedTermId;

  // ---- Handlers ----
  const updateMark = (
    studentId: string,
    field: "score" | "remarks",
    value: string
  ) => {
    setMarks((prev) =>
      prev.map((m) =>
        m.student_id === studentId ? { ...m, [field]: value } : m
      )
    );
  };

  const handleScoreBlur = useCallback(
    (mark: MarkEntry) => {
      // Auto-save on blur if score changed
      const score = parseFloat(mark.score);
      if (!isNaN(score) && score >= 0 && score <= 100) {
        autoSaveMark(mark);
      }
    },
    [autoSaveMark]
  );

  const handleKeyDown = useCallback(
    (
      e: React.KeyboardEvent<HTMLInputElement>,
      row: number,
      col: number
    ) => {
      const refs = col === 0 ? scoreRefs : remarkRefs;
      if (e.key === "Enter" || e.key === "ArrowDown") {
        e.preventDefault();
        const next = refs.current[row + 1];
        if (next) {
          next.focus();
          next.select();
        }
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        const prev = refs.current[row - 1];
        if (prev) {
          prev.focus();
          prev.select();
        }
      } else if (e.key === "Tab" && !e.shiftKey && col === 0) {
        e.preventDefault();
        remarkRefs.current[row]?.focus();
      }
    },
    []
  );

  const handleFocus = (row: number, col: number) => {
    setFocusCell({ row, col });
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="space-y-6"
    >
      <div>
        <h1 className="text-2xl font-bold font-display">Marks Entry</h1>
        <p className="text-muted text-sm mt-1">
          Enter student marks for exams and assessments
        </p>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="p-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="space-y-2">
              <Label>Class</Label>
              <Select
                value={selectedClass}
                onValueChange={(v) => {
                  setSelectedClass(v);
                  setSelectedSubject("");
                  setMarks([]);
                }}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select class" />
                </SelectTrigger>
                <SelectContent>
                  {classes.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Subject</Label>
              <Select
                value={selectedSubject}
                onValueChange={(v) => {
                  setSelectedSubject(v);
                  setMarks([]);
                }}
                disabled={!selectedClass}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select subject" />
                </SelectTrigger>
                <SelectContent>
                  {subjects.map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.name} ({s.code})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Exam Type</Label>
              <Select
                value={selectedExamType}
                onValueChange={(v) => {
                  setSelectedExamType(v);
                  setMarks([]);
                }}
                disabled={!selectedSubject}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select exam type" />
                </SelectTrigger>
                <SelectContent>
                  {EXAM_TYPES.map((et) => (
                    <SelectItem key={et.value} value={et.value}>
                      {et.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Term</Label>
              <Select
                value={selectedTermId}
                onValueChange={(v) => {
                  setSelectedTermId(v);
                  setMarks([]);
                }}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select term" />
                </SelectTrigger>
                <SelectContent>
                  {terms.map((t) => (
                    <SelectItem key={t.id} value={t.id}>
                      {t.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Marks Sheet */}
      {!showSheet ? (
        <EmptyState
          icon={ClipboardList}
          title="Select all filters above"
          description="Choose class, subject, exam type, and term to start entering marks."
        />
      ) : marksLoading ? (
        <div className="space-y-2">
          {[...Array(8)].map((_, i) => (
            <Skeleton key={i} className="h-14 rounded-lg" />
          ))}
        </div>
      ) : marks.length === 0 ? (
        <EmptyState
          icon={ClipboardList}
          title="No students enrolled"
          description="There are no students enrolled in this class for the selected term."
        />
      ) : (
        <>
          {/* Toolbar */}
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div className="flex items-center gap-4 text-sm">
              <span className="text-muted">
                {marks.length} students
              </span>
              <span className="text-muted">
                {enteredCount} entered
              </span>
              {hasWarnings && (
                <span className="flex items-center gap-1 text-warning-600">
                  <AlertCircle className="w-4 h-4" />
                  {blankCount} blank
                </span>
              )}
              {saveMutation.isSuccess && (
                <span className="flex items-center gap-1 text-success-600">
                  <CheckCircle2 className="w-4 h-4" />
                  Saved
                </span>
              )}
              {overallReviewStatus === "draft" && (
                <Badge variant="outline" className="bg-warning-100 text-warning-700 border-warning-500">Draft</Badge>
              )}
              {overallReviewStatus === "submitted" && (
                <Badge className="bg-bg-tertiary text-muted border-border">Awaiting Review</Badge>
              )}
              {overallReviewStatus === "approved" && (
                <Badge className="bg-success-100 text-success-700 border-success-500">
                  <Lock className="w-3 h-3 mr-1" /> Approved
                </Badge>
              )}
              {overallReviewStatus === "rejected" && (
                <>
                  <Badge variant="destructive">Rejected</Badge>
                  {rejectionComment && (
                    <span className="text-xs text-secondary max-w-[200px] truncate" title={rejectionComment}>
                      Reason: {rejectionComment}
                    </span>
                  )}
                </>
              )}
            </div>
            <div className="flex items-center gap-2">
              {isAllApproved ? (
                <div className="flex items-center gap-2 text-sm text-muted">
                  <Lock className="w-4 h-4" />
                  Marks Approved - Locked
                </div>
              ) : (
                <>
                  <Button
                    variant="outline"
                    onClick={() => saveMutation.mutate(false)}
                    disabled={isSaving}
                  >
                    {isSaving ? (
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    ) : (
                      <Save className="w-4 h-4 mr-2" />
                    )}
                    Save Draft
                  </Button>
                  <Button
                    onClick={() => saveMutation.mutate(true)}
                    disabled={isSaving}
                  >
                    <Send className="w-4 h-4 mr-2" />
                    Submit Final
                  </Button>
                </>
              )}
            </div>
          </div>

          {/* Spreadsheet */}
          <Card>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-border">
                      <th className="text-left p-4 text-sm font-medium text-muted">
                        Admission No.
                      </th>
                      <th className="text-left p-4 text-sm font-medium text-muted">
                        Student Name
                      </th>
                      <th className="text-center p-4 text-sm font-medium text-muted w-32">
                        Score (/100)
                      </th>
                      <th className="text-center p-4 text-sm font-medium text-muted w-20">
                        Grade
                      </th>
                      <th className="text-left p-4 text-sm font-medium text-muted">
                        Remarks
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {marks.map((mark, i) => {
                      const score = parseFloat(mark.score);
                      const grade = !isNaN(score) ? getGrade(score, gradingScales.length > 0 ? gradingScales : undefined) : null;
                      const isOverMax = score > 100;
                      const isBlank = mark.score === "";

                      return (
                        <motion.tr
                          key={mark.student_id}
                          initial={{ opacity: 0, y: 5 }}
                          animate={{ opacity: 1, y: 0 }}
                          transition={{ delay: i * 0.02 }}
                          className={cn(
                            "border-b border-border hover:bg-card-hover",
                            focusCell?.row === i && "bg-bg-tertiary"
                          )}
                        >
                          <td className="p-4 text-sm text-muted font-mono">
                            {mark.admission_number}
                          </td>
                          <td className="p-4 text-sm font-medium">
                            <div className="flex items-center gap-2">
                              {mark.student_name}
                              {mark.review_status === "approved" && (
                                <Lock className="w-3.5 h-3.5 text-secondary" />
                              )}
                            </div>
                          </td>
                          <td className="p-4">
                            <div className="flex items-center gap-1.5 justify-center">
                              <Input
                                ref={(el) => {
                                  scoreRefs.current[i] = el;
                                }}
                                type="number"
                                min="0"
                                max="100"
                                value={mark.score}
                                disabled={mark.review_status === "approved"}
                                onChange={(e) =>
                                  updateMark(
                                    mark.student_id,
                                    "score",
                                    e.target.value
                                  )
                                }
                                onFocus={() => handleFocus(i, 0)}
                                onBlur={() => handleScoreBlur(mark)}
                                onKeyDown={(e) => handleKeyDown(e, i, 0)}
                                className={cn(
                                  "h-9 text-center w-24 mx-auto",
                                  isOverMax && "border-border",
                                  mark.review_status === "approved" && "opacity-60 cursor-not-allowed",
                                  errorMarks.has(mark.student_id) && "border-border bg-danger-50"
                                )}
                                placeholder="-"
                              />
                              {savingMarks.has(mark.student_id) && (
                                <Loader2 className="w-3.5 h-3.5 text-secondary animate-spin flex-shrink-0" />
                              )}
                              {savedMarks.has(mark.student_id) && (
                                <CheckCircle2 className="w-3.5 h-3.5 text-secondary flex-shrink-0" />
                              )}
                              {errorMarks.has(mark.student_id) && (
                                <button
                                  onClick={() => autoSaveMark(mark)}
                                  className="flex-shrink-0"
                                  title="Retry save"
                                >
                                  <AlertCircle className="w-3.5 h-3.5 text-secondary hover:text-secondary" />
                                </button>
                              )}
                            </div>
                          </td>
                          <td className="p-4 text-center">
                            {grade ? (
                              <Badge
                                className={cn("text-xs", getGradeBgColor(grade))}
                              >
                                {grade}
                              </Badge>
                            ) : isBlank ? (
                              <span className="text-xs text-muted">
                                -
                              </span>
                            ) : null}
                          </td>
                          <td className="p-4">
                            <Input
                              ref={(el) => {
                                remarkRefs.current[i] = el;
                              }}
                              value={mark.remarks}
                              disabled={mark.review_status === "approved"}
                              onChange={(e) =>
                                updateMark(
                                  mark.student_id,
                                  "remarks",
                                  e.target.value
                                )
                              }
                              onFocus={() => handleFocus(i, 1)}
                              onKeyDown={(e) => handleKeyDown(e, i, 1)}
                              className={cn(
                                "h-9 text-sm",
                                mark.review_status === "approved" && "opacity-60 cursor-not-allowed"
                              )}
                              placeholder="Optional remarks"
                            />
                          </td>
                        </motion.tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </>
      )}
    </motion.div>
  );
}

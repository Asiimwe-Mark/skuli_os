"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useSupabaseBrowser } from "@/lib/supabase/client";
import JSZip from "jszip";
import { saveAs } from "file-saver";
import { pdf } from "@react-pdf/renderer";
import { ReportCardPDF } from "@/lib/pdf/report-card";
import { useSchoolStore } from "@/store/school";
import { cn } from "@/lib/utils/cn";
import { getGrade, getGradeBgColor } from "@/lib/utils/grades";
import type { ConductGrade } from "@/types";
import { useGradingScales } from "@/lib/hooks/useGradingScales";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/shared/empty-state";
import { useToast } from "@/components/ui/use-toast";
import {
  Loader2,
  Download,
  Send,
  Users,
  Pencil,
  Check,
  X,
  MessageSquare,
  FileText,
} from "lucide-react";

interface ClassOption {
  id: string;
  name: string;
}
interface TermOption {
  id: string;
  name: string;
  academic_year_id: string;
}
interface ReportCardRow {
  id: string;
  student_id: string;
  total_marks: number | null;
  average: number | null;
  position_in_class: number | null;
  class_size: number | null;
  class_teacher_comment: string | null;
  headmaster_comment: string | null;
  conduct_grade: string | null;
  is_published: boolean;
  students: {
    full_name: string;
    admission_number: string;
  } | null;
}

interface MarkWithSubject {
  student_id: string;
  subject_id: string;
  exam_type: string;
  score: number | null;
  max_score: number;
  subjects: { name: string } | null;
}

interface SubjectComment {
  subject_id: string;
  bot_comment: string | null;
  mid_comment: string | null;
  eot_comment: string | null;
}

interface ClassSubjectWithJoin {
  subject_id: string;
  subjects: { id: string; name: string } | null;
}

interface AttendanceRecord {
  student_id: string;
  status: string;
}

const CONDUCT_GRADES = ["A", "B", "C", "D"] as const;
const CONDUCT_LABELS: Record<string, string> = {
  A: "Excellent",
  B: "Good",
  C: "Fair",
  D: "Poor",
};

export default function ReportCardsPage() {
  // QW-1: selector-based store reads.
  const school = useSchoolStore((s) => s.school);
  const currentTerm = useSchoolStore((s) => s.currentTerm);
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { data: gradingScales = [] } = useGradingScales();
  const supabase = useSupabaseBrowser();

  const [selectedClass, setSelectedClass] = useState("");
  const [selectedTermId, setSelectedTermId] = useState(currentTerm?.id ?? "");

  const [editingComment, setEditingComment] = useState<{
    id: string;
    field: "class_teacher_comment" | "headmaster_comment";
    value: string;
  } | null>(null);

  // ---- Queries ----
  const { data: classes = [] } = useQuery<ClassOption[]>({
    queryKey: ["classes", school?.id],
    enabled: !!school?.id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("classes")
        .select("id, name")
        .eq("school_id", school!.id)
        .eq("is_deleted", false)
        .order("name");
      if (error) throw error;
      return data ?? [];
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

  const {
    data: reportCards = [],
    isLoading,
    isFetching,
  } = useQuery<ReportCardRow[]>({
    queryKey: ["report-cards", selectedClass, selectedTermId],
    enabled: !!(selectedClass && selectedTermId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("report_cards")
        .select(
          "id, student_id, total_marks, average, position_in_class, class_size, class_teacher_comment, headmaster_comment, conduct_grade, is_published, students(full_name, admission_number)"
        )
        .eq("class_id", selectedClass)
        .eq("term_id", selectedTermId)
        .eq("is_deleted", false)
        .order("position_in_class", { ascending: true, nullsFirst: false });
      if (error) throw error;
      return (data as unknown as ReportCardRow[]) ?? [];
    },
  });

  // ---- Mutations ----
  const updateCommentMutation = useMutation({
    mutationFn: async ({
      id,
      field,
      value,
    }: {
      id: string;
      field: "class_teacher_comment" | "headmaster_comment";
      value: string;
    }) => {
      const { error } = await supabase
        .from("report_cards")
        .update({ [field]: value || null } as any)
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["report-cards"] });
      toast({ title: "Comment saved" });
      setEditingComment(null);
    },
    onError: () => {
      toast({ title: "Failed to save comment", variant: "destructive" });
    },
  });

  const updateConductMutation = useMutation({
    mutationFn: async ({ id, grade }: { id: string; grade: string }) => {
      const { error } = await supabase
        .from("report_cards")
        .update({ conduct_grade: grade as ConductGrade })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["report-cards"] });
      toast({ title: "Conduct grade updated" });
    },
    onError: () => {
      toast({
        title: "Failed to update conduct grade",
        variant: "destructive",
      });
    },
  });

  // Fetch attendance for the selected term/class for report card PDFs
  const { data: termDates } = useQuery({
    queryKey: ["term-dates", selectedTermId],
    enabled: !!selectedTermId,
    queryFn: async () => {
      const { data } = await supabase
        .from("terms")
        .select("id, start_date, end_date, name, academic_year_id")
        .eq("id", selectedTermId)
        .single();
      return data;
    },
  });

  // Next term (for next_term_date in PDF)
  const { data: nextTerm } = useQuery({
    queryKey: ["next-term", selectedTermId],
    enabled: !!selectedTermId && !!termDates,
    queryFn: async () => {
      const { data } = await supabase
        .from("terms")
        .select("start_date")
        .eq("school_id", school!.id)
        .gt("start_date", termDates!.end_date)
        .order("start_date", { ascending: true })
        .limit(1)
        .maybeSingle();
      return data;
    },
  });

  const generateMutation = useMutation({
    mutationFn: async () => {
      if (!selectedClass || !selectedTermId)
        throw new Error("Select class and term");
      const selectedTerm = terms.find((t) => t.id === selectedTermId);
      if (!selectedTerm) throw new Error("Term not found");

      // Get enrolled students
      const { data: enrollments, error: enrollError } = await supabase
        .from("class_enrollments")
        .select("student_id")
        .eq("class_id", selectedClass)
        .eq("term_id", selectedTermId);
      if (enrollError) throw enrollError;

      const studentIds = enrollments?.map((e: any) => e.student_id) ?? [];
      if (studentIds.length === 0) throw new Error("No students enrolled");

      // Get marks with subject_id and exam_type for BOT/MID/EOT breakdown
      const { data: marksData, error: marksError } = await supabase
        .from("marks")
        .select("student_id, subject_id, exam_type, score, max_score")
        .eq("class_id", selectedClass)
        .eq("term_id", selectedTermId)
        .eq("is_deleted", false);
      if (marksError) throw marksError;

      // Calculate totals per student with BOT/MID/EOT grouping
      type SubjectBreakdown = { bot?: number; midterm?: number; eot?: number; total: number; maxScore: number };
      const studentMarks = new Map<string, { total: number; maxTotal: number; subjectBreakdowns: Map<string, SubjectBreakdown> }>();
      for (const m of (marksData ?? []) as any[]) {
        const existing = studentMarks.get(m.student_id) ?? { total: 0, maxTotal: 0, subjectBreakdowns: new Map() };
        const subj = existing.subjectBreakdowns.get(m.subject_id) ?? { total: 0, maxScore: 0 };
        if (m.exam_type === "bot") subj.bot = m.score;
        else if (m.exam_type === "midterm") subj.midterm = m.score;
        else if (m.exam_type === "eot") subj.eot = m.score;
        subj.total = (subj.bot ?? 0) + (subj.midterm ?? 0) + (subj.eot ?? 0);
        const coreExamCount = [subj.bot, subj.midterm, subj.eot].filter((v) => v !== undefined).length;
        subj.maxScore = coreExamCount * m.max_score;
        existing.subjectBreakdowns.set(m.subject_id, subj);
        // Recalculate student totals
        let total = 0, maxTotal = 0;
        for (const [, s] of existing.subjectBreakdowns) { total += s.total; maxTotal += s.maxScore; }
        existing.total = total;
        existing.maxTotal = maxTotal;
        studentMarks.set(m.student_id, existing);
      }

      // Sort by average for position
      const averages = studentIds.map((sid: string) => {
        const sm = studentMarks.get(sid);
        return {
          student_id: sid,
          total: sm?.total ?? 0,
          average: sm && sm.maxTotal > 0 ? (sm.total / sm.maxTotal) * 100 : 0,
        };
      });
      averages.sort(
        (a: { average: number }, b: { average: number }) =>
          b.average - a.average
      );

      const classSize = studentIds.length;
      let created = 0;
      let updated = 0;

      for (let i = 0; i < averages.length; i++) {
        const entry = averages[i];
        const position = i + 1;

        // Check if report card already exists
        const { data: existing } = await supabase
          .from("report_cards")
          .select("id")
          .eq("student_id", entry.student_id)
          .eq("class_id", selectedClass)
          .eq("term_id", selectedTermId)
          .maybeSingle();

        const payload = {
          school_id: school!.id,
          student_id: entry.student_id,
          class_id: selectedClass,
          term_id: selectedTermId,
          academic_year_id: selectedTerm.academic_year_id,
          total_marks: entry.total,
          average: Math.round(entry.average * 100) / 100,
          position_in_class: position,
          class_size: classSize,
        };

        if (existing) {
          await supabase
            .from("report_cards")
            .update(payload as any)
            .eq("id", existing.id);
          updated++;
        } else {
          const { error } = await supabase
            .from("report_cards")
            .insert(payload as any);
          if (!error) created++;
        }
      }
      return { created, updated, classSize };
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ["report-cards"] });
      toast({
        title: "Report cards generated",
        description: `${result.created} created, ${result.updated} updated for ${result.classSize} students.`,
      });
    },
    onError: (err) => {
      toast({
        title: "Error generating report cards",
        description: err instanceof Error ? err.message : "Unknown error",
        variant: "destructive",
      });
    },
  });

  const publishMutation = useMutation({
    mutationFn: async () => {
      const unpublished = reportCards.filter((rc) => !rc.is_published);
      if (unpublished.length === 0) throw new Error("All already published");

      const response = await fetch("/api/academics/report-cards/publish", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ class_id: selectedClass, term_id: selectedTermId }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || "Failed to publish");
      }

      const result = await response.json();
      return { count: result.data.published };
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ["report-cards"] });
      toast({
        title: "Report cards published",
        description: `${result.count} report cards are now visible to parents.`,
      });
    },
    onError: (err) => {
      toast({
        title: "Error publishing",
        description: err instanceof Error ? err.message : "Unknown error",
        variant: "destructive",
      });
    },
  });

  // ---- Derived ----
  const showTable = selectedClass && selectedTermId;
  const isGenerating = generateMutation.isPending;
  const isPublishing = publishMutation.isPending;
  const publishedCount = reportCards.filter((rc) => rc.is_published).length;

  // ---- Handlers ----
  const startEditComment = (
    id: string,
    field: "class_teacher_comment" | "headmaster_comment",
    currentValue: string | null
  ) => {
    setEditingComment({ id, field, value: currentValue ?? "" });
  };

  const saveComment = () => {
    if (!editingComment) return;
    updateCommentMutation.mutate(editingComment);
  };

  const cancelEditComment = () => {
    setEditingComment(null);
  };

  const [zipLoading, setZipLoading] = useState(false);
  const [downloadingStudentId, setDownloadingStudentId] = useState<string | null>(null);
  const [sendingSmsId, setSendingSmsId] = useState<string | null>(null);

  async function shareReportCardViaSMS(card: ReportCardRow) {
    setSendingSmsId(card.student_id);
    try {
      // 1. Generate PDF blob and upload to storage temporarily, or use existing pdf_path if available
      const studentName = card.students?.full_name || "Unknown";
      const admissionNo = card.students?.admission_number || "N/A";
      const className = classes.find((c) => c.id === selectedClass)?.name || "Class";
      const termObj = terms.find((t) => t.id === selectedTermId);

      // Fetch marks for this student
      const { data: studentMarks } = await supabase
        .from("marks")
        .select("subject_id, exam_type, score, max_score, subjects(name)")
        .eq("student_id", card.student_id)
        .eq("term_id", selectedTermId);

      // Fetch subject comments
      const { data: subjectComments } = await supabase
        .from("subject_comments")
        .select("subject_id, bot_comment, mid_comment, eot_comment")
        .eq("student_id", card.student_id)
        .eq("term_id", selectedTermId);

      const subjectsData = studentMarks?.map((m: any) => ({
        name: m.subjects?.name ?? "Unknown",
        bot: studentMarks?.find((sm: any) => sm.subject_id === m.subject_id && sm.exam_type === "bot")?.score ?? undefined,
        midterm: studentMarks?.find((sm: any) => sm.subject_id === m.subject_id && sm.exam_type === "midterm")?.score ?? undefined,
        eot: studentMarks?.find((sm: any) => sm.subject_id === m.subject_id && sm.exam_type === "eot")?.score ?? undefined,
        total: Math.round((card.average ?? 0) * (studentMarks?.length ?? 1) / 100),
        grade: getGrade(card.average ?? 0, gradingScales),
        remarks: subjectComments?.find((sc: any) => sc.subject_id === m.subject_id)?.eot_comment ?? undefined,
      })) ?? [];

      const pdfDoc = (
        <ReportCardPDF
          school={{
            name: school?.name || "School",
            address: (school as any)?.address,
            motto: (school as any)?.motto,
            logo_url: (school as any)?.logo_url,
          }}
          student={{
            full_name: studentName,
            admission_number: admissionNo,
            class_name: className,
          }}
          term={termObj?.name || "Term"}
          academic_year={termObj?.academic_year_id || ""}
          subjects={subjectsData}
          summary={{
            total_marks: card.total_marks ?? 0,
            average: card.average ?? 0,
            position: card.position_in_class ?? 0,
            class_size: card.class_size ?? 0,
          }}
          attendance={{ days_present: 0, days_open: 0 }}
          comments={{
            class_teacher: card.class_teacher_comment || undefined,
            headmaster: card.headmaster_comment || undefined,
          }}
          conduct_grade={card.conduct_grade || undefined}
          next_term_date={nextTerm?.start_date || undefined}
        />
      );

      const pdfBlob = await pdf(pdfDoc).toBlob();
      
      // Upload to storage
      const fileName = `report-cards/${school?.id}/${card.student_id}_${selectedTermId}.pdf`;
      const { error: uploadError } = await supabase.storage
        .from("report-cards")
        .upload(fileName, pdfBlob, { upsert: true });

      if (uploadError) throw uploadError;

      // 2. Generate 30-day signed URL
      const { data: signed } = await supabase.storage
        .from("report-cards")
        .createSignedUrl(fileName, 2592000); // 30 days

      if (!signed?.signedUrl) {
        toast({ title: "Error", description: "Could not generate share link.", variant: "destructive" });
        return;
      }

      // 3. Fetch parent phone for the student
      const { data: student } = await supabase
        .from("students")
        .select("parent_name, parent_phone")
        .eq("id", card.student_id)
        .single();

      if (!student?.parent_phone) {
        toast({ title: "No parent phone", description: "This student has no parent phone number.", variant: "destructive" });
        return;
      }

      // Normalize phone
      const normalizedPhone = student.parent_phone.startsWith("+") 
        ? student.parent_phone 
        : `+256${student.parent_phone.replace(/^0/, "")}`;

      // 4. Send via communication API
      const res = await fetch("/api/communication/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: `Report Card - ${studentName}`,
          message_body: `Dear ${student.parent_name || "Parent"}, ${studentName}'s report card for ${termObj?.name ?? "this term"} is ready. View at: ${signed.signedUrl} - ${school?.name}`,
          audience_type: "manual_phones",
          phone_numbers: [normalizedPhone],
          channels: { sms: true, in_app: false },
        }),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error ?? "Failed to send SMS");
      }

      toast({ title: "Sent", description: `Report card link sent to ${normalizedPhone}` });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Failed to send SMS";
      toast({ title: "Error", description: message, variant: "destructive" });
    } finally {
      setSendingSmsId(null);
    }
  }

  const handleDownloadSinglePdf = async (rc: ReportCardRow) => {
    setDownloadingStudentId(rc.student_id);
    try {
      const studentName = rc.students?.full_name || "Unknown";
      const admissionNo = rc.students?.admission_number || "N/A";
      const className = classes.find((c) => c.id === selectedClass)?.name || "Class";
      const termObj = terms.find((t) => t.id === selectedTermId);

      // Fetch marks for this student
      const { data: studentMarks } = await supabase
        .from("marks")
        .select("subject_id, exam_type, score, max_score, subjects(name)")
        .eq("student_id", rc.student_id)
        .eq("class_id", selectedClass)
        .eq("term_id", selectedTermId)
        .eq("is_deleted", false);

      // Fetch subjects
      const { data: classSubjects } = await supabase
        .from("class_subjects")
        .select("subject_id, subjects(id, name)")
        .eq("class_id", selectedClass);

      const subjectNameMap = new Map<string, string>();
      for (const cs of (classSubjects ?? []) as any[]) {
        if (cs.subjects) subjectNameMap.set(cs.subject_id, cs.subjects.name);
      }

      // Group marks by subject
      const subjectMap = new Map<string, { bot?: number; midterm?: number; eot?: number; total: number }>();
      for (const m of (studentMarks ?? []) as any[]) {
        const subj = subjectMap.get(m.subject_id) ?? { total: 0 };
        if (m.exam_type === "bot") subj.bot = m.score;
        else if (m.exam_type === "midterm") subj.midterm = m.score;
        else if (m.exam_type === "eot") subj.eot = m.score;
        subj.total = (subj.bot ?? 0) + (subj.midterm ?? 0) + (subj.eot ?? 0);
        subjectMap.set(m.subject_id, subj);
      }

      const subjects = Array.from(subjectMap.entries()).map(([subjectId, data]) => {
        const examCount = [data.bot, data.midterm, data.eot].filter((v) => v !== undefined).length;
        const avgPercentage = examCount > 0 ? data.total / examCount : 0;
        return {
          name: subjectNameMap.get(subjectId) || "Subject",
          bot: data.bot,
          midterm: data.midterm,
          eot: data.eot,
          total: data.total,
          grade: getGrade(avgPercentage, gradingScales.length > 0 ? gradingScales : undefined),
        };
      });

      // Fetch attendance
      let daysPresent = 0;
      let daysOpen = 0;
      if (termDates) {
        const { data: attRecords } = await supabase
          .from("attendance_records")
          .select("status")
          .eq("student_id", rc.student_id)
          .gte("date", termDates.start_date)
          .lte("date", termDates.end_date);
        daysOpen = attRecords?.length ?? 0;
        daysPresent = (attRecords ?? []).filter((r: any) => r.status === "present" || r.status === "late").length;
      }

      const pdfBlob = await pdf(
        <ReportCardPDF
          school={{
            name: school?.name || "School",
            address: (school as any)?.address,
            motto: (school as any)?.motto,
            logo_url: (school as any)?.logo_url,
          }}
          student={{
            full_name: studentName,
            admission_number: admissionNo,
            class_name: className,
          }}
          term={termObj?.name || "Term"}
          academic_year={termObj?.academic_year_id || ""}
          subjects={subjects}
          summary={{
            total_marks: rc.total_marks ?? 0,
            average: rc.average ?? 0,
            position: rc.position_in_class ?? 0,
            class_size: rc.class_size ?? 0,
          }}
          attendance={{ days_present: daysPresent, days_open: daysOpen }}
          comments={{
            class_teacher: rc.class_teacher_comment || undefined,
            headmaster: rc.headmaster_comment || undefined,
          }}
          conduct_grade={rc.conduct_grade || undefined}
          next_term_date={nextTerm?.start_date || undefined}
        />
      ).toBlob();

      const url = URL.createObjectURL(pdfBlob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${admissionNo}_${studentName.replace(/[^a-zA-Z0-9 ]/g, "").replace(/\s+/g, "_")}_report_card.pdf`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      toast({
        title: "PDF download failed",
        description: err instanceof Error ? err.message : "Unknown error",
        variant: "destructive",
      });
    }
    setDownloadingStudentId(null);
  };

  const handleDownloadZip = async () => {
    if (reportCards.length === 0) return;
    setZipLoading(true);
    try {
      const zip = new JSZip();
      let added = 0;

      // Batch-fetch all marks for the class/term with subject_id and exam_type
      const studentIds = reportCards.map((rc) => rc.student_id);
      const { data: allMarks } = await supabase
        .from("marks")
        .select("student_id, subject_id, exam_type, score, max_score, subjects(name)")
        .eq("class_id", selectedClass)
        .eq("term_id", selectedTermId)
        .in("student_id", studentIds)
        .eq("is_deleted", false);

      // Batch-fetch subjects for the class
      const { data: classSubjects } = await supabase
        .from("class_subjects")
        .select("subject_id, subjects(id, name)")
        .eq("class_id", selectedClass);

      const subjectNameMap = new Map<string, string>();
      for (const cs of (classSubjects ?? []) as any[]) {
        if (cs.subjects) subjectNameMap.set(cs.subject_id, cs.subjects.name);
      }

      // Batch-fetch attendance for all students in the term
      const attendanceMap = new Map<string, { present: number; total: number }>();
      if (termDates) {
        const { data: attRecords } = await supabase
          .from("attendance_records")
          .select("student_id, status")
          .in("student_id", studentIds)
          .gte("date", termDates.start_date)
          .lte("date", termDates.end_date);

        for (const r of (attRecords ?? []) as any[]) {
          const existing = attendanceMap.get(r.student_id) ?? { present: 0, total: 0 };
          existing.total++;
          if (r.status === "present" || r.status === "late") existing.present++;
          attendanceMap.set(r.student_id, existing);
        }
      }

      // Build per-student subject marks
      const studentSubjectMarks = new Map<string, any[]>();
      for (const m of (allMarks ?? []) as any[]) {
        const existing = studentSubjectMarks.get(m.student_id) ?? [];
        existing.push(m);
        studentSubjectMarks.set(m.student_id, existing);
      }

      const className = classes.find((c) => c.id === selectedClass)?.name || "Class";
      const termObj = terms.find((t) => t.id === selectedTermId);

      for (const rc of reportCards) {
        const studentName = rc.students?.full_name || "Unknown";
        const admissionNo = rc.students?.admission_number || "N/A";
        const studentMarks = studentSubjectMarks.get(rc.student_id) ?? [];

        // Group marks by subject with BOT/MID/EOT breakdown
        const subjectMap = new Map<string, { bot?: number; midterm?: number; eot?: number; total: number }>();
        for (const m of studentMarks) {
          const subj = subjectMap.get(m.subject_id) ?? { total: 0 };
          if (m.exam_type === "bot") subj.bot = m.score;
          else if (m.exam_type === "midterm") subj.midterm = m.score;
          else if (m.exam_type === "eot") subj.eot = m.score;
          subj.total = (subj.bot ?? 0) + (subj.midterm ?? 0) + (subj.eot ?? 0);
          subjectMap.set(m.subject_id, subj);
        }

        const subjects = Array.from(subjectMap.entries()).map(([subjectId, data]) => {
          const examCount = [data.bot, data.midterm, data.eot].filter((v) => v !== undefined).length;
          const avgPercentage = examCount > 0 ? data.total / examCount : 0;
          return {
            name: subjectNameMap.get(subjectId) || "Subject",
            bot: data.bot,
            midterm: data.midterm,
            eot: data.eot,
            total: data.total,
            grade: getGrade(avgPercentage, gradingScales.length > 0 ? gradingScales : undefined),
          };
        });

        // Get attendance for this student
        const att = attendanceMap.get(rc.student_id) ?? { present: 0, total: 0 };

        // Generate PDF blob
        const pdfBlob = await pdf(
          <ReportCardPDF
            school={{
              name: school?.name || "School",
              address: (school as any)?.address,
              motto: (school as any)?.motto,
              logo_url: (school as any)?.logo_url,
            }}
            student={{
              full_name: studentName,
              admission_number: admissionNo,
              class_name: className,
            }}
            term={termObj?.name || "Term"}
            academic_year={termObj?.academic_year_id || ""}
            subjects={subjects}
            summary={{
              total_marks: rc.total_marks ?? 0,
              average: rc.average ?? 0,
              position: rc.position_in_class ?? 0,
              class_size: rc.class_size ?? 0,
            }}
            attendance={{ days_present: att.present, days_open: att.total }}
            comments={{
              class_teacher: rc.class_teacher_comment || undefined,
              headmaster: rc.headmaster_comment || undefined,
            }}
            conduct_grade={rc.conduct_grade || undefined}
            next_term_date={nextTerm?.start_date || undefined}
          />
        ).toBlob();

        const safeName = studentName.replace(/[^a-zA-Z0-9 ]/g, "").replace(/\s+/g, "_");
        zip.file(`${admissionNo}_${safeName}_report_card.pdf`, pdfBlob);
        added++;
      }

      if (added === 0) {
        toast({ title: "No report cards to download", variant: "destructive" });
        setZipLoading(false);
        return;
      }

      const content = await zip.generateAsync({ type: "blob" });
      const termName = terms.find((t) => t.id === selectedTermId)?.name || "Term";
      saveAs(content, `${className}_${termName}_report_cards.zip`);
      toast({ title: "ZIP downloaded", description: `${added} report cards exported as PDF.` });
    } catch (err) {
      toast({
        title: "ZIP download failed",
        description: err instanceof Error ? err.message : "Unknown error",
        variant: "destructive",
      });
    }
    setZipLoading(false);
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="space-y-6"
    >
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold font-display">Report Cards</h1>
          <p className="text-muted text-sm mt-1">
            Generate, review, and publish student report cards
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant="outline"
            onClick={() => generateMutation.mutate()}
            disabled={!showTable || isGenerating}
          >
            {isGenerating ? (
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
            ) : (
              <FileText className="w-4 h-4 mr-2" />
            )}
            Generate All
          </Button>
          <Button
            variant="secondary"
            onClick={() => publishMutation.mutate()}
            disabled={!showTable || reportCards.length === 0 || isPublishing}
          >
            {isPublishing ? (
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
            ) : (
              <Send className="w-4 h-4 mr-2" />
            )}
            Publish
          </Button>
          <Button
            variant="outline"
            onClick={handleDownloadZip}
            disabled={!showTable || reportCards.length === 0 || zipLoading}
          >
            {zipLoading ? (
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
            ) : (
              <Download className="w-4 h-4 mr-2" />
            )}
            Download ZIP
          </Button>
        </div>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="p-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Class</Label>
              <Select
                value={selectedClass}
                onValueChange={setSelectedClass}
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
              <Label>Term</Label>
              <Select
                value={selectedTermId}
                onValueChange={setSelectedTermId}
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

      {/* Summary Cards */}
      {showTable && reportCards.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <Card>
            <CardContent className="p-4 text-center">
              <p className="text-2xl font-bold text-warning-600">
                {reportCards.length}
              </p>
              <p className="text-xs text-muted mt-1">Students</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 text-center">
              <p className="text-2xl font-bold text-success-600">
                {publishedCount}
              </p>
              <p className="text-xs text-muted mt-1">Published</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 text-center">
              <p className="text-2xl font-bold text-secondary">
                {reportCards.length - publishedCount}
              </p>
              <p className="text-xs text-muted mt-1">Draft</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 text-center">
              <p className="text-2xl font-bold">
                {reportCards.length > 0
                  ? (
                      reportCards.reduce(
                        (sum, rc) => sum + (rc.average ?? 0),
                        0
                      ) / reportCards.length
                    ).toFixed(1)
                  : "\u2014"}
              </p>
              <p className="text-xs text-muted mt-1">
                Class Average
              </p>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Content */}
      {!showTable ? (
        <EmptyState
          icon={FileText}
          title="Select class and term"
          description="Choose a class and term above to view or generate report cards."
        />
      ) : isLoading || isFetching ? (
        <div className="space-y-3">
          {[...Array(6)].map((_, i) => (
            <Skeleton key={i} className="h-20 rounded-xl" />
          ))}
        </div>
      ) : reportCards.length === 0 ? (
        <EmptyState
          icon={Users}
          title="No report cards yet"
          description="Click 'Generate All' to create report cards for all students in this class."
          action={
            <Button
              onClick={() => generateMutation.mutate()}
              disabled={isGenerating}
            >
              {isGenerating ? (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              ) : (
                <FileText className="w-4 h-4 mr-2" />
              )}
              Generate Report Cards
            </Button>
          }
        />
      ) : (
        <Card>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <Table className="min-w-[600px]">
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-12">Pos.</TableHead>
                    <TableHead>Student</TableHead>
                    <TableHead className="text-center w-24">Total</TableHead>
                    <TableHead className="text-center w-24">Average</TableHead>
                    <TableHead className="text-center w-24">Conduct</TableHead>
                    <TableHead>Class Teacher Comment</TableHead>
                    <TableHead>Headmaster Comment</TableHead>
                    <TableHead className="text-center w-20">Status</TableHead>
                    <TableHead className="w-24">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {reportCards.map((rc, i) => {
                    const studentName = rc.students?.full_name ?? "Unknown";
                    const admissionNo = rc.students?.admission_number ?? "";
                    const avgGrade =
                      rc.average != null ? getGrade(rc.average, gradingScales.length > 0 ? gradingScales : undefined) : null;

                    const isEditingTeacher =
                      editingComment?.id === rc.id &&
                      editingComment.field === "class_teacher_comment";
                    const isEditingHead =
                      editingComment?.id === rc.id &&
                      editingComment.field === "headmaster_comment";

                    return (
                      <motion.tr
                        key={rc.id}
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        transition={{ delay: i * 0.03 }}
                        className="border-b border-border"
                      >
                        <TableCell>
                          <span className="font-bold text-warning-600 text-lg">
                            {rc.position_in_class ?? "\u2014"}
                          </span>
                        </TableCell>
                        <TableCell>
                          <div>
                            <p className="font-medium text-sm">
                              {studentName}
                            </p>
                            <p className="text-xs text-muted font-mono">
                              {admissionNo}
                            </p>
                          </div>
                        </TableCell>
                        <TableCell className="text-center font-mono">
                          {rc.total_marks ?? "\u2014"}
                        </TableCell>
                        <TableCell className="text-center">
                          {rc.average != null ? (
                            <div className="flex flex-col items-center gap-0.5">
                              <span className="font-mono">
                                {rc.average.toFixed(1)}
                              </span>
                              {avgGrade && (
                                <Badge
                                  className={cn(
                                    "text-[10px] px-1.5 py-0",
                                    getGradeBgColor(avgGrade)
                                  )}
                                >
                                  {avgGrade}
                                </Badge>
                              )}
                            </div>
                          ) : (
                            "\u2014"
                          )}
                        </TableCell>
                        <TableCell>
                          <Select
                            value={rc.conduct_grade ?? ""}
                            onValueChange={(grade) =>
                              updateConductMutation.mutate({
                                id: rc.id,
                                grade,
                              })
                            }
                          >
                            <SelectTrigger className="h-8 w-20 text-xs">
                              <SelectValue placeholder="\u2014" />
                            </SelectTrigger>
                            <SelectContent>
                              {CONDUCT_GRADES.map((g) => (
                                <SelectItem key={g} value={g}>
                                  {g} - {CONDUCT_LABELS[g]}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </TableCell>
                        <TableCell>
                          {isEditingTeacher ? (
                            <div className="flex items-center gap-1">
                              <Textarea
                                value={editingComment.value}
                                onChange={(e) =>
                                  setEditingComment({
                                    ...editingComment,
                                    value: e.target.value,
                                  })
                                }
                                className="min-h-[60px] text-xs"
                                autoFocus
                              />
                              <div className="flex flex-col gap-1">
                                <Button
                                  size="icon"
                                  variant="ghost"
                                  className="h-6 w-6"
                                  onClick={saveComment}
                                  disabled={updateCommentMutation.isPending}
                                >
                                  <Check className="w-3 h-3 text-success-600" />
                                </Button>
                                <Button
                                  size="icon"
                                  variant="ghost"
                                  className="h-6 w-6"
                                  onClick={cancelEditComment}
                                >
                                  <X className="w-3 h-3 text-danger-600" />
                                </Button>
                              </div>
                            </div>
                          ) : (
                            <button
                              onClick={() =>
                                startEditComment(
                                  rc.id,
                                  "class_teacher_comment",
                                  rc.class_teacher_comment
                                )
                              }
                              className="text-left w-full group"
                            >
                              <p className="text-xs text-muted line-clamp-2 group-hover:text-heading transition-colors">
                                {rc.class_teacher_comment || (
                                  <span className="italic text-muted">
                                    Click to add comment...
                                  </span>
                                )}
                              </p>
                              <Pencil className="w-3 h-3 text-muted group-hover:text-warning-600 mt-1 transition-colors" />
                            </button>
                          )}
                        </TableCell>
                        <TableCell>
                          {isEditingHead ? (
                            <div className="flex items-center gap-1">
                              <Textarea
                                value={editingComment.value}
                                onChange={(e) =>
                                  setEditingComment({
                                    ...editingComment,
                                    value: e.target.value,
                                  })
                                }
                                className="min-h-[60px] text-xs"
                                autoFocus
                              />
                              <div className="flex flex-col gap-1">
                                <Button
                                  size="icon"
                                  variant="ghost"
                                  className="h-6 w-6"
                                  onClick={saveComment}
                                  disabled={updateCommentMutation.isPending}
                                >
                                  <Check className="w-3 h-3 text-success-600" />
                                </Button>
                                <Button
                                  size="icon"
                                  variant="ghost"
                                  className="h-6 w-6"
                                  onClick={cancelEditComment}
                                >
                                  <X className="w-3 h-3 text-danger-600" />
                                </Button>
                              </div>
                            </div>
                          ) : (
                            <button
                              onClick={() =>
                                startEditComment(
                                  rc.id,
                                  "headmaster_comment",
                                  rc.headmaster_comment
                                )
                              }
                              className="text-left w-full group"
                            >
                              <p className="text-xs text-muted line-clamp-2 group-hover:text-heading transition-colors">
                                {rc.headmaster_comment || (
                                  <span className="italic text-muted">
                                    Click to add comment...
                                  </span>
                                )}
                              </p>
                              <Pencil className="w-3 h-3 text-muted group-hover:text-warning-600 mt-1 transition-colors" />
                            </button>
                          )}
                        </TableCell>
                        <TableCell className="text-center">
                          <Badge
                            variant={
                              rc.is_published ? "success" : "secondary"
                            }
                            className="text-[10px]"
                          >
                            {rc.is_published ? "Published" : "Draft"}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-1">
                            <Button
                              size="icon"
                              variant="ghost"
                              className="h-8 w-8"
                              disabled={downloadingStudentId === rc.student_id}
                              onClick={() => handleDownloadSinglePdf(rc)}
                            >
                              {downloadingStudentId === rc.student_id ? (
                                <Loader2 className="w-4 h-4 animate-spin" />
                              ) : (
                                <Download className="w-4 h-4" />
                              )}
                            </Button>
                            {rc.is_published && (
                              <Button
                                size="icon"
                                variant="ghost"
                                className="h-8 w-8"
                                disabled={sendingSmsId === rc.student_id}
                                onClick={() => shareReportCardViaSMS(rc)}
                              >
                                {sendingSmsId === rc.student_id ? (
                                  <Loader2 className="w-4 h-4 animate-spin" />
                                ) : (
                                  <Send className="w-4 h-4" />
                                )}
                              </Button>
                            )}
                          </div>
                        </TableCell>
                      </motion.tr>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      )}
    </motion.div>
  );
}

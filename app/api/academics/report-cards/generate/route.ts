import { NextRequest } from "next/server";
import type { Database } from "@/types/database";
import { generateReportCardsSchema } from "@/lib/validations/marks";
import { type GradingScaleRow } from "@/lib/utils/grades";
import {
  getSupabaseAndUser,
  requireSchool,
  requireRole,
  successResponse,
  errorResponse,
} from "@/lib/api-helpers";

type StudentRow = Database["public"]["Tables"]["students"]["Row"];
type MarkRow = Database["public"]["Tables"]["marks"]["Row"];
type ClassRow = Database["public"]["Tables"]["classes"]["Row"];
type ClassSubjectRow = Database["public"]["Tables"]["class_subjects"]["Row"];
type SubjectRow = Database["public"]["Tables"]["subjects"]["Row"];
type ClassEnrollmentRow = Database["public"]["Tables"]["class_enrollments"]["Row"];
type ReportCardRow = Database["public"]["Tables"]["report_cards"]["Row"];

type EnrolledStudent = ClassEnrollmentRow & {
  student: Pick<StudentRow, "id" | "full_name" | "admission_number"> | null;
};

type ClassSubjectWithSubject = ClassSubjectRow & {
  subject: Pick<SubjectRow, "id" | "name" | "code" | "max_marks"> | null;
};

export async function POST(request: NextRequest) {
  try {
    const ctx = await getSupabaseAndUser();
    const schoolId = requireSchool(ctx);
    requireRole(ctx, ["SCHOOL_ADMIN", "TEACHER", "SUPER_ADMIN"]);

    const body = await request.json();
    const parsed = generateReportCardsSchema.safeParse(body);
    if (!parsed.success) {
      return errorResponse(parsed.error.issues[0].message, 400);
    }

    const { class_id, term_id, academic_year_id } = parsed.data;

    // Verify class belongs to this school
    const { data: cls } = await ctx.supabase
      .from("classes")
      .select("id, name")
      .eq("id", class_id)
      .eq("school_id", schoolId)
      .single() as unknown as { data: Pick<ClassRow, "id" | "name"> | null };

    if (!cls) {
      return errorResponse("Invalid class for this school", 400);
    }

    // Get all enrolled students in this class for this term
    const { data: enrollments } = await ctx.supabase
      .from("class_enrollments")
      .select("student_id, student:students(id, full_name, admission_number)")
      .eq("class_id", class_id)
      .eq("term_id", term_id) as unknown as { data: EnrolledStudent[] | null };

    if (!enrollments || enrollments.length === 0) {
      return errorResponse("No enrolled students found for this class and term", 400);
    }

    const studentIds = enrollments.map((e) => e.student_id);

    // Get all marks for these students in this class/term
    const { data: allMarks } = await ctx.supabase
      .from("marks")
      .select("student_id, subject_id, score, max_score, exam_type")
      .eq("school_id", schoolId)
      .eq("class_id", class_id)
      .eq("term_id", term_id)
      .in("student_id", studentIds)
      .eq("is_deleted", false) as unknown as { data: Pick<MarkRow, "student_id" | "subject_id" | "score" | "max_score">[] | null };

    if (!allMarks || allMarks.length === 0) {
      return errorResponse("No marks found for this class and term", 400);
    }

    // Get subjects for this class to determine total possible marks
    const { data: classSubjects } = await ctx.supabase
      .from("class_subjects")
      .select("subject_id, subject:subjects(id, name, code, max_marks)")
      .eq("class_id", class_id) as unknown as { data: ClassSubjectWithSubject[] | null };

    const subjectMap = new Map<string, { name: string; code: string; max_marks: number }>();
    if (classSubjects) {
      for (const cs of classSubjects) {
        if (cs.subject) {
          const subj = cs.subject;
          subjectMap.set(cs.subject_id, {
            name: subj.name,
            code: subj.code,
            max_marks: subj.max_marks,
          });
        }
      }
    }

    // Fetch grading scales for this school
    const { data: gradingScaleData } = await ctx.supabase
      .from("grading_scales")
      .select("grade, min_score, max_score, label")
      .eq("school_id", schoolId)
      .eq("is_deleted", false)
      .order("sort_order") as unknown as { data: GradingScaleRow[] | null };
    const gradingScales = gradingScaleData ?? [];

    // Compute totals per student with BOT/MID/EOT breakdown
    type SubjectBreakdown = {
      bot?: number;
      midterm?: number;
      eot?: number;
      assignment?: number;
      practical?: number;
      total: number;
      maxScore: number;
    };

    type StudentResult = {
      studentId: string;
      studentName: string;
      admissionNumber: string;
      totalMarks: number;
      totalMaxMarks: number;
      average: number;
      subjectCount: number;
      subjectBreakdowns: Map<string, SubjectBreakdown>;
    };

    const studentResults: StudentResult[] = [];

    for (const enrollment of enrollments) {
      const studentMarks = allMarks.filter(
        (m) => m.student_id === enrollment.student_id
      );

      if (studentMarks.length === 0) continue;

      // Preserve per-exam-type scores per subject
      const subjectBreakdowns = new Map<string, SubjectBreakdown>();
      for (const mark of studentMarks) {
        const existing = subjectBreakdowns.get(mark.subject_id) ?? { total: 0, maxScore: 0 };
        if (mark.exam_type === "bot") existing.bot = mark.score;
        else if (mark.exam_type === "midterm") existing.midterm = mark.score;
        else if (mark.exam_type === "eot") existing.eot = mark.score;
        else if (mark.exam_type === "assignment") existing.assignment = mark.score;
        else if (mark.exam_type === "practical") existing.practical = mark.score;

        // Recalculate total as sum of BOT + MID + EOT (core exams)
        existing.total = (existing.bot ?? 0) + (existing.midterm ?? 0) + (existing.eot ?? 0);
        // Max score = number of core exams present * max_score per exam
        const coreExamCount = [existing.bot, existing.midterm, existing.eot].filter((v) => v !== undefined).length;
        existing.maxScore = coreExamCount * mark.max_score;
        subjectBreakdowns.set(mark.subject_id, existing);
      }

      let totalMarks = 0;
      let totalMaxMarks = 0;
      for (const [, val] of subjectBreakdowns) {
        totalMarks += val.total;
        totalMaxMarks += val.maxScore;
      }

      const subjectCount = subjectBreakdowns.size;
      const average = totalMaxMarks > 0 ? Math.round((totalMarks / totalMaxMarks) * 100 * 100) / 100 : 0;

      const student = enrollment.student;
      studentResults.push({
        studentId: enrollment.student_id,
        studentName: student?.full_name ?? "Unknown",
        admissionNumber: student?.admission_number ?? "",
        totalMarks,
        totalMaxMarks,
        average,
        subjectCount,
        subjectBreakdowns,
      });
    }

    // Sort by totalMarks descending and assign positions
    studentResults.sort((a, b) => b.totalMarks - a.totalMarks);
    const classSize = studentResults.length;

    // Upsert report cards with grading scale-aware averages
    const reportCardRecords = studentResults.map((sr, index) => ({
      school_id: schoolId,
      student_id: sr.studentId,
      term_id,
      academic_year_id,
      total_marks: sr.totalMarks,
      average: sr.average,
      position_in_class: index + 1,
      class_size: classSize,
      is_published: false,
    }));

    const { data: reportCards, error } = await ctx.supabase
      .from("report_cards")
      .upsert(reportCardRecords as Record<string, unknown>[], { onConflict: "student_id,term_id,academic_year_id" })
      .select();

    if (error) return errorResponse(error.message);

    // Audit log
    await ctx.supabase.from("audit_logs").insert({
      school_id: schoolId,
      user_id: ctx.user.id,
      action: "report_cards_generated",
      entity_type: "report_card",
      new_value: {
        class_id,
        term_id,
        class_name: cls.name,
        students_processed: classSize,
      },
    });

    return successResponse({
      report_cards: reportCards ?? [],
      class_size: classSize,
      class_name: cls.name,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Internal server error";
    const status = err instanceof Error && "status" in err ? (err as any).status : 500;
    return errorResponse(message, status);
  }
}

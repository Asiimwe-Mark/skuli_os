import type { Database } from "@/types/database";
import { generateReportCardsSchema } from "@/lib/validations/marks";
import "@/lib/utils/grades";
import { route, errorResponse, dbError } from "@/lib/http";
import { invalidateSchoolAsync } from "@/lib/api-cache";

type StudentRow = Database["public"]["Tables"]["students"]["Row"];
type MarkRow = Database["public"]["Tables"]["marks"]["Row"];
type ClassRow = Database["public"]["Tables"]["classes"]["Row"];
type ClassSubjectRow = Database["public"]["Tables"]["class_subjects"]["Row"];
type SubjectRow = Database["public"]["Tables"]["subjects"]["Row"];
type ClassEnrollmentRow = Database["public"]["Tables"]["class_enrollments"]["Row"];

type EnrolledStudent = ClassEnrollmentRow & {
  student: Pick<StudentRow, "id" | "full_name" | "admission_number"> | null;
};

type ClassSubjectWithSubject = ClassSubjectRow & {
  subject: Pick<SubjectRow, "id" | "name" | "code" | "max_marks"> | null;
};

export const POST = route({
  roles: ["SCHOOL_ADMIN", "TEACHER", "SUPER_ADMIN"],
  schema: generateReportCardsSchema,
  handler: async (ctx, body) => {
    const { class_id, term_id, academic_year_id } = body;

    // Verify class belongs to this school
    const { data: cls } = await ctx.supabase
      .from("classes")
      .select("id, name")
      .eq("id", class_id)
      .eq("school_id", ctx.schoolId)
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
      .eq("school_id", ctx.schoolId)
      .eq("class_id", class_id)
      .eq("term_id", term_id)
      .in("student_id", studentIds)
      .eq("is_deleted", false) as unknown as { data: Pick<MarkRow, "student_id" | "subject_id" | "score" | "max_score" | "exam_type">[] | null };

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
            code: subj.code ?? '',
            max_marks: subj.max_marks,
          });
        }
      }
    }

    // Fetch grading scales for this school
    await ctx.supabase
      .from("grading_scales")
      .select("grade, min_score, max_score, label")
      .eq("school_id", ctx.schoolId)
      .eq("is_deleted", false)
      .order("sort_order");

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
        if (mark.exam_type === "bot") existing.bot = mark.score ?? undefined;
        else if (mark.exam_type === "midterm") existing.midterm = mark.score ?? undefined;
        else if (mark.exam_type === "eot") existing.eot = mark.score ?? undefined;
        else if (mark.exam_type === "assignment") existing.assignment = mark.score ?? undefined;
        else if (mark.exam_type === "practical") existing.practical = mark.score ?? undefined;

        // Recalculate total as sum of BOT + MID + EOT (core exams)
        existing.total = (existing.bot ?? 0) + (existing.midterm ?? 0) + (existing.eot ?? 0);
        // Max score = number of core exams present * max_score per exam
        const coreExamCount = [existing.bot, existing.midterm, existing.eot].filter((v) => v !== undefined).length;
        existing.maxScore = coreExamCount * (mark.max_score ?? 100);
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

    // Sort by average descending and assign positions
    studentResults.sort((a, b) => b.average - a.average);
    const classSize = studentResults.length;

    // Upsert report cards with grading scale-aware averages
    const reportCardRecords = studentResults.map((sr, index) => ({
      school_id: ctx.schoolId,
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
      .upsert(reportCardRecords as Database["public"]["Tables"]["report_cards"]["Insert"][], { onConflict: "student_id,term_id,academic_year_id" })
      .select();

    if (error) return dbError(error, "Database error");

    // Audit log
    await ctx.supabase.from("audit_logs").insert({
      school_id: ctx.schoolId,
      user_id: ctx.user.id,
      action: "report_cards_generated",
      entity_type: "report_card",
      entity_id: null,
      old_value: null,
      new_value: {
        class_id,
        term_id,
        class_name: cls.name,
        students_processed: classSize,
      },
    } as never);

    void invalidateSchoolAsync(ctx.schoolId);

    return {
      report_cards: reportCards ?? [],
      class_size: classSize,
      class_name: cls.name,
    };
  },
});

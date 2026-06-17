import { NextRequest } from "next/server";
import { ReportCardPDF } from "@/lib/pdf/report-card";
import { Document, renderToBuffer } from "@react-pdf/renderer";
import React from "react";
import {
  getSupabaseAndUser,
  errorResponse,
  AuthError,
} from "@/lib/api-helpers";

export async function GET(request: NextRequest) {
  try {
    const ctx = await getSupabaseAndUser();

    const { searchParams } = new URL(request.url);
    const studentId = searchParams.get("student_id");
    const termId = searchParams.get("term_id");

    if (!studentId || !termId) {
      return errorResponse("student_id and term_id are required", 400);
    }

    // SECURITY (audit H-2): parent_students is the SOLE authority on
    // which students belong to which parent. The previous version fell
    // back to phone/email matches, which leaked report cards
    // (sensitive grade and attendance data) to any parent whose phone
    // or email matched a child's row. Phone/email are mutable, not
    // unique, and can be reassigned. We now require a parent_students
    // link row and reject otherwise.
    const { data: parentLink } = await ctx.supabase
      .from("parent_students")
      .select("student_id")
      .eq("parent_id", ctx.user.id)
      .eq("student_id", studentId)
      .maybeSingle();

    if (!parentLink) {
      return errorResponse("Not authorized for this student", 403);
    }

    // Get student info
    const { data: student } = await ctx.supabase
      .from("students")
      .select("full_name, admission_number, photo_url, school_id, current_class:classes(name), school:schools(name, address, motto, logo_url)")
      .eq("id", studentId)
      .maybeSingle();

    if (!student) {
      return errorResponse("Student not found", 404);
    }

    // Get term info
    const { data: term } = await ctx.supabase
      .from("terms")
      .select("id, name, academic_years(name)")
      .eq("id", termId)
      .maybeSingle();

    // Get report card
    const { data: reportCard } = await ctx.supabase
      .from("report_cards")
      .select("*")
      .eq("student_id", studentId)
      .eq("term_id", termId)
      .eq("is_published", true)
      .maybeSingle();

    if (!reportCard) {
      return errorResponse("Report card not found", 404);
    }

    // Get attendance for the term
    const { data: termDates } = await ctx.supabase
      .from("terms")
      .select("start_date, end_date")
      .eq("id", termId)
      .maybeSingle();

    let daysPresent = 0;
    let daysOpen = 0;
    if (termDates) {
      const { data: attRecords } = await ctx.supabase
        .from("attendance_records")
        .select("status")
        .eq("student_id", studentId)
        .gte("date", termDates.start_date)
        .lte("date", termDates.end_date);

      // Get holidays that affect attendance
      const studentAny = student as { school_id?: string };
      const schoolId = studentAny?.school_id;
      const allHolidayDates = new Set<string>();
      if (schoolId) {
        const { data: holidays } = await ctx.supabase
          .from("calendar_events")
          .select("event_date, end_date")
          .eq("school_id", schoolId)
          .eq("affects_attendance", true)
          .eq("is_deleted", false)
          .lte("event_date", termDates.end_date)
          .or(`end_date.gte.${termDates.start_date},end_date.is.null`);
        (holidays || []).forEach((h: { event_date: string; end_date: string | null }) => {
          const s = new Date(h.event_date);
          const e = h.end_date ? new Date(h.end_date) : s;
          for (let d = new Date(s); d <= e; d.setDate(d.getDate() + 1)) {
            allHolidayDates.add(d.toISOString().split("T")[0]);
          }
        });
      }

      // Compute school days in the term (weekdays minus holidays)
      const startDate = new Date(termDates.start_date ?? '');
      const endDate = new Date(termDates.end_date ?? '');
      let totalWorkingDays = 0;
      for (let d = new Date(startDate); d <= endDate; d.setDate(d.getDate() + 1)) {
        const day = d.getDay();
        if (day !== 0 && day !== 6) {
          const dateStr = d.toISOString().split("T")[0];
          if (!allHolidayDates.has(dateStr)) totalWorkingDays++;
        }
      }
      daysOpen = totalWorkingDays;
      daysPresent = (attRecords || []).filter((r: { status: string }) => r.status === "present" || r.status === "late").length;
    }

    const studentData = student as unknown as {
      full_name: string;
      admission_number: string;
      photo_url: string | null;
      current_class: { name: string } | null;
      school: { name: string; address: string | null; motto: string | null; logo_url: string | null } | null;
    };

    const termData = term as unknown as {
      name: string;
      academic_years: { name: string } | null;
    } | null;

    if (!termData) {
      return errorResponse("Term not found", 404);
    }

    // Compute subjects from marks (report_cards table doesn't store subjects array)
    const { data: marksData } = await ctx.supabase
      .from("marks")
      .select("subject_id, exam_type, score, max_score, subjects(name)")
      .eq("student_id", studentId)
      .eq("term_id", termId);

    // Fetch grading scales for this school
    const studentSchoolId = (student as { school_id?: string } | null)?.school_id;
    type GradingScale = { grade: string; min_score: number; max_score: number; label: string };
    const { data: gradingScales } = (await ctx.supabase
      .from("grading_scales")
      .select("grade, min_score, max_score, label")
      .eq("school_id", studentSchoolId ?? "")
      .eq("is_deleted", false)
      .order("sort_order")) as unknown as { data: GradingScale[] | null };

    // Group marks by subject and compute totals
    type SubjEntry = { name: string; total: number; maxScore: number; bot?: number; midterm?: number; eot?: number };
    const subjectMap = new Map<string, SubjEntry>();
    for (const mark of marksData ?? []) {
      const subjId = mark.subject_id;
      let existing = subjectMap.get(subjId);
      if (!existing) {
        existing = { name: (mark as { subjects?: { name?: string } | null }).subjects?.name ?? subjId, total: 0, maxScore: 0, bot: undefined, midterm: undefined, eot: undefined };
      }
      if (mark.exam_type === "bot") existing.bot = mark.score ?? undefined;
      else if (mark.exam_type === "midterm") existing.midterm = mark.score ?? undefined;
      else if (mark.exam_type === "eot") existing.eot = mark.score ?? undefined;
      existing.total = (existing.bot ?? 0) + (existing.midterm ?? 0) + (existing.eot ?? 0);
      const coreCount = [existing.bot, existing.midterm, existing.eot].filter(v => v !== undefined).length;
      existing.maxScore = coreCount * (mark.max_score ?? 100);
      subjectMap.set(subjId, existing);
    }

    function getGrade(avg: number): string {
      if (!gradingScales || gradingScales.length === 0) return "";
      for (const gs of gradingScales) {
        if (avg >= gs.min_score && avg <= gs.max_score) return gs.grade;
      }
      return "";
    }

    const subjects = Array.from(subjectMap.values()).map((s) => ({
      name: s.name,
      total: s.total,
      grade: getGrade(s.maxScore > 0 ? Math.round((s.total / s.maxScore) * 100) : 0),
      remarks: "",
    }));

    const pdfData = {
      school: {
        name: studentData.school?.name || "School",
        address: studentData.school?.address || undefined,
        motto: studentData.school?.motto || undefined,
        logo_url: studentData.school?.logo_url || undefined,
      },
      student: {
        full_name: studentData.full_name,
        admission_number: studentData.admission_number,
        photo_url: studentData.photo_url || undefined,
        class_name: studentData.current_class?.name || "",
      },
      term: termData.name,
      academic_year: termData.academic_years?.name || "",
      subjects,
      summary: {
        total_marks: reportCard.total_marks ?? 0,
        average: reportCard.average ?? 0,
        position: reportCard.position_in_class ?? 0,
        class_size: reportCard.class_size ?? 0,
      },
      attendance: {
        days_present: daysPresent,
        days_open: daysOpen,
      },
      comments: {
        class_teacher: reportCard.class_teacher_comment || undefined,
      },
    };

    const buffer = await renderToBuffer(
      React.createElement(Document, null, React.createElement(ReportCardPDF, pdfData))
    );

    return new Response(new Uint8Array(buffer), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="report-card-${studentData.admission_number}-${termData.name}.pdf"`,
      },
    });
  } catch (e) {
    if (e instanceof AuthError) return errorResponse(e.message, e.status);
    console.error("Report card PDF error:", e);
    return errorResponse("Internal server error", 500);
  }
}

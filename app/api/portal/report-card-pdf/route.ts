import { NextRequest } from "next/server";
import { createClient as createServerClient } from "@/lib/supabase/server";
import { ReportCardPDF } from "@/lib/pdf/report-card";
import { Document, renderToBuffer } from "@react-pdf/renderer";
import React from "react";

export async function GET(request: NextRequest) {
  try {
    const supabase = await createServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const studentId = searchParams.get("student_id");
    const termId = searchParams.get("term_id");

    if (!studentId || !termId) {
      return new Response(JSON.stringify({ error: "student_id and term_id are required" }), { status: 400 });
    }

    // Verify this user is a parent of this student (via students.parent_id)
    const { data: parentStudent } = await supabase
      .from("students")
      .select("id")
      .eq("parent_id", user.id)
      .eq("id", studentId)
      .limit(1);

    if (!parentStudent || parentStudent.length === 0) {
      return new Response(JSON.stringify({ error: "Not authorized for this student" }), { status: 403 });
    }

    // Get student info
    const { data: student } = await supabase
      .from("students")
      .select("full_name, admission_number, photo_url, school_id, current_class:classes(name), school:schools(name, address, motto, logo_url)")
      .eq("id", studentId)
      .single();

    if (!student) {
      return new Response(JSON.stringify({ error: "Student not found" }), { status: 404 });
    }

    // Get term info
    const { data: term } = await supabase
      .from("terms")
      .select("id, name, academic_years(name)")
      .eq("id", termId)
      .single();

    // Get report card
    const { data: reportCard } = await supabase
      .from("report_cards")
      .select("*")
      .eq("student_id", studentId)
      .eq("term_id", termId)
      .eq("is_published", true)
      .single();

    if (!reportCard) {
      return new Response(JSON.stringify({ error: "Report card not found" }), { status: 404 });
    }

    // Get attendance for the term
    const { data: termDates } = await supabase
      .from("terms")
      .select("start_date, end_date")
      .eq("id", termId)
      .single();

    let daysPresent = 0;
    let daysOpen = 0;
    if (termDates) {
      const { data: attRecords } = await supabase
        .from("attendance_records")
        .select("status")
        .eq("student_id", studentId)
        .gte("date", termDates.start_date)
        .lte("date", termDates.end_date);

      // Get holidays that affect attendance
      const studentAny = student as any;
      const schoolId = studentAny?.school_id;
      let holidayCount = 0;
      if (schoolId) {
        const { data: holidays } = await supabase
          .from("calendar_events")
          .select("event_date, end_date")
          .eq("school_id", schoolId)
          .eq("affects_attendance", true)
          .eq("is_deleted", false)
          .lte("event_date", termDates.end_date)
          .or(`end_date.gte.${termDates.start_date},end_date.is.null`);

        const holidayDates = new Set<string>();
        (holidays || []).forEach((h: any) => {
          const start = new Date(h.event_date);
          const end = h.end_date ? new Date(h.end_date) : start;
          for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
            holidayDates.add(d.toISOString().split("T")[0]);
          }
        });
        holidayCount = holidayDates.size;
      }

      daysOpen = (attRecords?.length || 0) - holidayCount;
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
    };

    // Map report card subjects to PDF format
    const subjects = (reportCard.subjects || []).map((s: { subject: string; marks: number; grade: string; remark?: string }) => ({
      name: s.subject,
      total: s.marks,
      grade: s.grade,
      remarks: s.remark,
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
        total_marks: reportCard.total_marks,
        average: reportCard.average_marks,
        position: reportCard.class_position,
        class_size: reportCard.total_students,
      },
      attendance: {
        days_present: daysPresent,
        days_open: daysOpen,
      },
      comments: {
        class_teacher: reportCard.class_teacher_comment || undefined,
        headmaster: reportCard.head_comment || undefined,
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
  } catch (err) {
    console.error("Report card PDF error:", err);
    return new Response(JSON.stringify({ error: "Internal server error" }), { status: 500 });
  }
}

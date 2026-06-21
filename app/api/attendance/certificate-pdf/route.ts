import { route, AuthError } from "@/lib/http";
import { AttendanceCertificatePDF } from "@/lib/pdf/attendance-certificate";
import type { AttendanceCertificateData } from "@/lib/pdf/attendance-certificate";
import { Document, renderToBuffer } from "@react-pdf/renderer";
import React from "react";

export const GET = route({
  roles: ["SCHOOL_ADMIN", "BURSAR", "TEACHER", "SUPER_ADMIN"],
  handler: async (ctx, request) => {
    const schoolId = ctx.profile.school_id!;
    const { searchParams } = new URL(request.url);
    const studentId = searchParams.get("student_id");
    const termId = searchParams.get("term_id");

    if (!studentId) {
      throw new AuthError("student_id is required", 400);
    }

    const { data: student } = await ctx.supabase
      .from("students")
      .select(
        "id, full_name, admission_number, current_class_id, current_class:classes(name)",
      )
      .eq("id", studentId)
      .eq("school_id", schoolId)
      .single();

    if (!student) {
      throw new AuthError("Student not found", 404);
    }

    const { data: school } = await ctx.supabase
      .from("schools")
      .select("name")
      .eq("id", schoolId)
      .single();

    let term;
    if (termId) {
      const { data } = await ctx.supabase
        .from("terms")
        .select("id, name, start_date, end_date")
        .eq("id", termId)
        .eq("school_id", schoolId)
        .single();
      term = data;
    } else {
      const { data } = await ctx.supabase
        .from("terms")
        .select("id, name, start_date, end_date")
        .eq("school_id", schoolId)
        .eq("is_current", true)
        .single();
      term = data;
    }

    if (!term) {
      throw new AuthError("Term not found", 404);
    }

    const { data: records } = await ctx.supabase
      .from("attendance_records")
      .select("status, date")
      .eq("student_id", studentId)
      .eq("school_id", schoolId)
      .gte("date", term.start_date)
      .lte("date", term.end_date);

    const { data: holidays } = await ctx.supabase
      .from("calendar_events")
      .select("event_date, end_date")
      .eq("school_id", schoolId)
      .eq("affects_attendance", true)
      .eq("is_deleted", false)
      .lte("event_date", term.end_date)
      .or(`end_date.gte.${term.start_date},end_date.is.null`);

    const holidayDates = new Set<string>();
    (holidays || []).forEach((h: { event_date: string; end_date: string | null }) => {
      const start = new Date(h.event_date);
      const end = h.end_date ? new Date(h.end_date) : start;
      for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
        holidayDates.add(d.toISOString().split("T")[0]);
      }
    });

    function countWeekdays(startDate: string, endDate: string): number {
      let count = 0;
      const current = new Date(startDate);
      const end = new Date(endDate);
      while (current <= end) {
        const day = current.getDay();
        if (day !== 0 && day !== 6) count++;
        current.setDate(current.getDate() + 1);
      }
      return count;
    }

    const totalSchoolDays =
      countWeekdays(term.start_date ?? "", term.end_date ?? "") - holidayDates.size;
    const totalPresent = (records || []).filter(
      (r: { status: string }) => r.status === "present" || r.status === "late",
    ).length;
    const attendanceRate =
      totalSchoolDays > 0
        ? Math.round((totalPresent / totalSchoolDays) * 100)
        : 0;
    const totalDays = totalSchoolDays;

    const studentData = student as unknown as {
      full_name: string;
      admission_number: string;
      current_class_id: string | null;
      current_class: { name: string } | null;
    };

    const { data: classInfo } = await ctx.supabase
      .from("classes")
      .select("class_teacher_id")
      .eq("id", studentData.current_class_id || "")
      .single();

    let classTeacherName = "Class Teacher";
    if (classInfo?.class_teacher_id) {
      const { data: teacher } = await ctx.supabase
        .from("users")
        .select("full_name")
        .eq("id", classInfo.class_teacher_id)
        .single();
      if (teacher) classTeacherName = teacher.full_name;
    }

    const { data: headmaster } = await ctx.supabase
      .from("users")
      .select("full_name")
      .eq("school_id", schoolId)
      .eq("role", "SCHOOL_ADMIN")
      .limit(1)
      .single();

    const data: AttendanceCertificateData = {
      school_name: school?.name || "School",
      student_name: studentData.full_name,
      admission_number: studentData.admission_number,
      class_name: studentData.current_class?.name || "",
      term: term.name,
      total_present: totalPresent,
      total_days: totalDays,
      attendance_rate: attendanceRate,
      class_teacher_name: classTeacherName,
      headmaster_name: headmaster?.full_name || "Headmaster",
    };

    const buffer = await renderToBuffer(
      React.createElement(
        Document,
        null,
        React.createElement(AttendanceCertificatePDF, { data }),
      ),
    );

    return new Response(new Uint8Array(buffer), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="attendance-certificate-${studentData.admission_number}.pdf"`,
      },
    });
  },
});
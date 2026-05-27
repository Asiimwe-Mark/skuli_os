import { NextRequest } from "next/server";
import {
  getSupabaseAndUser,
  requireSchool,
  requireRole,
  errorResponse,
} from "@/lib/api-helpers";
import { AttendanceCertificatePDF } from "@/lib/pdf/attendance-certificate";
import type { AttendanceCertificateData } from "@/lib/pdf/attendance-certificate";
import { renderToBuffer } from "@react-pdf/renderer";
import React from "react";

export async function GET(request: NextRequest) {
  try {
    const ctx = await getSupabaseAndUser();
    const schoolId = requireSchool(ctx);
    requireRole(ctx, ["SCHOOL_ADMIN", "BURSAR", "TEACHER", "SUPER_ADMIN"]);

    const { searchParams } = new URL(request.url);
    const studentId = searchParams.get("student_id");
    const termId = searchParams.get("term_id");

    if (!studentId) {
      return errorResponse("student_id is required", 400);
    }

    // Get student
    const { data: student } = await ctx.supabase
      .from("students")
      .select("id, full_name, admission_number, current_class:classes(name)")
      .eq("id", studentId)
      .eq("school_id", schoolId)
      .single();

    if (!student) {
      return errorResponse("Student not found", 404);
    }

    // Get school
    const { data: school } = await ctx.supabase
      .from("schools")
      .select("name")
      .eq("id", schoolId)
      .single();

    // Get term info
    let term;
    if (termId) {
      const { data } = await ctx.supabase
        .from("terms")
        .select("id, name, start_date, end_date")
        .eq("id", termId)
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
      return errorResponse("Term not found", 404);
    }

    // Get attendance records
    const { data: records } = await ctx.supabase
      .from("attendance_records")
      .select("status, date")
      .eq("student_id", studentId)
      .gte("date", term.start_date)
      .lte("date", term.end_date);

    const totalDays = records?.length || 0;
    const totalPresent = (records || []).filter(
      (r) => r.status === "present" || r.status === "late"
    ).length;
    const attendanceRate = totalDays > 0 ? Math.round((totalPresent / totalDays) * 100) : 0;

    // Get class teacher and headmaster names
    const studentData = student as unknown as {
      full_name: string;
      admission_number: string;
      current_class: { name: string } | null;
    };

    // Try to get class teacher
    const { data: classInfo } = await ctx.supabase
      .from("classes")
      .select("class_teacher_id")
      .eq("name", studentData.current_class?.name || "")
      .eq("school_id", schoolId)
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

    // Get headmaster
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
      React.createElement(AttendanceCertificatePDF, { data })
    );

    return new Response(buffer, {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="attendance-certificate-${studentData.admission_number}.pdf"`,
      },
    });
  } catch (err) {
    if (err instanceof Error && "status" in err) {
      const apiErr = err as { status: number; message: string };
      return errorResponse(apiErr.message, apiErr.status);
    }
    return errorResponse("Internal server error", 500);
  }
}

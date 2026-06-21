import { AttendanceRegisterPDF } from "@/lib/pdf/attendance-register";
import type { AttendanceRegisterData } from "@/lib/pdf/attendance-register";
import { Document, renderToBuffer } from "@react-pdf/renderer";
import React from "react";
import { route, errorResponse } from "@/lib/http";

export const GET = route({
  roles: ["SCHOOL_ADMIN", "BURSAR", "TEACHER", "SUPER_ADMIN"],
  handler: async (ctx, request) => {
    const schoolId = ctx.profile.school_id!;

    const { searchParams } = new URL(request.url);
    const classId = searchParams.get("class_id");
    const month = parseInt(searchParams.get("month") || "", 10);
    const year = parseInt(searchParams.get("year") || "", 10);

    if (!classId || !month || !year) {
      return errorResponse("class_id, month, and year are required", 400);
    }

    // Get class info
    const { data: cls } = await ctx.supabase
      .from("classes")
      .select("id, name, class_teacher_id, class_teacher:users!class_teacher_id(full_name)")
      .eq("id", classId)
      .eq("school_id", schoolId)
      .single();

    if (!cls) {
      return errorResponse("Class not found", 404);
    }

    // Get school name
    const { data: school } = await ctx.supabase
      .from("schools")
      .select("name")
      .eq("id", schoolId)
      .single();

    // Get enrolled students for this class
    const { data: enrollments } = await ctx.supabase
      .from("class_enrollments")
      .select("student_id, students(id, full_name, admission_number)")
      .eq("class_id", classId);

    if (!enrollments || enrollments.length === 0) {
      return errorResponse("No students enrolled in this class", 404);
    }

    // Get attendance records for the month
    const dateFrom = `${year}-${String(month).padStart(2, "0")}-01`;
    const daysInMonth = new Date(year, month, 0).getDate();
    const dateTo = `${year}-${String(month).padStart(2, "0")}-${String(daysInMonth).padStart(2, "0")}`;

    const { data: records } = await ctx.supabase
      .from("attendance_records")
      .select("student_id, date, status")
      .eq("school_id", schoolId)
      .eq("class_id", classId)
      .gte("date", dateFrom)
      .lte("date", dateTo);

    // Build attendance map: student_id -> day -> status
    const attendanceMap = new Map<string, Record<number, "P" | "A" | "L" | "E" | "-">>();
    for (const rec of records || []) {
      const day = new Date(rec.date).getDate();
      if (!attendanceMap.has(rec.student_id)) {
        attendanceMap.set(rec.student_id, {});
      }
      const statusMap: Record<string, "P" | "A" | "L" | "E"> = {
        present: "P",
        absent: "A",
        late: "L",
        excused: "E",
      };
      attendanceMap.get(rec.student_id)![day] = statusMap[rec.status] || "-";
    }

    // Build students array
    type StudentJoin = { id: string; full_name: string; admission_number: string };
    const students = enrollments.map((e: { student_id: string; students: unknown }) => {
      const s = e.students as unknown as StudentJoin;
      return {
        admission_number: s?.admission_number || "",
        full_name: s?.full_name || "Unknown",
        attendance: attendanceMap.get(e.student_id) || {},
      };
    });

    // Sort by admission number
    students.sort((a: { admission_number: string }, b: { admission_number: string }) => a.admission_number.localeCompare(b.admission_number));

    const teacherName = (cls.class_teacher as unknown as { full_name?: string })?.full_name || "";

    const data: AttendanceRegisterData = {
      school_name: school?.name || "School",
      class_name: cls.name,
      teacher_name: teacherName,
      month,
      year,
      students,
    };

    const buffer = await renderToBuffer(
      React.createElement(Document, null, React.createElement(AttendanceRegisterPDF, { data }))
    );

    const monthNames = [
      "January", "February", "March", "April", "May", "June",
      "July", "August", "September", "October", "November", "December",
    ];

    // Migration guide §7.3: PDF routes return a binary blob. The
    // route() wrapper passes a Response through unchanged.
    return new Response(new Uint8Array(buffer), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="attendance-register-${cls.name}-${monthNames[month - 1]}-${year}.pdf"`,
      },
    });
  },
});

import { NextRequest } from "next/server";
import {
  getSupabaseAndUser,
  requireRole,
  successResponse,
  errorResponse,
  dbError,
  getErrorStatus,
} from "@/lib/api-helpers";

export async function GET(request: NextRequest) {
  try {
    const ctx = await getSupabaseAndUser();
    requireRole(ctx, ["PARENT"]);

    const { searchParams } = new URL(request.url);
    const studentId = searchParams.get("student_id");
    const termId = searchParams.get("term_id");

    if (!studentId) return errorResponse("student_id is required", 400);

    // SECURITY (audit H-2): parent_students is the SOLE authority on
    // which students belong to which parent. The previous version fell
    // back to a parent_phone / parent_email match — but phone and
    // email are mutable, not unique, and can be reassigned. We now
    // require a parent_students link row and reject otherwise. This
    // means a parent who has a child on the books but no link row
    // must add the link in the portal admin — that's the correct
    // model: explicit link, not implicit phone/email match.
    const { data: link } = await ctx.supabase
      .from("parent_students")
      .select("id")
      .eq("parent_id", ctx.user.id)
      .eq("student_id", studentId)
      .maybeSingle();

    if (!link) {
      return errorResponse("Not linked to this student", 403);
    }

    const { data: student } = await ctx.supabase
      .from("students")
      .select("id, school_id")
      .eq("id", studentId)
      .maybeSingle();

    if (!student) return errorResponse("Student not found", 404);

    // Build attendance query
    let query = ctx.supabase
      .from("attendance_records")
      .select("*")
      .eq("student_id", studentId)
      .order("date", { ascending: false });

    if (termId) {
      // Get term date range
      const { data: term } = await ctx.supabase
        .from("terms")
        .select("start_date, end_date")
        .eq("id", termId)
        .single();

      if (term) {
        query = query.gte("date", term.start_date).lte("date", term.end_date);
      }
    }

    const { data: records, error } = await query;

    if (error) return dbError(error, "Database error");

    // Calculate summary
    const summary = { present: 0, absent: 0, late: 0, excused: 0, rate: 0 };
    for (const r of records ?? []) {
      if (r.status in summary) {
        summary[r.status as keyof typeof summary]++;
      }
    }

    // Calculate expected school days (weekdays minus holidays) for rate denominator
    let schoolDays = summary.present + summary.absent + summary.late + summary.excused;
    if (termId) {
      const { data: term } = await ctx.supabase
        .from("terms")
        .select("start_date, end_date")
        .eq("id", termId)
        .single();

      if (term && term.start_date && term.end_date) {
        // Count weekdays in term
        let weekdayCount = 0;
        const current = new Date(term.start_date);
        const end = new Date(term.end_date);
        while (current <= end) {
          const day = current.getDay();
          if (day !== 0 && day !== 6) weekdayCount++;
          current.setDate(current.getDate() + 1);
        }

        // Subtract holidays that fall on weekdays
        const { data: holidays } = await ctx.supabase
          .from("calendar_events")
          .select("event_date, end_date")
          .eq("school_id", student.school_id)
          .eq("event_type", "holiday")
          .eq("affects_attendance", true)
          .lte("event_date", term.end_date)
          .gte("end_date", term.start_date);

        if (holidays) {
          for (const h of holidays) {
            const hStart = new Date(h.event_date);
            const hEnd = h.end_date ? new Date(h.end_date) : hStart;
            const clampStart = hStart < new Date(term.start_date) ? new Date(term.start_date) : hStart;
            const clampEnd = hEnd > end ? end : hEnd;
            const hCurrent = new Date(clampStart);
            while (hCurrent <= clampEnd) {
              const day = hCurrent.getDay();
              if (day !== 0 && day !== 6) weekdayCount--;
              hCurrent.setDate(hCurrent.getDate() + 1);
            }
          }
        }

        schoolDays = weekdayCount;
      }
    }

    summary.rate = schoolDays > 0 ? Math.round((summary.present / schoolDays) * 10000) / 100 : 0;

    return successResponse({ records: records ?? [], summary });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Internal server error";
    const status = getErrorStatus(err);
    return errorResponse(message, status);
  }
}

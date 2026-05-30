import { NextRequest } from "next/server";
import {
  getSupabaseAndUser,
  requireRole,
  successResponse,
  errorResponse,
} from "@/lib/api-helpers";

export async function GET(request: NextRequest) {
  try {
    const ctx = await getSupabaseAndUser();
    requireRole(ctx, ["PARENT"]);

    const { searchParams } = new URL(request.url);
    const studentId = searchParams.get("student_id");
    const termId = searchParams.get("term_id");

    if (!studentId) return errorResponse("student_id is required", 400);

    // Verify student belongs to this parent
    const { data: student } = await ctx.supabase
      .from("students")
      .select("id, school_id, parent_phone, parent_email")
      .eq("id", studentId)
      .single();

    if (!student) return errorResponse("Student not found", 404);

    const { data: user } = await ctx.supabase
      .from("users")
      .select("phone, email")
      .eq("id", ctx.user.id)
      .single();

    const isParent =
      (user?.phone && student.parent_phone === user.phone) ||
      (user?.email && student.parent_email === user.email);

    // Also check parent_students table
    if (!isParent) {
      const { data: link } = await ctx.supabase
        .from("parent_students")
        .select("id")
        .eq("parent_user_id", ctx.user.id)
        .eq("student_id", studentId)
        .maybeSingle();

      if (!link) return errorResponse("Student not linked to this parent", 403);
    }

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

    if (error) return errorResponse(error.message);

    // Calculate summary
    const summary = { present: 0, absent: 0, late: 0, excused: 0, rate: 0 };
    for (const r of records ?? []) {
      if (r.status in summary) {
        summary[r.status as keyof typeof summary]++;
      }
    }
    const total = summary.present + summary.absent + summary.late + summary.excused;
    summary.rate = total > 0 ? Math.round((summary.present / total) * 10000) / 100 : 0;

    return successResponse({ records: records ?? [], summary });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Internal server error";
    const status = err instanceof Error && "status" in err ? (err as any).status : 500;
    return errorResponse(message, status);
  }
}

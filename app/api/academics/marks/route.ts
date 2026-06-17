import { NextRequest } from "next/server";
import type { Database } from "@/types/database";
import { submitMarksSchema } from "@/lib/validations/marks";
import {
  getSupabaseAndUser,
  requireSchool,
  requireRole,
  successResponse,
  errorResponse,
  dbError,
  getErrorStatus } from "@/lib/api-helpers";

type MarkRow = Database["public"]["Tables"]["marks"]["Row"];
type TermRow = Database["public"]["Tables"]["terms"]["Row"];
type ClassRow = Database["public"]["Tables"]["classes"]["Row"];

export async function GET(request: NextRequest) {
  try {
    const ctx = await getSupabaseAndUser();
    const schoolId = requireSchool(ctx);
    requireRole(ctx, ["SCHOOL_ADMIN", "TEACHER", "SUPER_ADMIN"]);

    const { searchParams } = new URL(request.url);
    const classId = searchParams.get("class_id");
    const subjectId = searchParams.get("subject_id");
    const termId = searchParams.get("term_id");
    const examType = searchParams.get("exam_type");
    const page = parseInt(searchParams.get("page") || "1", 10);
    const limit = Math.min(parseInt(searchParams.get("limit") || "100", 10), 500);
    const from = (page - 1) * limit;
    const to = from + limit - 1;

    let query = ctx.supabase
      .from("marks")
      .select(`
        *,
        student:students(full_name, admission_number),
        subject:subjects(name, code)
      `, { count: "exact" })
      .eq("school_id", schoolId);

    if (classId) query = query.eq("class_id", classId);
    if (subjectId) query = query.eq("subject_id", subjectId);
    if (termId) query = query.eq("term_id", termId);
    if (examType) query = query.eq("exam_type", examType as Database["public"]["Enums"]["exam_type"]);

    const { data, error, count } = await query
      .order("created_at", { ascending: false })
      .range(from, to);

    if (error) return dbError(error, "Failed to load marks");

    return successResponse({
      marks: data ?? [],
      total: count ?? 0,
      page,
      limit,
      totalPages: Math.ceil((count ?? 0) / limit) });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Internal server error";
    const status = getErrorStatus(err);
    return errorResponse(message, status);
  }
}

export async function POST(request: NextRequest) {
  try {
    const ctx = await getSupabaseAndUser();
    const schoolId = requireSchool(ctx);
    requireRole(ctx, ["SCHOOL_ADMIN", "TEACHER", "SUPER_ADMIN"]);

    const body = await request.json();
    const parsed = submitMarksSchema.safeParse(body);
    if (!parsed.success) {
      return errorResponse(parsed.error.issues[0].message, 400);
    }

    // Resolve academic_year_id from term if not provided
    let academicYearId = body.academic_year_id;
    if (!academicYearId) {
      const { data: term } = await ctx.supabase
        .from("terms")
        .select("academic_year_id")
        .eq("id", parsed.data.term_id)
        .eq("school_id", schoolId)
        .single() as unknown as { data: Pick<TermRow, "academic_year_id"> | null };
      academicYearId = term?.academic_year_id;
    }

    if (!academicYearId) {
      return errorResponse("Could not determine academic year", 400);
    }

    // Verify class belongs to school
    const { data: cls } = await ctx.supabase
      .from("classes")
      .select("id")
      .eq("id", parsed.data.class_id)
      .eq("school_id", schoolId)
      .single();

    if (!cls) {
      return errorResponse("Invalid class for this school", 400);
    }

    const records = parsed.data.marks.map((m) => ({
      school_id: schoolId,
      student_id: m.student_id,
      subject_id: parsed.data.subject_id,
      class_id: parsed.data.class_id,
      term_id: parsed.data.term_id,
      academic_year_id: academicYearId,
      exam_type: parsed.data.exam_type,
      score: m.score,
      max_score: m.max_score || 100,
      entered_by: ctx.user.id,
      remarks: m.remarks || null,
      // Audit 10.x: the marks review page groups by review_status and
      // surfaces "Approve" / "Reject" actions only on submitted rows.
      // When the teacher clicks "Submit for Review" we set the status
      // here so the reviewer sees the new "Awaiting Review" group
      // immediately on the next list refresh. Draft saves leave the
      // status as "draft" (or whatever the row was before).
      review_status: parsed.data.submit_final ? "submitted" : "draft",
    }));

    const { data, error } = await ctx.supabase
      .from("marks")
      .upsert(records as Database["public"]["Tables"]["marks"]["Insert"][], { onConflict: "student_id,subject_id,term_id,exam_type" })
      .select();

    if (error) return dbError(error, "Failed to load marks");

    // Audit log
    await ctx.supabase.from("audit_logs").insert({
      school_id: schoolId,
      user_id: ctx.user.id,
      action: "marks_entered",
      entity_type: "mark",
      entity_id: null,
      old_value: null,
      new_value: {
        subject_id: parsed.data.subject_id,
        class_id: parsed.data.class_id,
        count: records.length,
        exam_type: parsed.data.exam_type },
      ip_address: null });

    return successResponse(data, 201);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Internal server error";
    const status = getErrorStatus(err);
    return errorResponse(message, status);
  }
}

import type { Database } from "@/types/database";
import { submitMarksSchema } from "@/lib/validations/marks";
import { route, errorResponse, dbError, respond } from "@/lib/http";

type TermRow = Database["public"]["Tables"]["terms"]["Row"];

export const GET = route({
  roles: ["SCHOOL_ADMIN", "TEACHER", "SUPER_ADMIN"],
  handler: async (ctx, request) => {
    const schoolId = ctx.profile.school_id!;

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

    return {
      marks: data ?? [],
      total: count ?? 0,
      page,
      limit,
      totalPages: Math.ceil((count ?? 0) / limit),
    };
  },
});

export const POST = route({
  roles: ["SCHOOL_ADMIN", "TEACHER", "SUPER_ADMIN"],
  schema: submitMarksSchema,
  handler: async (ctx, body) => {
    const schoolId = ctx.profile.school_id!;

    // Resolve academic_year_id from term if not provided.
    // `submitMarksSchema` does not include academic_year_id directly —
    // the route accepts it as an extra passthrough field so callers
    // can save a DB round-trip when they already know the year.
    type SubmitMarksWithYear = Omit<typeof body, never> & { academic_year_id?: string };
    const extendedBody = body as SubmitMarksWithYear;
    let academicYearId: string | undefined = extendedBody.academic_year_id;
    if (!academicYearId) {
      const { data: term } = await ctx.supabase
        .from("terms")
        .select("academic_year_id")
        .eq("id", body.term_id)
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
      .eq("id", body.class_id)
      .eq("school_id", schoolId)
      .single();

    if (!cls) {
      return errorResponse("Invalid class for this school", 400);
    }

    const records = body.marks.map((m) => ({
      school_id: schoolId,
      student_id: m.student_id,
      subject_id: body.subject_id,
      class_id: body.class_id,
      term_id: body.term_id,
      academic_year_id: academicYearId,
      exam_type: body.exam_type,
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
      review_status: body.submit_final ? "submitted" : "draft",
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
        subject_id: body.subject_id,
        class_id: body.class_id,
        count: records.length,
        exam_type: body.exam_type,
      },
      ip_address: null,
    });

    return respond.status(201, data);
  },
});

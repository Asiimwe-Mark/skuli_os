import type { Database } from "@/types/database";
import { submitMarksSchema } from "@/lib/validations/marks";
import { route, errorResponse, dbError, respond } from "@/lib/http";
import { writeAuditLog } from "@/lib/audit-log";
import { invalidateSchoolAsync } from "@/lib/api-cache";
import { paginated, scopedQuery } from "@/lib/http/scoped";

export const GET = route({
  roles: ["SCHOOL_ADMIN", "TEACHER", "SUPER_ADMIN"],
  handler: async (ctx, request) => {
    const url = new URL(request.url);
    const classId = url.searchParams.get("class_id");
    const subjectId = url.searchParams.get("subject_id");
    const termId = url.searchParams.get("term_id");
    const examType = url.searchParams.get("exam_type");
    const { page, limit, from, to } = paginated.parse(request);

    let query = scopedQuery(ctx, "marks")
      .select(`
        *,
        student:students(full_name, admission_number),
        subject:subjects(name, code)
      `, { count: "exact" });

    if (classId) query = query.eq("class_id", classId);
    if (subjectId) query = query.eq("subject_id", subjectId);
    if (termId) query = query.eq("term_id", termId);
    if (examType) query = query.eq("exam_type", examType as Database["public"]["Enums"]["exam_type"]);

    const { data, count, error } = await query
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
    type SubmitMarksWithYear = Omit<typeof body, never> & { academic_year_id?: string };
    const extendedBody = body as SubmitMarksWithYear;
    let academicYearId: string | undefined = extendedBody.academic_year_id;
    if (!academicYearId) {
      const { data: term } = await scopedQuery(ctx, "terms")
        .select("academic_year_id")
        .eq("id", body.term_id)
        .maybeSingle();
      academicYearId = term?.academic_year_id;
    }

    if (!academicYearId) {
      return errorResponse("Could not determine academic year", 400);
    }

    const { data: cls } = await scopedQuery(ctx, "classes")
      .select("id")
      .eq("id", body.class_id)
      .maybeSingle();

    if (!cls) {
      return errorResponse("Invalid class for this school", 400);
    }

    const records = body.marks.map((m) => ({
      school_id: ctx.schoolId,
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
      review_status: body.submit_final ? "submitted" : "draft",
    }));

    const { data, error } = await ctx.supabase
      .from("marks")
      .upsert(records as never, { onConflict: "student_id,subject_id,term_id,exam_type" })
      .select();

    if (error) return dbError(error, "Failed to load marks");

    await writeAuditLog(ctx.supabase, {
      school_id: ctx.schoolId,
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
    });

    void invalidateSchoolAsync(ctx.schoolId);

    return respond.status(201, data);
  },
});
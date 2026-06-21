import { z } from "zod";
import { route, AuthError } from "@/lib/http";

const createDisciplineSchema = z.object({
  student_id: z.string().uuid(),
  incident_date: z.string().min(1),
  incident_type: z.enum([
    "verbal_warning",
    "written_warning",
    "detention",
    "suspension",
    "parent_called",
    "referred_to_head",
    "other",
  ]),
  description: z.string().min(10),
  action_taken: z.string().optional(),
  parent_notified: z.boolean().default(false),
});

export const POST = route({
  roles: ["SCHOOL_ADMIN", "TEACHER"],
  schema: createDisciplineSchema,
  handler: async (ctx, body) => {
    const schoolId = ctx.profile.school_id!;

    const { data: student, error: studentError } = await ctx.supabase
      .from("students")
      .select("id")
      .eq("id", body.student_id)
      .eq("school_id", schoolId)
      .single();

    if (studentError || !student) {
      throw new AuthError("Student not found in this school", 404);
    }

    const { data: record, error: createError } = await ctx.supabase
      .from("discipline_records")
      .insert({
        student_id: body.student_id,
        school_id: schoolId,
        incident_date: body.incident_date,
        incident_type: body.incident_type,
        description: body.description,
        action_taken: body.action_taken || null,
        parent_notified: body.parent_notified,
        parent_notified_at: body.parent_notified
          ? new Date().toISOString()
          : null,
        recorded_by: ctx.user.id,
      })
      .select()
      .single();

    if (createError) {
      console.error("Failed to create discipline record:", createError);
      throw new AuthError("Failed to create discipline record", 500);
    }

    await ctx.supabase.from("audit_logs").insert({
      action: "discipline_record_created",
      entity_type: "discipline_record",
      entity_id: record.id,
      user_id: ctx.user.id,
      school_id: schoolId,
      old_value: null,
      ip_address: null,
      new_value: {
        student_id: body.student_id,
        incident_type: body.incident_type,
        incident_date: body.incident_date,
        description: body.description,
      },
    });

    return record;
  },
});

export const GET = route({
  roles: ["SCHOOL_ADMIN", "TEACHER", "BURSAR"],
  handler: async (ctx, request) => {
    const schoolId = ctx.profile.school_id!;
    const { searchParams } = new URL(request.url);
    const student_id = searchParams.get("student_id");

    if (!student_id) {
      throw new AuthError("student_id is required", 400);
    }

    const { data: student, error: studentError } = await ctx.supabase
      .from("students")
      .select("id")
      .eq("id", student_id)
      .eq("school_id", schoolId)
      .eq("is_deleted", false)
      .single();

    if (studentError || !student) {
      throw new AuthError("Student not found in this school", 404);
    }

    const { data: records, error: fetchError } = await ctx.supabase
      .from("discipline_records")
      .select(
        `
        id,
        incident_date,
        incident_type,
        description,
        action_taken,
        parent_notified,
        parent_notified_at,
        recorded_by:users(
          full_name
        )
      `,
      )
      .eq("student_id", student_id)
      .eq("school_id", schoolId)
      .eq("is_deleted", false)
      .order("incident_date", { ascending: false });

    if (fetchError) {
      console.error("Failed to fetch discipline records:", fetchError);
      throw new AuthError("Failed to fetch discipline records", 500);
    }

    return { records: records || [] };
  },
});
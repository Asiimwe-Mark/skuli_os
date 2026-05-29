import { NextRequest } from "next/server";
import type { Database } from "@/types/database";
import { takeAttendanceSchema } from "@/lib/validations/attendance";
import {
  getSupabaseAndUser,
  requireSchool,
  requireRole,
  successResponse,
  errorResponse,
} from "@/lib/api-helpers";
import { sendPushToUser } from "@/lib/push";

type AttendanceRecordRow = Database["public"]["Tables"]["attendance_records"]["Row"];

export async function GET(request: NextRequest) {
  try {
    const ctx = await getSupabaseAndUser();
    const schoolId = requireSchool(ctx);

    const { searchParams } = new URL(request.url);
    const classId = searchParams.get("class_id");
    const date = searchParams.get("date");
    const dateFrom = searchParams.get("date_from");
    const dateTo = searchParams.get("date_to");
    const page = parseInt(searchParams.get("page") || "1", 10);
    const limit = Math.min(parseInt(searchParams.get("limit") || "100", 10), 500);
    const from = (page - 1) * limit;
    const to = from + limit - 1;

    let query = ctx.supabase
      .from("attendance_records")
      .select(`
        *,
        student:students(full_name, admission_number)
      `, { count: "exact" })
      .eq("school_id", schoolId);

    if (classId) query = query.eq("class_id", classId);
    if (date) query = query.eq("date", date);
    if (dateFrom) query = query.gte("date", dateFrom);
    if (dateTo) query = query.lte("date", dateTo);

    const { data, error, count } = await query
      .order("date", { ascending: false })
      .range(from, to);

    if (error) return errorResponse(error.message);

    return successResponse({
      records: data ?? [],
      total: count ?? 0,
      page,
      limit,
      totalPages: Math.ceil((count ?? 0) / limit),
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Internal server error";
    const status = err instanceof Error && "status" in err ? (err as any).status : 500;
    return errorResponse(message, status);
  }
}

export async function POST(request: NextRequest) {
  try {
    const ctx = await getSupabaseAndUser();
    const schoolId = requireSchool(ctx);
    requireRole(ctx, ["SCHOOL_ADMIN", "TEACHER", "SUPER_ADMIN"]);

    const body = await request.json();
    const parsed = takeAttendanceSchema.safeParse(body);
    if (!parsed.success) {
      return errorResponse(parsed.error.issues[0].message, 400);
    }

    // Verify class belongs to this school
    const { data: cls } = await ctx.supabase
      .from("classes")
      .select("id")
      .eq("id", parsed.data.class_id)
      .eq("school_id", schoolId)
      .single();

    if (!cls) {
      return errorResponse("Invalid class for this school", 400);
    }

    // Upsert attendance records (one per student per date)
    const records = parsed.data.records.map((r) => ({
      school_id: schoolId,
      student_id: r.student_id,
      class_id: parsed.data.class_id,
      date: parsed.data.date,
      status: r.status,
      marked_by: ctx.user.id,
      notes: r.notes || null,
    }));

    const { data, error } = await ctx.supabase
      .from("attendance_records")
      .upsert(records as any, { onConflict: "student_id,date" })
      .select();

    if (error) return errorResponse(error.message);

    // Identify absent students
    const absentStudents = parsed.data.records.filter((r) => r.status === "absent");

    // Audit log
    await ctx.supabase.from("audit_logs").insert({
      school_id: schoolId,
      user_id: ctx.user.id,
      action: "attendance_taken",
      entity_type: "attendance_record",
      new_value: {
        class_id: parsed.data.class_id,
        date: parsed.data.date,
        total: records.length,
        absent: absentStudents.length,
      },
    });

    // Push notifications to parents of absent students
    for (const record of absentStudents) {
      try {
        const { data: student } = await ctx.supabase
          .from("students")
          .select("full_name, parent_phone")
          .eq("id", record.student_id)
          .single();

        if (student?.parent_phone) {
          const { data: parentUser } = await ctx.supabase
            .from("users")
            .select("id")
            .eq("phone", student.parent_phone)
            .eq("role", "PARENT")
            .single();

          if (parentUser) {
            await sendPushToUser(ctx.supabase, parentUser.id, {
              title: "Absence Alert",
              body: `${student.full_name} marked absent on ${parsed.data.date}`,
              url: "/portal",
            });
          }
        }
      } catch {
        // Push failure should not block attendance recording
      }
    }

    return successResponse({
      records: data ?? [],
      absent_count: absentStudents.length,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Internal server error";
    const status = err instanceof Error && "status" in err ? (err as any).status : 500;
    return errorResponse(message, status);
  }
}

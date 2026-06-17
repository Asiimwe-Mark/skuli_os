import { NextRequest } from "next/server";
import type { Database } from "@/types/database";
import { takeAttendanceSchema } from "@/lib/validations/attendance";
import {
  getSupabaseAndUser,
  requireSchool,
  requireRole,
  successResponse,
  errorResponse,
  dbError,
  getErrorStatus } from "@/lib/api-helpers";
import { sendPushToUser } from "@/lib/push";
import { withSchoolCache, setCacheHeader, invalidateSchool } from "@/lib/api-cache";

type AttendanceRecordRow = Database["public"]["Tables"]["attendance_records"]["Row"];

export async function GET(request: NextRequest) {
  try {
    const ctx = await getSupabaseAndUser();
    const schoolId = requireSchool(ctx);
    requireRole(ctx, ["SCHOOL_ADMIN", "TEACHER", "SUPER_ADMIN"]);

    const { searchParams } = new URL(request.url);
    const classId = searchParams.get("class_id");
    const date = searchParams.get("date");
    const dateFrom = searchParams.get("date_from");
    const dateTo = searchParams.get("date_to");
    const page = parseInt(searchParams.get("page") || "1", 10);
    const limit = Math.min(parseInt(searchParams.get("limit") || "100", 10), 500);
    const from = (page - 1) * limit;
    const to = from + limit - 1;

    // The DB read is wrapped in a per-process LRU keyed by school +
    // input shape. The POST handler below calls invalidateSchool on
    // every attendance write, so the next GET is always a fresh DB hit
    // until the LRU's stale-while-revalidate window kicks in.
    const inputShape = `attendance-list:${classId ?? "_"}:${date ?? "_"}:${dateFrom ?? "_"}:${dateTo ?? "_"}:${page}:${limit}`;
    const { value, hit } = await withSchoolCache(
      { schoolId, inputShape },
      async () => {
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

        if (error) throw new Error(`postgrest:${error.code ?? "unknown"}:${error.message}`);
        return {
          records: data ?? [],
          total: count ?? 0,
          page,
          limit,
          totalPages: Math.ceil((count ?? 0) / limit),
        };
      },
    );

    const response = successResponse(value);
    return setCacheHeader(response, hit);
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
      notes: r.notes || null }));

    const { data, error } = await ctx.supabase
      .from("attendance_records")
      .upsert(records as unknown as Database["public"]["Tables"]["attendance_records"]["Insert"], { onConflict: "student_id,date" })
      .select();

    if (error) return dbError(error, "Database error");

    // Identify absent students
    const absentStudents = parsed.data.records.filter((r) => r.status === "absent");

    // Audit log
    await ctx.supabase.from("audit_logs").insert({
      school_id: schoolId,
      user_id: ctx.user.id,
      action: "attendance_taken",
      entity_type: "attendance_record",
      entity_id: null,
      old_value: null,
      new_value: {
        class_id: parsed.data.class_id,
        date: parsed.data.date,
        total: records.length,
        absent: absentStudents.length },
      ip_address: null });

    // Push notifications to parents of absent students.
    // Audit 4.11: previously this loop did 2 round-trips per
    // absent student (fetch student → fetch parent user). For a
    // class with 20 absentees that's 40 round-trips on top of the
    // attendance upsert. Now we batch into 2 .in() queries
    // (students + users) and then issue the push notifications in
    // parallel. Push failures are caught per-notification so a
    // single bad token can't block the rest.
    if (absentStudents.length > 0) {
      const absentIds = absentStudents.map((r) => r.student_id);
      const { data: students } = await ctx.supabase
        .from("students")
        .select("id, full_name, parent_phone")
        .in("id", absentIds);

      const phones = (students ?? [])
        .map((s: { parent_phone?: string | null }) => s.parent_phone)
        .filter((p): p is string => !!p);

      let parentUserIds: { id: string; phone: string | null }[] = [];
      if (phones.length > 0) {
        const { data: parentUsers } = await ctx.supabase
          .from("users")
          .select("id, phone")
          // SECURITY (pre-launch B3): scope by school_id so that if RLS
          // is ever misconfigured, we never match a parent in another
          // school who happens to share a phone number.
          .eq("school_id", schoolId)
          .eq("role", "PARENT")
          .in("phone", phones);
        parentUserIds = (parentUsers ?? []) as { id: string; phone: string | null }[];
      }

      const phoneToParent = new Map(
        parentUserIds
          .filter((p): p is { id: string; phone: string } => p.phone !== null)
          .map((p) => [p.phone, p.id]),
      );
      const studentById = new Map(
        (students ?? []).map((s: { id: string; full_name: string; parent_phone?: string | null }) => [
          s.id,
          s,
        ]),
      );

      const pushPromises = absentStudents
        .map((record): Promise<void> | null => {
          const student = studentById.get(record.student_id);
          if (!student?.parent_phone) return null;
          const parentUserId = phoneToParent.get(student.parent_phone);
          if (!parentUserId) return null;
          return sendPushToUser(ctx.supabase, parentUserId, {
            title: "Absence Alert",
            body: `${student.full_name} marked absent on ${parsed.data.date}`,
            url: "/portal" }).then(() => undefined).catch(() => {
            // Push failure should not block attendance recording
          });
        })
        .filter((p): p is Promise<void> => p !== null);

      await Promise.all(pushPromises);
    }

    // Bust the school-wide cache so the next attendance list / dashboard
    // read picks up the new rows. invalidateSchool is async (Redis
    // SCAN + DEL) — we await it but never block the response on
    // failure: a cache miss is acceptable, a failed write is not.
    await invalidateSchool(schoolId);

    return successResponse({
      records: data ?? [],
      absent_count: absentStudents.length });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Internal server error";
    const status = getErrorStatus(err);
    return errorResponse(message, status);
  }
}

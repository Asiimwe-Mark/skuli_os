import type { Database } from "@/types/database";
import { takeAttendanceSchema } from "@/lib/validations/attendance";
import { route, AuthError, dbError, respond, invalidateSchool, withSchoolReadCache } from "@/lib/http";
import { sendPushToUser } from "@/lib/push";

export const GET = route({
  roles: ["SCHOOL_ADMIN", "TEACHER", "SUPER_ADMIN"],
  handler: async (ctx, request) => {
    const schoolId = ctx.profile.school_id!;
    const { searchParams } = new URL(request.url);
    const classId = searchParams.get("class_id");
    const date = searchParams.get("date");
    const dateFrom = searchParams.get("date_from");
    const dateTo = searchParams.get("date_to");
    const page = parseInt(searchParams.get("page") || "1", 10);
    const limit = Math.min(parseInt(searchParams.get("limit") || "100", 10), 500);

    const inputShape = `attendance-list:${classId ?? "_"}:${date ?? "_"}:${dateFrom ?? "_"}:${dateTo ?? "_"}:${page}:${limit}`;
    const { value, applyTo } = await withSchoolReadCache(
      { schoolId, inputShape },
      async () => {
        const from = (page - 1) * limit;
        const to = from + limit - 1;

        let query = ctx.supabase
          .from("attendance_records")
          .select(
            `
            *,
            student:students(full_name, admission_number)
          `,
            { count: "exact" },
          )
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

    return applyTo(respond.cacheable(value));
  },
});

export const POST = route({
  roles: ["SCHOOL_ADMIN", "TEACHER", "SUPER_ADMIN"],
  schema: takeAttendanceSchema,
  handler: async (ctx, body) => {
    const schoolId = ctx.profile.school_id!;

    const { data: cls } = await ctx.supabase
      .from("classes")
      .select("id")
      .eq("id", body.class_id)
      .eq("school_id", schoolId)
      .single();

    if (!cls) {
      throw new AuthError("Invalid class for this school", 400);
    }

    const records = body.records.map((r) => ({
      school_id: schoolId,
      student_id: r.student_id,
      class_id: body.class_id,
      date: body.date,
      status: r.status,
      marked_by: ctx.user.id,
      notes: r.notes || null,
    }));

    const { data, error } = await ctx.supabase
      .from("attendance_records")
      .upsert(
        records as unknown as Database["public"]["Tables"]["attendance_records"]["Insert"],
        { onConflict: "student_id,date" },
      )
      .select();

    if (error) return dbError(error, "Database error");

    const absentStudents = body.records.filter((r) => r.status === "absent");

    await ctx.supabase.from("audit_logs").insert({
      school_id: schoolId,
      user_id: ctx.user.id,
      action: "attendance_taken",
      entity_type: "attendance_record",
      entity_id: null,
      old_value: null,
      new_value: {
        class_id: body.class_id,
        date: body.date,
        total: records.length,
        absent: absentStudents.length,
      },
      ip_address: null,
    });

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
          .eq("school_id", schoolId)
          .eq("role", "PARENT")
          .in("phone", phones);
        parentUserIds = (parentUsers ?? []) as {
          id: string;
          phone: string | null;
        }[];
      }

      const phoneToParent = new Map(
        parentUserIds
          .filter((p): p is { id: string; phone: string } => p.phone !== null)
          .map((p) => [p.phone, p.id]),
      );
      const studentById = new Map(
        (students ?? []).map(
          (s: { id: string; full_name: string; parent_phone?: string | null }) => [
            s.id,
            s,
          ],
        ),
      );

      const pushPromises = absentStudents
        .map((record): Promise<void> | null => {
          const student = studentById.get(record.student_id);
          if (!student?.parent_phone) return null;
          const parentUserId = phoneToParent.get(student.parent_phone);
          if (!parentUserId) return null;
          return sendPushToUser(ctx.supabase, parentUserId, {
            title: "Absence Alert",
            body: `${student.full_name} marked absent on ${body.date}`,
            url: "/portal",
          })
            .then(() => undefined)
            .catch(() => {
              // Push failure should not block attendance recording
            });
        })
        .filter((p): p is Promise<void> => p !== null);

      await Promise.all(pushPromises);
    }

    await invalidateSchool(schoolId);

    return {
      records: data ?? [],
      absent_count: absentStudents.length,
    };
  },
});
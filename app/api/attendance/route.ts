import { takeAttendanceSchema } from "@/lib/validations/attendance";
import { route, respond } from "@/lib/http";
import { submitAttendance } from "@/lib/services/attendance";
import { withSchoolReadCache } from "@/lib/http/with-cache";
import { scopedQuery, paginated } from "@/lib/http/scoped";

export const GET = route({
  roles: ["SCHOOL_ADMIN", "TEACHER", "SUPER_ADMIN"],
  handler: async (ctx, request) => {
    const url = new URL(request.url);
    const classId = url.searchParams.get("class_id");
    const date = url.searchParams.get("date");
    const dateFrom = url.searchParams.get("date_from");
    const dateTo = url.searchParams.get("date_to");
    const { page, limit, from, to } = paginated.parse(request);
    const inputShape = `attendance-list:${classId ?? "_"}:${date ?? "_"}:${dateFrom ?? "_"}:${dateTo ?? "_"}:${page}:${limit}`;

    const { value, applyTo } = await withSchoolReadCache(
      { schoolId: ctx.schoolId, inputShape },
      async () => {
        let query = scopedQuery(ctx, "attendance_records")
          .select(
            `
            *,
            student:students(full_name, admission_number)
          `,
            { count: "exact" },
          );
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
  handler: async (ctx, body) => submitAttendance(ctx, body),
});
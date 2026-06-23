import { createStudentSchema } from "@/lib/validations/student";
import { route, respond, errorResponse } from "@/lib/http";
import {
  createStudent,
  listStudents,
  teacherAllowedClassIds,
} from "@/lib/services/students";
import { withSchoolReadCache } from "@/lib/http/with-cache";

export const GET = route({
  roles: ["SCHOOL_ADMIN", "BURSAR", "TEACHER", "SUPER_ADMIN"],
  handler: async (ctx, request) => {
    const url = new URL(request.url);
    const classId = url.searchParams.get("class_id");
    const status = url.searchParams.get("status");
    const search = url.searchParams.get("search");

    let teacherAllowed: ReadonlySet<string> | null = null;
    if (ctx.profile.role === "TEACHER") {
      teacherAllowed = await teacherAllowedClassIds(ctx);
      if (teacherAllowed.size === 0) {
        return { items: [], total: 0, page: 1, limit: 50, totalPages: 1 };
      }
      if (classId && !teacherAllowed.has(classId)) {
        return errorResponse("You do not have access to this class", 403);
      }
    }

    const inputShape = `students-list:${classId ?? "_"}:${status ?? "_"}:${search ?? "_"}`;
    const { value, applyTo } = await withSchoolReadCache(
      { schoolId: ctx.schoolId, inputShape },
      async () =>
        listStudents(ctx, request, {
          classId,
          status,
          search,
          teacherAllowedClassIds: teacherAllowed,
        }),
    );
    return applyTo(value as never);
  },
});

export const POST = route({
  roles: ["SCHOOL_ADMIN", "BURSAR", "SUPER_ADMIN"],
  schema: createStudentSchema,
  handler: async (ctx, body) => {
    const created = await createStudent(ctx, body);
    return respond.status(201, created);
  },
});
/**
 * GET /api/classes
 *
 * Returns the list of classes for the authenticated user's school.
 *
 * Used by:
 *   - Enroll page (class selector)
 *   - Promote page (class selectors)
 *   - Staff payment-profile (assignable classes)
 *   - Attendance take (class list)
 *   - Marks entry (class filter)
 *   - Reports (class filter)
 */
import { route, respond, withSchoolReadCache } from "@/lib/http";

export const GET = route({
  // All signed-in roles can read classes; parents need them on the portal.
  roles: [],
  handler: async (ctx, request) => {
    const schoolId = ctx.profile.school_id!;
    const { searchParams } = new URL(request.url);
    const stream = searchParams.get("stream");
    const level = searchParams.get("level");
    const includeDeleted = searchParams.get("include_deleted") === "true";

    const inputShape = `classes:${stream ?? "_"}:${level ?? "_"}:${includeDeleted}`;

    const { value, applyTo } = await withSchoolReadCache(
      { schoolId, inputShape, revalidateSeconds: 120 },
      async () => {
        let query = ctx.supabase
          .from("classes")
          .select("id, name, school_id, level, stream, capacity, class_teacher_id")
          .eq("school_id", schoolId)
          .order("name");

        if (!includeDeleted) {
          query = query.eq("is_deleted", false);
        }
        if (stream) {
          query = query.eq("stream", stream);
        }
        if (level) {
          query = query.eq("level", level);
        }

        const { data, error } = await query;
        if (error) throw error;
        return data ?? [];
      }
    );

    return applyTo(respond.cacheable(value));
  },
});

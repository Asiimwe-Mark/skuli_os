/**
 * GET /api/academic-years
 *
 * Returns the list of academic years for the authenticated user's school.
 *
 * Used by:
 *   - Promote page (year selector)
 *   - Settings → Academic years
 */
import { route, respond, withSchoolReadCache } from "@/lib/http";

export const GET = route({
  // All signed-in roles can read academic years; teachers and parents
  // need them on the portal and marks pages.
  roles: [],
  handler: async (ctx, request) => {
    const schoolId = ctx.profile.school_id!;
    const { searchParams } = new URL(request.url);
    const currentOnly = searchParams.get("current_only") === "true";

    const inputShape = `academic-years:${currentOnly}`;

    const { value, applyTo } = await withSchoolReadCache(
      { schoolId, inputShape, revalidateSeconds: 300 },
      async () => {
        let query = ctx.supabase
          .from("academic_years")
          .select("id, name, is_current")
          .eq("school_id", schoolId)
          .eq("is_deleted", false)
          .order("name", { ascending: false });

        if (currentOnly) {
          query = query.eq("is_current", true);
        }

        const { data, error } = await query;
        if (error) throw error;
        return data ?? [];
      }
    );

    return applyTo(respond.cacheable(value));
  },
});

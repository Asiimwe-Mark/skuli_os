/**
 * GET /api/terms
 *
 * Returns the list of terms for the authenticated user's school.
 * Includes current term marker and academic year info.
 *
 * Used by:
 *   - Dashboard layout (store/school.ts loadContext)
 *   - Enroll page (term selector)
 *   - Fee accounts page (term filter)
 *   - Marks page (term selector)
 *   - Report cards page (term selector)
 *   - Portal pages (current term for student's school)
 *
 * Query params:
 *   academic_year_id  (optional) — filter by academic year
 *   current_only      (optional) — return only is_current=true terms
 */
import { NextRequest } from "next/server";
import {
  getSupabaseAndUser,
  requireSchool,
  successResponse,
  errorResponse,
  dbError,
  getErrorStatus,
} from "@/lib/api-helpers";
import { withSchoolCache, setCacheHeader } from "@/lib/api-cache";

export async function GET(request: NextRequest) {
  try {
    const ctx = await getSupabaseAndUser();
    const schoolId = requireSchool(ctx);
    // All roles can read terms — needed by teachers, parents, admins

    const { searchParams } = new URL(request.url);
    const academicYearId = searchParams.get("academic_year_id");
    const currentOnly = searchParams.get("current_only") === "true";

    const inputShape = `terms:${academicYearId ?? "_"}:${currentOnly}`;

    const { value, hit } = await withSchoolCache(
      { schoolId, inputShape, revalidateSeconds: 120 },
      async () => {
        let query = ctx.supabase
          .from("terms")
          .select(
            `
            id,
            name,
            start_date,
            end_date,
            is_current,
            academic_year_id,
            academic_year:academic_years(id, name, is_current)
          `
          )
          .eq("school_id", schoolId)
          .eq("is_deleted", false)
          .order("created_at", { ascending: false });

        if (academicYearId) {
          query = query.eq("academic_year_id", academicYearId);
        }
        if (currentOnly) {
          query = query.eq("is_current", true);
        }

        const { data, error } = await query;
        if (error) throw error;
        return data ?? [];
      }
    );

    const response = successResponse(value);
    return setCacheHeader(response, hit);
  } catch (err: unknown) {
    const status = getErrorStatus(err);
    const message =
      err instanceof Error ? err.message : "Failed to load terms";
    return errorResponse(message, status);
  }
}

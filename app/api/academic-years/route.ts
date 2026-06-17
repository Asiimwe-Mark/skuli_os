/**
 * GET /api/academic-years
 *
 * Returns the list of academic years for the authenticated user's school.
 *
 * Used by:
 *   - Promote page (year selector)
 *   - Settings → Academic years
 */
import { NextRequest } from "next/server";
import {
  getSupabaseAndUser,
  requireSchool,
  successResponse,
  errorResponse,
  getErrorStatus,
} from "@/lib/api-helpers";
import { withSchoolCache, setCacheHeader } from "@/lib/api-cache";

export async function GET(request: NextRequest) {
  try {
    const ctx = await getSupabaseAndUser();
    const schoolId = requireSchool(ctx);

    const { searchParams } = new URL(request.url);
    const currentOnly = searchParams.get("current_only") === "true";

    const inputShape = `academic-years:${currentOnly}`;

    const { value, hit } = await withSchoolCache(
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

    const response = successResponse(value);
    return setCacheHeader(response, hit);
  } catch (err: unknown) {
    const status = getErrorStatus(err);
    const message =
      err instanceof Error ? err.message : "Failed to load academic years";
    return errorResponse(message, status);
  }
}

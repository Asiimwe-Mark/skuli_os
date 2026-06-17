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
    const stream = searchParams.get("stream");
    const level = searchParams.get("level");
    const includeDeleted = searchParams.get("include_deleted") === "true";

    const inputShape = `classes:${stream ?? "_"}:${level ?? "_"}:${includeDeleted}`;

    const { value, hit } = await withSchoolCache(
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

    const response = successResponse(value);
    return setCacheHeader(response, hit);
  } catch (err: unknown) {
    const status = getErrorStatus(err);
    const message =
      err instanceof Error ? err.message : "Failed to load classes";
    return errorResponse(message, status);
  }
}

import { NextRequest } from "next/server";
import {
  getSupabaseAndUser,
  requireSchool,
  requireRole,
  successResponse,
  errorResponse,
  getErrorStatus,
} from "@/lib/api-helpers";
import { aggregateEmisData } from "@/lib/emis/aggregate";

export async function GET(request: NextRequest) {
  try {
    const ctx = await getSupabaseAndUser();
    const schoolId = requireSchool(ctx);
    requireRole(ctx, ["SCHOOL_ADMIN", "SUPER_ADMIN"]);

    const termId = request.nextUrl.searchParams.get("term_id") ?? undefined;
    const data = await aggregateEmisData(ctx.supabase, schoolId, termId);
    return successResponse(data);
  } catch (e) {
    return errorResponse(e instanceof Error ? e.message : "Error", getErrorStatus(e));
  }
}

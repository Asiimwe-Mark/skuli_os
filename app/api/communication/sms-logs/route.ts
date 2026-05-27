import { NextRequest } from "next/server";
import {
  getSupabaseAndUser,
  requireSchool,
  successResponse,
  errorResponse,
} from "@/lib/api-helpers";

export async function GET(request: NextRequest) {
  try {
    const ctx = await getSupabaseAndUser();
    const schoolId = requireSchool(ctx);

    const { searchParams } = new URL(request.url);
    const status = searchParams.get("status");
    const messageType = searchParams.get("message_type");
    const recipientPhone = searchParams.get("recipient_phone");
    const dateFrom = searchParams.get("date_from");
    const dateTo = searchParams.get("date_to");
    const page = parseInt(searchParams.get("page") || "1", 10);
    const limit = Math.min(parseInt(searchParams.get("limit") || "50", 10), 200);
    const from = (page - 1) * limit;
    const to = from + limit - 1;

    let query = ctx.supabase
      .from("sms_logs")
      .select("*", { count: "exact" })
      .eq("school_id", schoolId);

    if (status) query = query.eq("status", status);
    if (messageType) query = query.eq("message_type", messageType);
    if (recipientPhone) query = query.eq("recipient_phone", recipientPhone);
    if (dateFrom) query = query.gte("created_at", dateFrom);
    if (dateTo) query = query.lte("created_at", dateTo);

    const { data, error, count } = await query
      .order("created_at", { ascending: false })
      .range(from, to);

    if (error) return errorResponse(error.message);

    return successResponse({
      logs: data ?? [],
      total: count ?? 0,
      page,
      limit,
      totalPages: Math.ceil((count ?? 0) / limit),
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Internal server error";
    const status = err instanceof Error && "status" in err ? (err as any).status : 500;
    return errorResponse(message, status);
  }
}

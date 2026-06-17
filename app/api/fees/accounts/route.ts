import { NextRequest } from "next/server";
import type { Database } from "@/types/database";
import {
  getSupabaseAndUser,
  requireSchool,
  requireRole,
  successResponse,
  errorResponse,
  dbError,
  getErrorStatus,
} from "@/lib/api-helpers";
import { withSchoolCache, setCacheHeader, invalidateSchool } from "@/lib/api-cache";

type FeeAccountRow = Database["public"]["Tables"]["fee_accounts"]["Row"];
type StudentRow = Database["public"]["Tables"]["students"]["Row"];

export async function GET(request: NextRequest) {
  try {
    const ctx = await getSupabaseAndUser();
    const schoolId = requireSchool(ctx);
    requireRole(ctx, ["SCHOOL_ADMIN", "BURSAR", "SUPER_ADMIN"]);

    const { searchParams } = new URL(request.url);
    const termId = searchParams.get("term_id");
    const classId = searchParams.get("class_id");
    const status = searchParams.get("status");
    const page = parseInt(searchParams.get("page") || "1", 10);
    const limit = Math.min(parseInt(searchParams.get("limit") || "50", 10), 200);
    const from = (page - 1) * limit;
    const to = from + limit - 1;

    // The DB read is wrapped in a per-school, per-input-key cache. Auth
    // and role checks happen above the cache (they depend on the request
    // cookie) so a 403 from a non-admin can never be served from cache.
    // The inputShape is the only differentiator between cache slots;
    // the school tag is implicit in the LRU key, so a single
    // invalidateSchool(schoolId) on a mutation purges every variant.
    const inputShape = `fees-accounts:${termId ?? "_"}:${classId ?? "_"}:${status ?? "_"}:${page}:${limit}`;
    const { value, hit } = await withSchoolCache(
      { schoolId, inputShape },
      async () => {
        // Audit 9.1: previously the classId branch did an extra round-trip
        // to fetch all students in the class, then `.in("student_id", ids)`.
        // For 1000 students in 20 classes that's still just 2 round-trips
        // per request, but PostgREST can resolve the class filter in a
        // single join: filter the embedded `student!inner(...)` resource on
        // current_class_id and Supabase builds the SQL JOIN for us. One
        // round-trip total. The `!inner` hint tells PostgREST to use an
        // INNER JOIN (instead of LEFT) so rows with no matching student
        // are excluded automatically.
        let query = ctx.supabase
          .from("fee_accounts")
          .select(`
            *,
            student:students!inner(id, full_name, admission_number, parent_phone, current_class_id),
            term:terms(id, name)
          `, { count: "exact" })
          .eq("school_id", schoolId);

        if (termId) query = query.eq("term_id", termId);
        if (status) query = query.eq("status", status as Database["public"]["Enums"]["fee_account_status"]);
        if (classId) {
          query = query.eq("student.current_class_id", classId);
        }

        const { data, error, count } = await query
          .order("balance", { ascending: false })
          .range(from, to);

        if (error) throw new Error(`postgrest:${error.code ?? "unknown"}:${error.message}`);
        return {
          accounts: data ?? [],
          total: count ?? 0,
          page,
          limit,
          totalPages: Math.ceil((count ?? 0) / limit),
        };
      },
    );

    const response = successResponse(value);
    return setCacheHeader(response, hit);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Internal server error";
    const status = getErrorStatus(err);
    return errorResponse(message, status);
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const ctx = await getSupabaseAndUser();
    const schoolId = requireSchool(ctx);
    requireRole(ctx, ["SCHOOL_ADMIN", "BURSAR", "SUPER_ADMIN"]);

    const body = await request.json();
    const { id, ...updates } = body;

    if (!id) {
      return errorResponse("Fee account ID is required", 400);
    }

    // Verify account belongs to school
    const { data: existing } = await ctx.supabase
      .from("fee_accounts")
      .select("id, total_expected, total_paid, balance")
      .eq("id", id)
      .eq("school_id", schoolId)
      .single() as { data: { id: string; total_expected: number; total_paid: number; balance: number } | null };

    if (!existing) {
      return errorResponse("Fee account not found", 404);
    }

    const allowedFields: Record<string, unknown> = {};
    if (updates.total_expected !== undefined) allowedFields.total_expected = updates.total_expected;
    if (updates.total_paid !== undefined) allowedFields.total_paid = updates.total_paid;
    if (updates.balance !== undefined) allowedFields.balance = updates.balance;
    if (updates.status !== undefined) allowedFields.status = updates.status;

    // Recalculate balance if expected or paid changed
    if (allowedFields.total_expected !== undefined || allowedFields.total_paid !== undefined) {
      const expected = (allowedFields.total_expected as number) ?? existing!.total_expected;
      const paid = (allowedFields.total_paid as number) ?? existing!.total_paid;
      const balance = expected - paid;
      allowedFields.balance = balance;
      if (balance < 0) allowedFields.status = "overpaid";
      else if (balance === 0) allowedFields.status = "paid";
      else if (paid > 0) allowedFields.status = "partial";
      else allowedFields.status = "unpaid";
    }

    const { data, error } = await ctx.supabase
      .from("fee_accounts")
      .update(allowedFields as unknown as Database["public"]["Tables"]["fee_accounts"]["Update"])
      .eq("id", id)
      .eq("school_id", schoolId)
      .select()
      .single();

    if (error) return dbError(error, "Database error");

    // Audit log
    await ctx.supabase.from("audit_logs").insert({
      school_id: schoolId,
      user_id: ctx.user.id,
      action: "fee_account_updated",
      entity_type: "fee_account",
      entity_id: id,
      old_value: existing,
      new_value: allowedFields,
    } as unknown as Database["public"]["Tables"]["audit_logs"]["Insert"]);

    // Bust the school-wide cache so the next dashboard / defaulters
    // read shows the new balance. One async call drops every
    // (term, class, status, page) variant for this school in Redis.
    await invalidateSchool(schoolId);

    return successResponse(data);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Internal server error";
    const status = getErrorStatus(err);
    return errorResponse(message, status);
  }
}

import { NextRequest } from "next/server";
import type { Database } from "@/types/database";
import {
  getSupabaseAndUser,
  requireSchool,
  requireRole,
  successResponse,
  errorResponse,
} from "@/lib/api-helpers";

type FeeAccountRow = Database["public"]["Tables"]["fee_accounts"]["Row"];
type StudentRow = Database["public"]["Tables"]["students"]["Row"];

export async function GET(request: NextRequest) {
  try {
    const ctx = await getSupabaseAndUser();
    const schoolId = requireSchool(ctx);

    const { searchParams } = new URL(request.url);
    const termId = searchParams.get("term_id");
    const classId = searchParams.get("class_id");
    const status = searchParams.get("status");
    const page = parseInt(searchParams.get("page") || "1", 10);
    const limit = Math.min(parseInt(searchParams.get("limit") || "50", 10), 200);
    const from = (page - 1) * limit;
    const to = from + limit - 1;

    let query = ctx.supabase
      .from("fee_accounts")
      .select(`
        *,
        student:students(id, full_name, admission_number, parent_phone, current_class_id),
        term:terms(id, name)
      `, { count: "exact" })
      .eq("school_id", schoolId);

    if (termId) query = query.eq("term_id", termId);
    if (status) query = query.eq("status", status);
    if (classId) {
      // Filter by students in the specified class
      const { data: classStudents } = await ctx.supabase
        .from("students")
        .select("id")
        .eq("current_class_id", classId)
        .eq("school_id", schoolId)
        .eq("is_deleted", false);

      if (classStudents && classStudents.length > 0) {
        query = query.in("student_id", classStudents.map((s: any) => s.id));
      } else {
        return successResponse({ accounts: [], total: 0, page, limit, totalPages: 0 });
      }
    }

    const { data, error, count } = await query
      .order("balance", { ascending: false })
      .range(from, to);

    if (error) return errorResponse(error.message);

    return successResponse({
      accounts: data ?? [],
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
      .update(allowedFields)
      .eq("id", id)
      .eq("school_id", schoolId)
      .select()
      .single() as { data: any; error: any };

    if (error) return errorResponse(error.message);

    // Audit log
    await ctx.supabase.from("audit_logs").insert({
      school_id: schoolId,
      user_id: ctx.user.id,
      action: "fee_account_updated",
      entity_type: "fee_account",
      entity_id: id,
      old_value: existing,
      new_value: allowedFields,
    } as any);

    return successResponse(data);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Internal server error";
    const status = err instanceof Error && "status" in err ? (err as any).status : 500;
    return errorResponse(message, status);
  }
}

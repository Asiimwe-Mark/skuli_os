import { NextRequest } from "next/server";
import { issueBookSchema, returnBookSchema } from "@/lib/validations/library";
import {
  getSupabaseAndUser,
  requireSchool,
  requireRole,
  successResponse,
  errorResponse,
  dbError,
  getErrorStatus } from "@/lib/api-helpers";

const FINE_PER_DAY = 500; // UGX

export async function GET(request: NextRequest) {
  try {
    const ctx = await getSupabaseAndUser();
    const schoolId = requireSchool(ctx);
    requireRole(ctx, ["SCHOOL_ADMIN", "BURSAR", "SUPER_ADMIN"]);

    const { searchParams } = new URL(request.url);
    const status = searchParams.get("status"); // returned, outstanding, overdue

    let query = ctx.supabase
      .from("library_issues")
      .select(`
        *,
        library_books (title, author, isbn),
        students (full_name, admission_number)
      `)
      .eq("school_id", schoolId)
      .order("issued_at", { ascending: false });

    if (status === "returned") {
      query = query.not("returned_at", "is", null);
    } else if (status === "outstanding") {
      query = query.is("returned_at", null);
    } else if (status === "overdue") {
      query = query.is("returned_at", null).lt("due_date", new Date().toISOString().split("T")[0]);
    }

    const { data, error } = await query;

    if (error) return dbError(error, "Database error");

    return successResponse(data || []);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Internal server error";
    const status = getErrorStatus(err);
    return errorResponse(message, status);
  }
}

// Audit 4.12 (7.27): the previous flow was three round-trips
// (availability check + INSERT + decrement RPC) with a TOCTOU race
// window: two concurrent issues could both pass the
// `available_copies >= 1` check before either UPDATE landed. The
// issue_library_book RPC (migration 00062) wraps the availability
// check, decrement, and INSERT in a single transaction guarded by
// SELECT ... FOR UPDATE on the book row. Two concurrent callers now
// serialize on the row lock; the second sees the post-decrement count
// and gets a clean P0001 if copies have run out.
export async function POST(request: NextRequest) {
  try {
    const ctx = await getSupabaseAndUser();
    const schoolId = requireSchool(ctx);
    requireRole(ctx, ["SCHOOL_ADMIN", "BURSAR", "SUPER_ADMIN"]);

    const body = await request.json();
    const parsed = issueBookSchema.safeParse(body);
    if (!parsed.success) {
      return errorResponse(parsed.error.issues[0].message, 400);
    }

    // Single atomic call: SELECT FOR UPDATE book → check copies →
    // UPDATE book → INSERT issue. All in one transaction.
    const { data: issue, error: rpcError } = await ctx.supabase.rpc(
      "issue_library_book",
      {
        p_school_id: schoolId,
        p_book_id: parsed.data.book_id,
        p_student_id: parsed.data.student_id,
        p_due_date: parsed.data.due_date,
        p_issued_by: ctx.user.id,
      },
    );

    if (rpcError) {
      // P0001 = "No copies available", P0002 = "Book/Student not found".
      // Translate to the user-facing messages the old route used so
      // the UI keeps working unchanged.
      const code = (rpcError as { code?: string }).code;
      if (code === "P0001") return errorResponse("No copies available", 400);
      if (code === "P0002") return errorResponse("Book or student not found in this school", 404);
      return dbError(rpcError, "Failed to record issue");
    }

    if (!issue) return errorResponse("Failed to record issue", 500);

    return successResponse(issue);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Internal server error";
    const status = getErrorStatus(err);
    return errorResponse(message, status);
  }
}

// Audit 4.12 (7.27): return is also atomic — locks the issue row,
// increments the book's copies (capped at total_copies), and marks
// the issue returned. Prevents double-returns from double-incrementing
// the available count, and prevents a stale "already returned" record
// from being silently overwritten.
export async function PATCH(request: NextRequest) {
  try {
    const ctx = await getSupabaseAndUser();
    const schoolId = requireSchool(ctx);
    requireRole(ctx, ["SCHOOL_ADMIN", "BURSAR", "SUPER_ADMIN"]);

    const body = await request.json();
    const parsed = returnBookSchema.safeParse(body);
    if (!parsed.success) {
      return errorResponse(parsed.error.issues[0].message, 400);
    }

    // Fine is computed in code so the FINE_PER_DAY constant stays in
    // one place. The RPC re-validates the issue row is still
    // outstanding under FOR UPDATE, so even if two concurrent returns
    // pass this SELECT only one will land.
    let fineAmount = parsed.data.fine_amount ?? 0;
    if (fineAmount === 0) {
      const { data: issueRow } = await ctx.supabase
        .from("library_issues")
        .select("due_date, returned_at")
        .eq("id", parsed.data.issue_id)
        .eq("school_id", schoolId)
        .is("returned_at", null)
        .maybeSingle();

      if (!issueRow) return errorResponse("Issue not found or already returned", 404);

      const today = new Date();
      const dueDate = new Date(issueRow.due_date);
      if (today > dueDate) {
        const daysOverdue = Math.floor((today.getTime() - dueDate.getTime()) / 86400000);
        fineAmount = daysOverdue * FINE_PER_DAY;
      }
    }

    const { data: updated, error: rpcError } = await ctx.supabase.rpc(
      "return_library_book",
      {
        p_school_id: schoolId,
        p_issue_id: parsed.data.issue_id,
        p_fine_amount: fineAmount > 0 ? fineAmount : null,
        p_fine_paid: parsed.data.fine_paid && fineAmount > 0,
      },
    );

    if (rpcError) {
      const code = (rpcError as { code?: string }).code;
      if (code === "P0002") return errorResponse("Issue not found or already returned", 404);
      return dbError(rpcError, "Failed to update record", { route: "/api/library/issues", school_id: schoolId, user_id: ctx.user.id });
    }

    if (!updated) return errorResponse("Failed to update record", 500);

    return successResponse(updated);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Internal server error";
    const status = getErrorStatus(err);
    return errorResponse(message, status);
  }
}

import { issueBookSchema, returnBookSchema } from "@/lib/validations/library";
import { route, AuthError, dbError } from "@/lib/http";

const FINE_PER_DAY = 500;

export const GET = route({
  roles: ["SCHOOL_ADMIN", "BURSAR", "SUPER_ADMIN"],
  handler: async (ctx, request) => {
    const schoolId = ctx.profile.school_id!;
    const { searchParams } = new URL(request.url);
    const status = searchParams.get("status");

    let query = ctx.supabase
      .from("library_issues")
      .select(
        `
        *,
        library_books (title, author, isbn),
        students (full_name, admission_number)
      `,
      )
      .eq("school_id", schoolId)
      .order("issued_at", { ascending: false });

    if (status === "returned") {
      query = query.not("returned_at", "is", null);
    } else if (status === "outstanding") {
      query = query.is("returned_at", null);
    } else if (status === "overdue") {
      query = query
        .is("returned_at", null)
        .lt("due_date", new Date().toISOString().split("T")[0]);
    }

    const { data, error } = await query;

    if (error) return dbError(error, "Database error");

    return data || [];
  },
});

export const POST = route({
  roles: ["SCHOOL_ADMIN", "BURSAR", "SUPER_ADMIN"],
  schema: issueBookSchema,
  handler: async (ctx, body) => {
    const schoolId = ctx.profile.school_id!;

    const { data: issue, error: rpcError } = await ctx.supabase.rpc(
      "issue_library_book",
      {
        p_school_id: schoolId,
        p_book_id: body.book_id,
        p_student_id: body.student_id,
        p_due_date: body.due_date,
        p_issued_by: ctx.user.id,
      },
    );

    if (rpcError) {
      const code = (rpcError as { code?: string }).code;
      if (code === "P0001") throw new AuthError("No copies available", 400);
      if (code === "P0002")
        throw new AuthError("Book or student not found in this school", 404);
      return dbError(rpcError, "Failed to record issue", 500);
    }

    if (!issue) throw new AuthError("Failed to record issue", 500);

    return issue;
  },
});

export const PATCH = route({
  roles: ["SCHOOL_ADMIN", "BURSAR", "SUPER_ADMIN"],
  schema: returnBookSchema,
  handler: async (ctx, body) => {
    const schoolId = ctx.profile.school_id!;

    let fineAmount = body.fine_amount ?? 0;
    if (fineAmount === 0) {
      const { data: issueRow } = await ctx.supabase
        .from("library_issues")
        .select("due_date, returned_at")
        .eq("id", body.issue_id)
        .eq("school_id", schoolId)
        .is("returned_at", null)
        .maybeSingle();

      if (!issueRow)
        throw new AuthError("Issue not found or already returned", 404);

      const today = new Date();
      const dueDate = new Date(issueRow.due_date);
      if (today > dueDate) {
        const daysOverdue = Math.floor(
          (today.getTime() - dueDate.getTime()) / 86400000,
        );
        fineAmount = daysOverdue * FINE_PER_DAY;
      }
    }

    const { data: updated, error: rpcError } = await ctx.supabase.rpc(
      "return_library_book",
      {
        p_school_id: schoolId,
        p_issue_id: body.issue_id,
        p_fine_amount: fineAmount > 0 ? fineAmount : null,
        p_fine_paid: body.fine_paid && fineAmount > 0,
      },
    );

    if (rpcError) {
      const code = (rpcError as { code?: string }).code;
      if (code === "P0002")
        throw new AuthError("Issue not found or already returned", 404);
      return dbError(rpcError, "Failed to update record", 500);
    }

    if (!updated) throw new AuthError("Failed to update record", 500);

    return updated;
  },
});
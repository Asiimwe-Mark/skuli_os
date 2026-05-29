import { NextRequest } from "next/server";
import { issueBookSchema, returnBookSchema } from "@/lib/validations/library";
import {
  getSupabaseAndUser,
  requireSchool,
  requireRole,
  successResponse,
  errorResponse,
} from "@/lib/api-helpers";

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

    if (error) return errorResponse(error.message, 500);

    return successResponse(data || []);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Internal server error";
    const status = err instanceof Error && "status" in err ? (err as any).status : 500;
    return errorResponse(message, status);
  }
}

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

    // Check book availability
    const { data: book, error: bookError } = await ctx.supabase
      .from("library_books")
      .select("available_copies")
      .eq("id", parsed.data.book_id)
      .eq("school_id", schoolId)
      .eq("is_deleted", false)
      .single();

    if (bookError || !book) return errorResponse("Book not found", 404);
    if (book.available_copies < 1) return errorResponse("No copies available", 400);

    // Create issue record
    const { data: issue, error: issueError } = await ctx.supabase
      .from("library_issues")
      .insert({
        school_id: schoolId,
        book_id: parsed.data.book_id,
        student_id: parsed.data.student_id,
        due_date: parsed.data.due_date,
        issued_by: ctx.user.id,
      })
      .select(`
        *,
        library_books (title, author),
        students (full_name, admission_number)
      `)
      .single();

    if (issueError) return errorResponse(issueError.message, 500);

    // Decrement available copies
    const { error: updateError } = await ctx.supabase
      .from("library_books")
      .update({ available_copies: book.available_copies - 1 })
      .eq("id", parsed.data.book_id);

    if (updateError) return errorResponse(updateError.message, 500);

    return successResponse(issue);
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
    const parsed = returnBookSchema.safeParse(body);
    if (!parsed.success) {
      return errorResponse(parsed.error.issues[0].message, 400);
    }

    // Get the issue record
    const { data: issue, error: issueError } = await ctx.supabase
      .from("library_issues")
      .select("*")
      .eq("id", parsed.data.issue_id)
      .eq("school_id", schoolId)
      .is("returned_at", null)
      .single();

    if (issueError || !issue) return errorResponse("Issue not found or already returned", 404);

    // Calculate fine if overdue
    const today = new Date();
    const dueDate = new Date(issue.due_date);
    let fineAmount = parsed.data.fine_amount ?? 0;

    if (today > dueDate && !fineAmount) {
      const daysOverdue = Math.floor((today.getTime() - dueDate.getTime()) / 86400000);
      fineAmount = daysOverdue * FINE_PER_DAY;
    }

    // Mark as returned
    const { data: updated, error: updateError } = await ctx.supabase
      .from("library_issues")
      .update({
        returned_at: today.toISOString(),
        fine_amount: fineAmount || null,
        fine_paid: parsed.data.fine_paid && fineAmount > 0,
      })
      .eq("id", parsed.data.issue_id)
      .select(`
        *,
        library_books (title, author),
        students (full_name, admission_number)
      `)
      .single();

    if (updateError) return errorResponse(updateError.message, 500);

    // Increment available copies
    const { data: book } = await ctx.supabase
      .from("library_books")
      .select("available_copies")
      .eq("id", issue.book_id)
      .single();

    if (book) {
      await ctx.supabase
        .from("library_books")
        .update({ available_copies: book.available_copies + 1 })
        .eq("id", issue.book_id);
    }

    return successResponse(updated);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Internal server error";
    const status = err instanceof Error && "status" in err ? (err as any).status : 500;
    return errorResponse(message, status);
  }
}

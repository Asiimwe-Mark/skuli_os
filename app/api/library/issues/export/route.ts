import { NextRequest } from "next/server";
import {
  getSupabaseAndUser,
  requireSchool,
  requireRole,
  errorResponse,
} from "@/lib/api-helpers";

export async function GET(request: NextRequest) {
  try {
    const ctx = await getSupabaseAndUser();
    const schoolId = requireSchool(ctx);
    requireRole(ctx, ["SCHOOL_ADMIN", "BURSAR", "SUPER_ADMIN"]);

    const { searchParams } = new URL(request.url);
    const status = searchParams.get("status");

    let query = ctx.supabase
      .from("library_issues")
      .select(`
        issued_at,
        due_date,
        returned_at,
        fine_amount,
        fine_paid,
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

    const rows = [
      ["Book Title", "Author", "ISBN", "Student", "Admission #", "Issued Date", "Due Date", "Returned", "Fine (UGX)", "Fine Paid"],
      ...(data || []).map((i: any) => [
        i.library_books?.title || "",
        i.library_books?.author || "",
        i.library_books?.isbn || "",
        i.students?.full_name || "",
        i.students?.admission_number || "",
        i.issued_at ? new Date(i.issued_at).toLocaleDateString("en-GB") : "",
        i.due_date || "",
        i.returned_at ? new Date(i.returned_at).toLocaleDateString("en-GB") : "No",
        i.fine_amount?.toString() || "0",
        i.fine_paid ? "Yes" : "No",
      ]),
    ];

    const csv = rows
      .map((row) =>
        row.map((cell: any) => `"${String(cell).replace(/"/g, '""')}"`).join(",")
      )
      .join("\n");

    return new Response(csv, {
      headers: {
        "Content-Type": "text/csv",
        "Content-Disposition": `attachment; filename="library-issues-${status || "all"}.csv"`,
      },
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Internal server error";
    const status = err instanceof Error && "status" in err ? (err as any).status : 500;
    return errorResponse(message, status);
  }
}

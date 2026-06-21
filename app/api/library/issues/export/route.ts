import { route, dbError } from "@/lib/http";

export const GET = route({
  roles: ["SCHOOL_ADMIN", "BURSAR", "SUPER_ADMIN"],
  handler: async (ctx, request) => {
    const schoolId = ctx.profile.school_id!;

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

    if (error) return dbError(error, "Database error");

    // Pre-existing inline `: any` casts on data joins; migration
    // guide §7.6 puts these out of scope for the wrapper refactor.
    /* eslint-disable @typescript-eslint/no-explicit-any */
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
    /* eslint-enable @typescript-eslint/no-explicit-any */

    return new Response(csv, {
      headers: {
        "Content-Type": "text/csv",
        "Content-Disposition": `attachment; filename="library-issues-${status || "all"}.csv"`,
      },
    });
  },
});

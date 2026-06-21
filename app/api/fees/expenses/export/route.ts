import { route, dbError } from "@/lib/http";

export const GET = route({
  roles: ["SCHOOL_ADMIN", "BURSAR", "SUPER_ADMIN"],
  handler: async (ctx, request) => {
    const schoolId = ctx.profile.school_id!;

    const { searchParams } = new URL(request.url);
    const termId = searchParams.get("term_id");
    const dateFrom = searchParams.get("date_from");
    const dateTo = searchParams.get("date_to");

    let query = ctx.supabase
      .from("expenses")
      .select(`
        expense_date,
        description,
        amount,
        payment_method,
        receipt_number,
        notes,
        expense_categories (name),
        users!recorded_by (full_name)
      `)
      .eq("school_id", schoolId)
      .eq("is_deleted", false)
      .order("expense_date", { ascending: false });

    if (termId) query = query.eq("term_id", termId);
    if (dateFrom) query = query.gte("expense_date", dateFrom);
    if (dateTo) query = query.lte("expense_date", dateTo);

    const { data, error } = await query;

    if (error) return dbError(error, "Database error");

    // Pre-existing inline `: any` casts on data joins; migration guide
    // §7.6 puts these out of scope for the wrapper refactor.
    /* eslint-disable @typescript-eslint/no-explicit-any */
    const rows = [
      ["Date", "Category", "Description", "Amount", "Method", "Receipt #", "Recorded By", "Notes"],
      ...(data || []).map((e: any) => [
        e.expense_date,
        e.expense_categories?.name || "",
        e.description,
        e.amount.toString(),
        e.payment_method || "",
        e.receipt_number || "",
        e.users?.full_name || "",
        e.notes || "",
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
        "Content-Disposition": `attachment; filename="expenses-${termId || "all"}.csv"`,
      },
    });
  },
});

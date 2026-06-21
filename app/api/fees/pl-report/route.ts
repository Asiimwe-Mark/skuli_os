import { renderToBuffer } from "@react-pdf/renderer";
import { PlReportPDF } from "@/lib/pdf/pl-report";
import { route, errorResponse } from "@/lib/http";

export const GET = route({
  roles: ["SCHOOL_ADMIN", "BURSAR", "SUPER_ADMIN"],
  handler: async (ctx, request) => {
    const schoolId = ctx.profile.school_id!;

    const { searchParams } = new URL(request.url);
    const termId = searchParams.get("term_id");

    if (!termId) return errorResponse("term_id is required", 400);

    // Fetch term details
    const { data: term, error: termError } = await ctx.supabase
      .from("terms")
      .select("name, academic_years (name), school_id")
      .eq("id", termId)
      .single();

    if (termError || !term) return errorResponse("Term not found", 404);

    // Fetch school name
    const { data: school } = await ctx.supabase
      .from("schools")
      .select("name")
      .eq("id", schoolId)
      .single();

    // Fetch fee accounts for this term
    const { data: termAccounts } = await ctx.supabase
      .from("fee_accounts")
      .select("id")
      .eq("term_id", termId)
      .eq("school_id", schoolId)
      .eq("is_deleted", false);

    // The original code typed these as `any` (data joins through
    // !inner foreign-key selects aren't easy to express without
    // bringing in the full Database row types). PR 4 can pick up
    // the type work; for now we keep the same shape and silence
    // ESLint inline. The audit/migration guide §7.6 explicitly
    // puts these inline `: any` casts out of scope for the
    // wrapper refactor.
    /* eslint-disable @typescript-eslint/no-explicit-any */
    const accountIds = (termAccounts || []).map((a: any) => a.id);

    let termPayments: any[] = [];
    if (accountIds.length > 0) {
      const { data } = await ctx.supabase
        .from("fee_payments")
        .select(`
          amount,
          fee_accounts!inner (
            class_enrollments (
              classes (name)
            )
          )
        `)
        .in("fee_account_id", accountIds)
        .eq("is_deleted", false)
        .eq("status", "confirmed");
      termPayments = data || [];
    }

    // Group income by class
    const incomeMap = new Map<string, number>();
    termPayments.forEach((p: any) => {
      const className =
        p.fee_accounts?.class_enrollments?.classes?.name || "General";
      incomeMap.set(className, (incomeMap.get(className) || 0) + Number(p.amount));
    });
    /* eslint-enable @typescript-eslint/no-explicit-any */

    const income_rows = Array.from(incomeMap.entries()).map(
      ([class_name, amount]) => ({
        class_name,
        fee_name: "Fee Collections",
        amount })
    );

    const total_income = income_rows.reduce((sum, r) => sum + r.amount, 0);

    // Fetch expenses grouped by category
    const { data: expenses } = await ctx.supabase
      .from("expenses")
      .select("amount, expense_categories (name)")
      .eq("school_id", schoolId)
      .eq("term_id", termId)
      .eq("is_deleted", false);

    /* eslint-disable @typescript-eslint/no-explicit-any */
    const expenseMap = new Map<string, number>();
    (expenses || []).forEach((e: any) => {
      const catName = e.expense_categories?.name || "Uncategorized";
      expenseMap.set(catName, (expenseMap.get(catName) || 0) + Number(e.amount));
    });
    /* eslint-enable @typescript-eslint/no-explicit-any */

    const expense_rows = Array.from(expenseMap.entries()).map(
      ([category_name, amount]) => ({ category_name, amount })
    );

    const total_expenses = expense_rows.reduce((sum, r) => sum + r.amount, 0);

    // Generate PDF
    const termName = term.name === "Term1" ? "Term 1" : term.name === "Term2" ? "Term 2" : "Term 3";
    const academicYearName =
      ((term as unknown as { academic_years?: { name: string } | null }).academic_years?.name) ?? "";

    const buffer = await renderToBuffer(
      PlReportPDF({
        school_name: school?.name || "School",
        term_name: termName,
        academic_year_name: academicYearName,
        date_generated: new Date().toLocaleDateString("en-UG"),
        income_rows,
        expense_rows,
        total_income,
        total_expenses })
    );

    // Migration guide §7.3: PDF routes return a binary blob. The
    // route() wrapper passes a Response through unchanged (PR 2),
    // so we can build the binary Response here and return it.
    return new Response(new Uint8Array(buffer), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="pl-report-${termName.replace(/\s/g, "-")}.pdf"`,
      },
    });
  },
});

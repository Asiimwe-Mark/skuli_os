import { NextRequest } from "next/server";
import React from "react";
import { renderToBuffer } from "@react-pdf/renderer";
import { PlReportPDF } from "@/lib/pdf/pl-report";
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

    const income_rows = Array.from(incomeMap.entries()).map(
      ([class_name, amount]) => ({
        class_name,
        fee_name: "Fee Collections",
        amount,
      })
    );

    const total_income = income_rows.reduce((sum, r) => sum + r.amount, 0);

    // Fetch expenses grouped by category
    const { data: expenses } = await ctx.supabase
      .from("expenses")
      .select("amount, expense_categories (name)")
      .eq("school_id", schoolId)
      .eq("term_id", termId)
      .eq("is_deleted", false);

    const expenseMap = new Map<string, number>();
    (expenses || []).forEach((e: any) => {
      const catName = e.expense_categories?.name || "Uncategorized";
      expenseMap.set(catName, (expenseMap.get(catName) || 0) + Number(e.amount));
    });

    const expense_rows = Array.from(expenseMap.entries()).map(
      ([category_name, amount]) => ({ category_name, amount })
    );

    const total_expenses = expense_rows.reduce((sum, r) => sum + r.amount, 0);

    // Generate PDF
    const termName = term.name === "Term1" ? "Term 1" : term.name === "Term2" ? "Term 2" : "Term 3";
    const academicYearName = (term as any).academic_years?.name || "";

    const buffer = await renderToBuffer(
      React.createElement(PlReportPDF, {
        school_name: school?.name || "School",
        term_name: termName,
        academic_year_name: academicYearName,
        date_generated: new Date().toLocaleDateString("en-UG"),
        income_rows,
        expense_rows,
        total_income,
        total_expenses,
      }) as any
    );

    return new Response(new Uint8Array(buffer), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="pl-report-${termName.replace(/\s/g, "-")}.pdf"`,
      },
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Internal server error";
    const status = err instanceof Error && "status" in err ? (err as any).status : 500;
    return errorResponse(message, status);
  }
}

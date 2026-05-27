import { NextRequest } from "next/server";
import { z } from "zod";
import {
  getSupabaseAndUser,
  requireSchool,
  requireRole,
  errorResponse,
} from "@/lib/api-helpers";
import { FeeStatementPDF } from "@/lib/pdf/fee-statement";
import { renderToBuffer } from "@react-pdf/renderer";
import React from "react";

const statementSchema = z.object({
  student_id: z.string().uuid(),
  term_id: z.string().uuid().optional(),
});

export async function POST(request: NextRequest) {
  try {
    const ctx = await getSupabaseAndUser();
    const schoolId = requireSchool(ctx);
    requireRole(ctx, ["SCHOOL_ADMIN", "BURSAR", "TEACHER", "SUPER_ADMIN"]);

    const body = await request.json();
    const parsed = statementSchema.safeParse(body);
    if (!parsed.success) {
      return errorResponse(parsed.error.issues[0].message, 400);
    }

    const { student_id, term_id } = parsed.data;

    // Verify student belongs to school
    const { data: student } = await ctx.supabase
      .from("students")
      .select("id, full_name, admission_number, parent_name, current_class:classes(name)")
      .eq("id", student_id)
      .eq("school_id", schoolId)
      .single();

    if (!student) {
      return errorResponse("Student not found", 404);
    }

    // Get school info
    const { data: school } = await ctx.supabase
      .from("schools")
      .select("name, address, logo_url")
      .eq("id", schoolId)
      .single();

    // Get fee accounts for student
    let accountsQuery = ctx.supabase
      .from("fee_accounts")
      .select("id, term_id, total_expected, total_paid, balance, terms(name, academic_years(name))")
      .eq("student_id", student_id)
      .eq("school_id", schoolId)
      .eq("is_deleted", false);

    if (term_id) {
      accountsQuery = accountsQuery.eq("term_id", term_id);
    }

    const { data: accounts } = await accountsQuery;

    if (!accounts || accounts.length === 0) {
      return errorResponse("No fee accounts found for this student", 404);
    }

    // Build terms data for the PDF
    const termsData = [];
    for (const account of accounts) {
      // Get fee structures for this term
      const { data: structures } = await ctx.supabase
        .from("fee_structures")
        .select("name, amount")
        .eq("term_id", account.term_id)
        .eq("school_id", schoolId)
        .eq("is_deleted", false);

      // Get payments for this account
      const { data: payments } = await ctx.supabase
        .from("fee_payments")
        .select("amount, payment_method, payment_date, receipt_number")
        .eq("fee_account_id", account.id)
        .eq("status", "confirmed")
        .order("payment_date", { ascending: true });

      const term = account.terms as unknown as { name: string; academic_years: { name: string } | null } | null;

      termsData.push({
        term_name: term?.name || "Term",
        academic_year: term?.academic_years?.name || "",
        fee_items: (structures || []).map((s) => ({ name: s.name, amount: Number(s.amount) })),
        total_expected: Number(account.total_expected),
        payments: (payments || []).map((p) => ({
          date: p.payment_date,
          amount: Number(p.amount),
          method: p.payment_method,
          receipt: p.receipt_number || "",
        })),
        total_paid: Number(account.total_paid),
        balance: Number(account.balance),
      });
    }

    const studentData = student as unknown as {
      full_name: string;
      admission_number: string;
      parent_name: string | null;
      current_class: { name: string } | null;
    };

    const pdfStream = renderToBuffer(
      React.createElement(FeeStatementPDF, {
        school: {
          name: school?.name || "School",
          address: school?.address || undefined,
          logo_url: school?.logo_url || undefined,
        },
        student: {
          full_name: studentData.full_name,
          admission_number: studentData.admission_number,
          class_name: studentData.current_class?.name || "",
          parent_name: studentData.parent_name || undefined,
        },
        terms: termsData,
        generated_date: new Date().toISOString().split("T")[0],
      })
    );

    const buffer = await pdfStream;

    return new Response(buffer, {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="fee-statement-${studentData.admission_number}.pdf"`,
      },
    });
  } catch (err) {
    if (err instanceof Error && "status" in err) {
      const apiErr = err as { status: number; message: string };
      return errorResponse(apiErr.message, apiErr.status);
    }
    return errorResponse("Internal server error", 500);
  }
}

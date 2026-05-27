import { NextRequest } from "next/server";
import type { Database } from "@/types/database";
import {
  getSupabaseAndUser,
  requireSchool,
  successResponse,
  errorResponse,
} from "@/lib/api-helpers";

type StudentRow = Database["public"]["Tables"]["students"]["Row"];
type TermRow = Database["public"]["Tables"]["terms"]["Row"];
type FeeAccountRow = Database["public"]["Tables"]["fee_accounts"]["Row"];
type FeePaymentRow = Database["public"]["Tables"]["fee_payments"]["Row"];

type FeeAccountWithJoins = FeeAccountRow & {
  student: Pick<StudentRow, "id" | "full_name" | "admission_number" | "parent_phone"> | null;
  term: Pick<TermRow, "id" | "name"> | null;
};

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function GET(request: NextRequest, { params }: RouteContext) {
  try {
    const ctx = await getSupabaseAndUser();
    const schoolId = requireSchool(ctx);
    const { id: studentId } = await params;

    // Get the current term for the school
    const { data: currentTerm } = await ctx.supabase
      .from("terms")
      .select("id, name, academic_year_id")
      .eq("school_id", schoolId)
      .eq("is_current", true)
      .single() as { data: { id: string; name: string; academic_year_id: string } | null };

    if (!currentTerm) {
      return errorResponse("No current term found", 404);
    }

    // Verify student belongs to this school
    const { data: student } = await ctx.supabase
      .from("students")
      .select("id, full_name, admission_number")
      .eq("id", studentId)
      .eq("school_id", schoolId)
      .eq("is_deleted", false)
      .single() as { data: { id: string; full_name: string; admission_number: string } | null };

    if (!student) {
      return errorResponse("Student not found", 404);
    }

    // Get the fee account for the current term
    const { data: feeAccount, error } = await ctx.supabase
      .from("fee_accounts")
      .select(`
        *,
        student:students(id, full_name, admission_number, parent_phone),
        term:terms(id, name)
      `)
      .eq("student_id", studentId)
      .eq("term_id", currentTerm!.id)
      .eq("school_id", schoolId)
      .single() as { data: any; error: any };

    if (error && error.code !== "PGRST116") {
      return errorResponse(error.message);
    }

    if (!feeAccount) {
      return successResponse({
        student,
        term: currentTerm,
        fee_account: null,
        message: "No fee account found for this term. Generate accounts first.",
      });
    }

    // Get payment history for this account
    const { data: payments } = await ctx.supabase
      .from("fee_payments")
      .select("id, amount, payment_method, payment_date, receipt_number, status, notes")
      .eq("fee_account_id", feeAccount.id)
      .eq("is_deleted", false)
      .order("payment_date", { ascending: false }) as { data: any[] | null };

    return successResponse({
      fee_account: feeAccount,
      payments: payments ?? [],
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Internal server error";
    const status = err instanceof Error && "status" in err ? (err as any).status : 500;
    return errorResponse(message, status);
  }
}

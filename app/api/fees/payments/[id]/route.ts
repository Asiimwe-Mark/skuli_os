import { NextRequest } from "next/server";
import {
  getSupabaseAndUser,
  requireSchool,
  successResponse,
  errorResponse,
} from "@/lib/api-helpers";

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function GET(request: NextRequest, { params }: RouteContext) {
  try {
    const ctx = await getSupabaseAndUser();
    const schoolId = requireSchool(ctx);
    const { id } = await params;

    const { data: payment, error } = await ctx.supabase
      .from("fee_payments")
      .select(`
        *,
        student:students(id, full_name, admission_number, parent_phone, parent_name),
        fee_account:fee_accounts(id, total_expected, total_paid, balance, status, term_id, term:terms(id, name)),
        received_by:users!received_by_user_id(id, full_name)
      `)
      .eq("id", id)
      .eq("school_id", schoolId)
      .eq("is_deleted", false)
      .single();

    if (error || !payment) {
      return errorResponse("Payment not found", 404);
    }

    return successResponse(payment);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Internal server error";
    const status = err instanceof Error && "status" in err ? (err as any).status : 500;
    return errorResponse(message, status);
  }
}

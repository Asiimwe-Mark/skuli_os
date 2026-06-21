import { route } from "@/lib/http";

/**
 * GET /api/v1/payments/status?ref=[merchantReference]
 * Returns the current status of a tuition_payment by merchant reference.
 * Scoped to the calling user's children only (when the caller is a PARENT).
 */
export const GET = route({
  roles: [],
  handler: async (ctx, request) => {
    const ref = new URL(request.url).searchParams.get("ref");
    if (!ref) throw new Error("Missing ref parameter");

    const { data: payment } = await ctx.supabase
      .from("tuition_payments")
      .select(
        "id, school_id, student_id, amount, status, receipt_number, fee_type_label, created_at",
      )
      .eq("id", ref)
      .maybeSingle();

    if (!payment) throw new Error("Payment not found");
    const p = payment as unknown as {
      id: string;
      school_id: string;
      student_id: string;
      amount: number;
      status: string;
      receipt_number: string | null;
      fee_type_label: string | null;
    };

    if (ctx.profile.role === "PARENT") {
      const { data: link } = await ctx.supabase
        .from("parent_students")
        .select("student_id")
        .eq("parent_id", ctx.user.id)
        .eq("student_id", p.student_id)
        .maybeSingle();
      if (!link) throw new Error("Forbidden");
    } else if (
      ctx.profile.school_id &&
      ctx.profile.school_id !== p.school_id
    ) {
      throw new Error("Forbidden");
    }

    return {
      reference: p.id,
      status: p.status,
      amount: p.amount,
      receipt_number: p.receipt_number,
      fee_type_label: p.fee_type_label,
    };
  },
});
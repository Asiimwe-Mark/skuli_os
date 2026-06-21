import { renderToBuffer } from "@react-pdf/renderer";
import { ReceiptPDF } from "@/lib/pdf/receipt";
import { route, errorResponse } from "@/lib/http";
import { generateQrDataUrl } from "@/lib/utils/qr";

/**
 * GET /api/fees/receipt-pdf/[payment_id]
 * Streams a PDF receipt for a completed payment. Accepts BOTH:
 *   - tuition_payments.id (text composite reference)
 *   - fee_payments.id (uuid)
 * Includes a QR code encoding https://skuli.app/verify-receipt/[receipt_number].
 *
 * Auth goes through Supabase so we still use `route()`. Role gating:
 * PARENT must have a parent_students link to the student; staff must
 * belong to the same school as the payment. SUPER_ADMIN bypasses the
 * school check (the wrapper handles that).
 */
export const GET = route({
  // No `roles` gate — every signed-in user is allowed; the per-role
  // access logic runs inside the handler (parent_students link or
  // same-school check). The wrapper still applies auth and the
  // school_id-required guard for non-SUPER_ADMIN.
  roles: [],
  handler: async (ctx, _request, params) => {
    const { payment_id } = (params ?? {}) as { payment_id: string };
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || "https://skuli.app";

    type ReceiptData = {
      schoolId: string;
      studentId: string;
      amount: number;
      method: string;
      date: string;
      receiptNumber: string;
      transactionId?: string;
    };
    let receipt: ReceiptData | null = null;

    // Try tuition_payments (text id) first
    const { data: tp } = await ctx.supabase
      .from("tuition_payments")
      .select("school_id, student_id, amount, status, receipt_number, pesapal_order_tracking_id, created_at, fee_type_label")
      .eq("id", payment_id)
      .maybeSingle();

    if (tp) {
      const t = tp as unknown as {
        school_id: string;
        student_id: string;
        amount: string | number;
        status: string;
        receipt_number: string | null;
        pesapal_order_tracking_id: string | null;
        created_at: string;
      };
      if (t.status !== "COMPLETED") {
        return errorResponse("Receipt available only for completed payments", 400);
      }
      receipt = {
        schoolId: t.school_id,
        studentId: t.student_id,
        amount: Number(t.amount),
        method: "mobile_money",
        date: new Date(t.created_at).toLocaleDateString("en-UG"),
        receiptNumber: t.receipt_number || payment_id,
        transactionId: t.pesapal_order_tracking_id || undefined,
      };
    } else {
      const { data: fp } = await ctx.supabase
        .from("fee_payments")
        .select("school_id, student_id, amount, payment_method, status, receipt_number, payment_date, mobile_money_transaction_id")
        .eq("id", payment_id)
        .maybeSingle();
      if (!fp) return errorResponse("Payment not found", 404);
      const f = fp as unknown as {
        school_id: string;
        student_id: string;
        amount: string | number;
        payment_method: string;
        receipt_number: string | null;
        payment_date: string;
        mobile_money_transaction_id: string | null;
      };
      receipt = {
        schoolId: f.school_id,
        studentId: f.student_id,
        amount: Number(f.amount),
        method: f.payment_method,
        date: f.payment_date,
        receiptNumber: f.receipt_number || payment_id,
        transactionId: f.mobile_money_transaction_id || undefined,
      };
    }

    // Access control: parents only their children; staff only same school
    if (ctx.profile.role === "PARENT") {
      const { data: link } = await ctx.supabase
        .from("parent_students")
        .select("student_id")
        .eq("parent_id", ctx.user.id)
        .eq("student_id", receipt.studentId)
        .maybeSingle();
      if (!link) return errorResponse("Forbidden", 403);
    } else if (ctx.profile.school_id && ctx.profile.school_id !== receipt.schoolId) {
      return errorResponse("Forbidden", 403);
    }

    const { data: schoolRow } = await ctx.supabase
      .from("schools")
      .select("name, address, motto, logo_url, phone")
      .eq("id", receipt.schoolId)
      .single();
    const school = (schoolRow as unknown as {
      name: string;
      address?: string;
      motto?: string;
      logo_url?: string;
      phone?: string;
    }) || { name: "School" };

    const { data: studentRow } = await ctx.supabase
      .from("students")
      .select("full_name, admission_number, fee_accounts(balance)")
      .eq("id", receipt.studentId)
      .single();
    const student = studentRow as unknown as {
      full_name: string;
      admission_number: string;
      fee_accounts?: { balance: number }[];
    } | null;

    const balance =
      student?.fee_accounts && student.fee_accounts.length > 0
        ? Number(student.fee_accounts[0].balance) || 0
        : 0;

    // §14.4: render the QR locally. We no longer hit
    // api.qrserver.com from the PDF generator (privacy + reliability).
    const verifyUrl = `${appUrl}/verify-receipt/${encodeURIComponent(receipt.receiptNumber)}`;
    const qrDataUrl = (await generateQrDataUrl(verifyUrl, { size: 240 })) ?? undefined;

    const buffer = await renderToBuffer(
      ReceiptPDF({
        school,
        student: {
          full_name: student?.full_name || "Student",
          admission_number: student?.admission_number || "-",
        },
        payment: {
          receipt_number: receipt.receiptNumber,
          amount: receipt.amount,
          payment_method: receipt.method,
          payment_date: receipt.date,
          mobile_money_transaction_id: receipt.transactionId,
        },
        balance,
        received_by: "SKULI Online (Pesapal)",
        qrDataUrl,
      })
    );

    // §6.2/B2: PII GET. No cache: a parent re-downloading the
    // same URL would otherwise pull a stale PDF from a proxy.
    return new Response(new Uint8Array(buffer), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="receipt-${receipt.receiptNumber}.pdf"`,
        "Cache-Control": "no-store",
      },
    });
  },
});

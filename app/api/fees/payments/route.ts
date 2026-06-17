import { NextRequest } from "next/server";
import crypto from "crypto";
import type { Database } from "@/types/database";
import { recordPaymentSchema } from "@/lib/validations/fees";
import {
  getSupabaseAndUser,
  requireSchool,
  requireRole,
  successResponse,
  errorResponse,
  dbError,
  getErrorStatus } from "@/lib/api-helpers";
import { sendPushToUser } from "@/lib/push";
import { writeAuditLog } from "@/lib/audit-log";

type FeePaymentRow = Database["public"]["Tables"]["fee_payments"]["Row"];
type FeeAccountRow = Database["public"]["Tables"]["fee_accounts"]["Row"];
type TermRow = Database["public"]["Tables"]["terms"]["Row"];
type SchoolRow = Database["public"]["Tables"]["schools"]["Row"];

export async function GET(request: NextRequest) {
  try {
    const ctx = await getSupabaseAndUser();
    const schoolId = requireSchool(ctx);
    requireRole(ctx, ["SCHOOL_ADMIN", "BURSAR", "SUPER_ADMIN"]);

    const { searchParams } = new URL(request.url);
    const studentId = searchParams.get("student_id");
    const feeAccountId = searchParams.get("fee_account_id");
    const paymentMethod = searchParams.get("payment_method");
    const dateFrom = searchParams.get("date_from");
    const dateTo = searchParams.get("date_to");
    const page = parseInt(searchParams.get("page") || "1", 10);
    const limit = Math.min(parseInt(searchParams.get("limit") || "50", 10), 200);
    const from = (page - 1) * limit;
    const to = from + limit - 1;

    let query = ctx.supabase
      .from("fee_payments")
      .select(`
        *,
        student:students(full_name, admission_number),
        received_by:users!received_by_user_id(full_name)
      `, { count: "exact" })
      .eq("school_id", schoolId)
      .eq("is_deleted", false);

    if (studentId) query = query.eq("student_id", studentId);
    if (feeAccountId) query = query.eq("fee_account_id", feeAccountId);
    if (paymentMethod) query = query.eq("payment_method", paymentMethod as Database["public"]["Enums"]["payment_method"]);
    if (dateFrom) query = query.gte("payment_date", dateFrom);
    if (dateTo) query = query.lte("payment_date", dateTo);

    const { data, error, count } = await query
      .order("created_at", { ascending: false })
      .range(from, to);

    if (error) return dbError(error, "Failed to load payments");

    return successResponse({
      payments: data ?? [],
      total: count ?? 0,
      page,
      limit,
      totalPages: Math.ceil((count ?? 0) / limit),
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Internal server error";
    const status = getErrorStatus(err);
    return errorResponse(message, status);
  }
}

export async function POST(request: NextRequest) {
  try {
    const ctx = await getSupabaseAndUser();
    const schoolId = requireSchool(ctx);
    requireRole(ctx, ["SCHOOL_ADMIN", "BURSAR", "SUPER_ADMIN"]);

    const body = await request.json();
    const parsed = recordPaymentSchema.safeParse(body);
    if (!parsed.success) {
      return errorResponse(parsed.error.issues[0].message, 400);
    }

    // Find the fee account for this student (current term). Audit 2.6
    // (4.14): use maybeSingle() so a missing account returns null
    // instead of throwing PGRST116. The existing null check on
    // `feeAccount` already handles "no account" correctly.
    let feeAccountQuery = ctx.supabase
      .from("fee_accounts")
      .select("id, student_id, term_id")
      .eq("student_id", parsed.data.student_id)
      .eq("school_id", schoolId);

    // If the client provides a specific fee_account_id, use it
    if (body.fee_account_id) {
      feeAccountQuery = feeAccountQuery.eq("id", body.fee_account_id);
    } else {
      // Get current term
      const { data: currentTerm } = await ctx.supabase
        .from("terms")
        .select("id")
        .eq("school_id", schoolId)
        .eq("is_current", true)
        .maybeSingle() as { data: { id: string } | null };

      if (currentTerm) {
        feeAccountQuery = feeAccountQuery.eq("term_id", currentTerm.id);
      }
    }

    const { data: feeAccount } = await feeAccountQuery.maybeSingle() as { data: { id: string; student_id: string; term_id: string } | null };

    if (!feeAccount) {
      return errorResponse("No fee account found for this student. Generate accounts first.", 400);
    }

    // Generate receipt number. Audit 2.7 (4.15): read school_code up
    // front in the same query that gets school_id, and the format
    // fallback is "SCH" only when school_code is genuinely missing
    // (newly created school before the code was generated).
    const { data: school } = await ctx.supabase
      .from("schools")
      .select("school_code")
      .eq("id", schoolId)
      .maybeSingle() as { data: { school_code: string | null } | null };

    const now = new Date();
    const yearMonth = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}`;
    const uniqueSuffix = crypto.randomUUID().slice(0, 8).toUpperCase();
    const codeSegment = school?.school_code && school.school_code.length > 0
      ? school.school_code
      : "SCH";
    const receiptNumber = `SKULI-${codeSegment}-${yearMonth}-${uniqueSuffix}`;

    // Insert the payment. Audit 2.7 (4.16): term_id is now fetched in
    // the same fee_account query above, so we don't need a second
    // round-trip. The denormalised column is required for the
    // dashboard "Recent Payments" and analytics charts to filter by
    // term without joining fee_accounts (migration 00059).
    const { data: payment, error } = await ctx.supabase
      .from("fee_payments")
      .insert({
        school_id: schoolId,
        fee_account_id: feeAccount.id,
        student_id: parsed.data.student_id,
        amount: parsed.data.amount,
        payment_method: parsed.data.payment_method,
        mobile_money_provider: parsed.data.mobile_money_provider ?? null,
        mobile_money_transaction_id: parsed.data.mobile_money_transaction_id ?? null,
        phone_used: parsed.data.phone_used ?? null,
        received_by_user_id: ctx.user.id,
        payment_date: parsed.data.payment_date,
        notes: parsed.data.notes ?? null,
        receipt_number: receiptNumber,
        status: "confirmed",
        term_id: feeAccount.term_id ?? null,
      })
      .select()
      .single();

    if (error) return dbError(error, "Failed to record payment", 400);

    // Recalculate fee account
    await ctx.supabase.rpc("recalculate_fee_account", { p_account_id: feeAccount!.id });

    // Audit log
    await writeAuditLog(ctx.supabase, {
      school_id: schoolId,
      user_id: ctx.user.id,
      action: "payment_recorded",
      entity_type: "fee_payment",
      entity_id: payment?.id ?? null,
      new_value: {
        amount: parsed.data.amount,
        method: parsed.data.payment_method,
        receipt: receiptNumber,
        student_id: parsed.data.student_id,
      },
    });

    // Push notification to parent
    try {
      const { data: student } = await ctx.supabase
        .from("students")
        .select("full_name, parent_phone")
        .eq("id", parsed.data.student_id)
        .single();

      if (student?.parent_phone) {
        const { data: parentUser } = await ctx.supabase
          .from("users")
          .select("id")
          .eq("phone", student.parent_phone)
          .eq("role", "PARENT")
          .single();

        if (parentUser) {
          await sendPushToUser(ctx.supabase, parentUser.id, {
            title: "Payment Received",
            body: `${parsed.data.amount.toLocaleString()} UGX for ${student.full_name}`,
            url: "/portal/fees",
          });
        }
      }
    } catch {
      // Push notification failure should not block payment recording
    }

    return successResponse(payment, 201);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Internal server error";
    const status = getErrorStatus(err);
    return errorResponse(message, status);
  }
}

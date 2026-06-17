import { NextRequest } from 'next/server';
import { z } from 'zod';
import {
  getSupabaseAndUser,
  requireSchool,
  requireRole,
  successResponse,
  errorResponse,
  AuthError,
} from '@/lib/api-helpers';
import { generateBatchRef } from '@/lib/utils/pesapal-ref';
import { generateDisbursementIdempotencyKey } from '@/lib/utils/idempotency';
import { sanitizePhoneForPayment } from '@/lib/utils/phone';
import { submitOrderRequest } from '@/lib/gateways/pesapal';
import { checkRateLimitAsync } from '@/lib/utils/rate-limit';
import { writeAuditLog } from '@/lib/audit-log';
import type { Database } from '@/types/database';

type PayrollBatchInsert = Database['public']['Tables']['payroll_batches']['Insert'];
type BatchLineItemInsert = Database['public']['Tables']['batch_line_items']['Insert'];

// ── Constants ────────────────────────────────────────────────────────────────

/** Processing overhead fees in UGX per disbursement */
const MOMO_OVERHEAD = 700;
const BANK_OVERHEAD = 3000;
/** Inbound transfer fee when the school funds via bank transfer */
const INBOUND_BANK_FEE = 3500;

/** Hard cap per batch — prevents flooding and runaway charges */
const MAX_BATCH_SIZE = 500;

// ── Validation schema ────────────────────────────────────────────────────────

const schema = z.object({
  payroll_record_ids: z.array(z.string().uuid()).min(1).max(MAX_BATCH_SIZE),
  funding_mechanism: z.enum(['BANK_COLLECT', 'MOMO_PUSH']),
  label: z.string().max(200).optional(),
});

// ── Types for Supabase join results ─────────────────────────────────────────

interface PayrollRecordRow {
  id: string;
  staff_id: string;
  net_salary: number | null;
  basic_salary: number | null;
}

interface StaffPaymentProfileRow {
  preferred_method: 'MOBILE_MONEY' | 'BANK';
  mobile_number: string | null;
  bank_code: string | null;
  account_number: string | null;
}

interface StaffRow {
  full_name: string;
  bank_account: string | null;
}

interface SchoolRow {
  name: string;
  email: string | null;
  pesapal_ipn_id: string | null;
}

// ── Handler ──────────────────────────────────────────────────────────────────

export async function POST(request: NextRequest) {
  try {
    const ctx = await getSupabaseAndUser();
    const schoolId = requireSchool(ctx);
    requireRole(ctx, ['SCHOOL_ADMIN', 'BURSAR', 'SUPER_ADMIN']);

    // Rate limit: 3 funding batches per school per 10 minutes.
    const rl = await checkRateLimitAsync(
      `payroll-approve:${schoolId}`,
      3,
      10 * 60 * 1000,
    );
    if (!rl.success) {
      return errorResponse(
        'Too many funding batches in a short window. Please wait a few minutes.',
        429,
      );
    }

    const body = await request.json();
    const parsed = schema.safeParse(body);
    if (!parsed.success) return errorResponse(parsed.error.issues[0].message, 400);

    const { payroll_record_ids, funding_mechanism, label } = parsed.data;
    const supabase = ctx.supabase;

    // ── Load payroll records ─────────────────────────────────────────────────

    const { data: records, error: recordsErr } = await supabase
      .from('payroll_records')
      .select('id, staff_id, net_salary, basic_salary, allowances, deductions')
      .in('id', payroll_record_ids)
      .eq('school_id', schoolId)
      .eq('payment_status', 'pending');

    if (recordsErr || !records?.length) {
      return errorResponse('No eligible payroll records found', 404);
    }

    // ── Load school ──────────────────────────────────────────────────────────

    const { data: schoolData } = await supabase
      .from('schools')
      .select('id, name, email, pesapal_ipn_id')
      .eq('id', schoolId)
      .single();

    const school = schoolData as SchoolRow | null;

    if (!school?.pesapal_ipn_id) {
      return errorResponse(
        'Pesapal payments not configured. Set up your Pesapal credentials first.',
        400,
      );
    }

    // ── Build line items ────────────────────────────────────────────────────

    const batchId = generateBatchRef(schoolId);
    let totalNetSalaries = 0;
    let totalOverheadFees = 0;
    const lineItemInserts: BatchLineItemInsert[] = [];

    for (const rec of records as PayrollRecordRow[]) {
      const netSalary = Number(rec.net_salary) || Number(rec.basic_salary) || 0;

      const { data: profileData } = await supabase
        .from('staff_payment_profiles')
        .select('preferred_method, mobile_number, bank_code, account_number')
        .eq('staff_id', rec.staff_id)
        .maybeSingle();

      const profile = profileData as StaffPaymentProfileRow | null;

      const { data: staffData } = await supabase
        .from('staff')
        .select('full_name, bank_account, bank_name')
        .eq('id', rec.staff_id)
        .single();

      const staffRow = staffData as StaffRow | null;

      const method: 'MOBILE_MONEY' | 'BANK' = profile?.preferred_method ?? 'MOBILE_MONEY';
      const mobileNumber = profile?.mobile_number ?? null;
      const bankCode = profile?.bank_code ?? null;
      const accountNumber = profile?.account_number ?? staffRow?.bank_account ?? null;

      // Validate mobile number before creating the batch
      if (method === 'MOBILE_MONEY' && mobileNumber) {
        try {
          sanitizePhoneForPayment(mobileNumber);
        } catch {
          return errorResponse(
            `Invalid mobile number for staff member ${staffRow?.full_name ?? rec.staff_id}`,
            400,
          );
        }
      }

      const processingFee = method === 'BANK' ? BANK_OVERHEAD : MOMO_OVERHEAD;
      totalNetSalaries += netSalary;
      totalOverheadFees += processingFee;

      const destination =
        method === 'MOBILE_MONEY' ? (mobileNumber ?? 'unknown') : (accountNumber ?? 'unknown');

      const idempotencyKey = generateDisbursementIdempotencyKey(
        `${batchId}-${rec.staff_id}`,
        destination,
        netSalary,
      );

      lineItemInserts.push({
        batch_id: batchId,
        payroll_record_id: rec.id,
        staff_id: rec.staff_id,
        worker_name: staffRow?.full_name ?? 'Unknown',
        payout_amount: netSalary,
        processing_fee: processingFee,
        idempotency_key: idempotencyKey,
        snapshot_payout_method: method,
        snapshot_mobile_number: mobileNumber,
        snapshot_bank_code: bankCode,
        snapshot_account_number: accountNumber,
        disbursal_status: 'HOLD_UNTIL_FUNDED',
      });
    }

    const inboundFee = funding_mechanism === 'BANK_COLLECT' ? INBOUND_BANK_FEE : 0;
    const totalPayoutSum = totalNetSalaries + totalOverheadFees + inboundFee;

    // ── Create Pesapal order ─────────────────────────────────────────────────

    const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://skuli.app';
    const callbackUrl = `${appUrl}/api/webhooks/pesapal`;

    const pesapalResponse = await submitOrderRequest({
      id: batchId,
      currency: 'UGX',
      amount: totalPayoutSum,
      description: `${label ?? 'Payroll'} - ${school.name} - ${new Date().toLocaleDateString('en-UG')}`,
      callbackUrl,
      notificationId: school.pesapal_ipn_id,
      billingAddress: {
        emailAddress: school.email ?? ctx.user.email,
        firstName: 'School',
        lastName: school.name,
      },
    });

    // ── Persist batch ────────────────────────────────────────────────────────

    const batchInsert: PayrollBatchInsert = {
      id: batchId,
      school_id: schoolId,
      label: label ?? `Payroll - ${new Date().toLocaleDateString('en-UG')}`,
      funding_mechanism,
      total_net_salaries: totalNetSalaries,
      total_overhead_fees: totalOverheadFees + inboundFee,
      total_payout_sum: totalPayoutSum,
      funding_payment_status: 'AWAITING_EXTERNAL_FUNDING',
      pesapal_funding_ref: batchId,
      pesapal_funding_url: pesapalResponse.redirectUrl,
      pesapal_order_tracking_id: pesapalResponse.orderTrackingId,
      approved_by_user_id: ctx.user.id,
    };

    const { error: batchErr } = await supabase.from('payroll_batches').insert(batchInsert);

    if (batchErr) {
      return errorResponse(`Failed to create payroll batch: ${batchErr.message}`, 500);
    }

    // ── Persist line items ───────────────────────────────────────────────────

    const { error: lineErr } = await supabase
      .from('batch_line_items')
      .insert(lineItemInserts);

    if (lineErr) {
      // Roll back the batch header on line item failure
      await supabase.from('payroll_batches').delete().eq('id', batchId);
      return errorResponse(`Failed to create payroll line items: ${lineErr.message}`, 500);
    }

    // ── Audit log ────────────────────────────────────────────────────────────

    await writeAuditLog(supabase, {
      school_id: schoolId,
      user_id: ctx.user.id,
      action: 'payroll_batch_approved',
      entity_type: 'payroll_batch',
      entity_id: batchId,
      new_value: {
        batch_id: batchId,
        total_payout_sum: totalPayoutSum,
        worker_count: records.length,
        funding_mechanism,
        pesapal_tracking_id: pesapalResponse.orderTrackingId,
      },
    });

    return successResponse({
      batch_id: batchId,
      funding_url: pesapalResponse.redirectUrl,
      total_payout_sum: totalPayoutSum,
      total_net_salaries: totalNetSalaries,
      total_overhead_fees: totalOverheadFees,
      inbound_fee: inboundFee,
      worker_count: records.length,
      message:
        'Payroll batch created. Complete the payment at the funding_url to release salaries.',
    });
  } catch (err) {
    if (err instanceof AuthError) return errorResponse(err.message, err.status);
    console.error('POST /api/v1/payroll/approve error:', err);
    return errorResponse('Internal server error', 500);
  }
}
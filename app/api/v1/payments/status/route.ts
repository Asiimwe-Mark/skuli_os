import { NextRequest } from 'next/server';
import {
  getSupabaseAndUser,
  successResponse,
  errorResponse,
  AuthError,
} from '@/lib/api-helpers';

/**
 * GET /api/v1/payments/status?ref=[merchantReference]
 * Returns the current status of a tuition_payment by merchant reference.
 * Scoped to the calling user's children only (when the caller is a PARENT).
 */
export async function GET(request: NextRequest) {
  try {
    const ctx = await getSupabaseAndUser();
    const ref = new URL(request.url).searchParams.get('ref');
    if (!ref) return errorResponse('Missing ref parameter', 400);

    const { data: payment } = await ctx.supabase
      .from('tuition_payments')
      .select('id, school_id, student_id, amount, status, receipt_number, fee_type_label, created_at')
      .eq('id', ref)
      .maybeSingle();

    if (!payment) return errorResponse('Payment not found', 404);
    const p = payment as unknown as {
      id: string;
      school_id: string;
      student_id: string;
      amount: number;
      status: string;
      receipt_number: string | null;
      fee_type_label: string | null;
    };

    // Parents may only view payments for their own children
    if (ctx.profile.role === 'PARENT') {
      const { data: link } = await ctx.supabase
        .from('parent_students')
        .select('student_id')
        .eq('parent_id', ctx.user.id)
        .eq('student_id', p.student_id)
        .maybeSingle();
      if (!link) return errorResponse('Forbidden', 403);
    } else if (ctx.profile.school_id && ctx.profile.school_id !== p.school_id) {
      return errorResponse('Forbidden', 403);
    }

    return successResponse({
      reference: p.id,
      status: p.status,
      amount: p.amount,
      receipt_number: p.receipt_number,
      fee_type_label: p.fee_type_label,
    });
  } catch (err) {
    if (err instanceof AuthError) return errorResponse(err.message, err.status);
    console.error('GET /api/v1/payments/status error:', err);
    return errorResponse('Internal server error', 500);
  }
}

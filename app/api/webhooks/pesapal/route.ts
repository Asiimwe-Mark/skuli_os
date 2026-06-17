import { NextRequest } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getTransactionStatus } from '@/lib/gateways/pesapal';
import { dispatchNotifications } from '@/lib/services/notifications';
import { queueDisbursementBatch } from '@/lib/services/payroll-disbursement';

/**
 * Pesapal IPN handler.
 *
 * SECURITY: Pesapal sends IPN notifications as GET requests with query params.
 * The params are UNTRUSTED. We ALWAYS call getTransactionStatus() for
 * server-to-server verification before mutating any record to a terminal state,
 * and ALWAYS return HTTP 200 so Pesapal does not retry endlessly.
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const orderTrackingId = searchParams.get('OrderTrackingId');
    const merchantReference = searchParams.get('OrderMerchantReference');

    if (!orderTrackingId || !merchantReference) {
      return Response.json({ status: 'ignored', reason: 'missing params' });
    }

    // -- SECURITY CHECKPOINT: server-to-server verification ---------------
    const verifiedStatus = await getTransactionStatus(orderTrackingId);
    if (verifiedStatus.error) {
      console.error('[Pesapal Webhook] Verification error:', verifiedStatus.error);
      return Response.json({ status: 'verification_failed' });
    }

    const supabase = createAdminClient();
    const isCompleted = verifiedStatus.paymentStatus === 'COMPLETED';

    // -- Route 1: Tuition Payment ------------------------------------
    const { data: tuitionPayment } = await supabase
      .from('tuition_payments')
      .select('id, school_id, student_id, fee_account_id, amount, status')
      .eq('id', merchantReference)
      .maybeSingle();

    if (tuitionPayment && (tuitionPayment as { status: string }).status === 'PENDING') {
      const tp = tuitionPayment as unknown as { id: string; school_id: string };
      const newStatus = isCompleted ? 'COMPLETED' : 'FAILED';

      await supabase.rpc('confirm_tuition_payment', {
        p_tuition_payment_id: tp.id,
        p_pesapal_tracking_id: orderTrackingId,
        p_new_status: newStatus,
        p_verified_amount: verifiedStatus.amount,
      } as never);

      if (isCompleted) {
        await dispatchNotifications({
          schoolId: tp.school_id,
          relatedEntityType: 'tuition_payment',
          relatedEntityId: tp.id,
          channels: ['IN_APP', 'SMS'],
        }).catch((err) => console.error('[Notifications] Failed:', err));
      }

      return Response.json({ status: 'ok', processed: 'tuition_payment' });
    }

    // -- Route 2: Payroll Funding ------------------------------------
    const { data: payrollBatch } = await supabase
      .from('payroll_batches')
      .select('id, school_id, funding_payment_status')
      .eq('pesapal_funding_ref', merchantReference)
      .maybeSingle();

    if (
      payrollBatch &&
      (payrollBatch as { funding_payment_status: string }).funding_payment_status ===
        'AWAITING_EXTERNAL_FUNDING'
    ) {
      const pb = payrollBatch as unknown as { id: string };
      const newStatus = isCompleted ? 'SUCCESS' : 'FAILED';

      await supabase
        .from('payroll_batches')
        .update({
          funding_payment_status: newStatus,
          pesapal_order_tracking_id: orderTrackingId,
          funded_at: isCompleted ? new Date().toISOString() : null,
          updated_at: new Date().toISOString(),
        } as never)
        .eq('id', pb.id);

      if (isCompleted) {
        await queueDisbursementBatch(pb.id).catch((err) =>
          console.error('[Payroll Disbursement] Queue failed:', err)
        );
      }

      return Response.json({ status: 'ok', processed: 'payroll_funding' });
    }

    // -- Route 3: Subscription Payment --------------------------------
    const { data: invoice } = await supabase
      .from('subscription_invoices')
      .select('id, school_id, plan, status')
      .eq('pesapal_tx_id', merchantReference)
      .maybeSingle();

    if (invoice && (invoice as { status: string }).status === 'pending' && isCompleted) {
      const inv = invoice as unknown as { id: string; school_id: string; plan: string };
      await supabase
        .from('subscription_invoices')
        .update({
          status: 'paid',
          paid_at: new Date().toISOString(),
          pesapal_tx_id: orderTrackingId,
          amount: verifiedStatus.amount,
          updated_at: new Date().toISOString(),
        } as never)
        .eq('id', inv.id);

      await supabase
        .from('schools')
        .update({
          subscription_plan: inv.plan,
          subscription_status: 'active',
          trial_ends_at: null,
          updated_at: new Date().toISOString(),
        } as never)
        .eq('id', inv.school_id);

      await supabase.from('audit_logs').insert({
        school_id: inv.school_id,
        user_id: null,
        action: 'subscription_payment_confirmed_pesapal',
        entity_type: 'subscription_invoice',
        entity_id: inv.id,
        old_value: null,
        new_value: {
          plan: inv.plan,
          amount: verifiedStatus.amount,
          pesapal_tracking_id: orderTrackingId,
        },
        ip_address: null,
      } as never);

      return Response.json({ status: 'ok', processed: 'subscription' });
    }

    return Response.json({ status: 'ok', processed: 'no_match' });
  } catch (err) {
    console.error('[Pesapal Webhook] Unhandled error:', err);
    return Response.json({ status: 'error_logged' });
  }
}

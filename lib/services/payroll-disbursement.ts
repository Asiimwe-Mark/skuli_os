import { createAdminClient } from '@/lib/supabase/admin';
import { disburseFunds } from '@/lib/gateways/pesapal';
import { dispatchNotifications } from '@/lib/services/notifications';
import { sanitizePhoneForPayment } from '@/lib/utils/phone';
import type { Database } from '@/types/database';

type BatchLineItemRow = Database['public']['Tables']['batch_line_items']['Row'];
type BatchLineItemUpdate = Database['public']['Tables']['batch_line_items']['Update'];
type DisbursalStatus = Database['public']['Enums']['disbursal_status'];

// Supabase returns number columns as number from the JS client
type LineItemQueryRow = Pick<
  BatchLineItemRow,
  | 'id'
  | 'batch_id'
  | 'staff_id'
  | 'worker_name'
  | 'payout_amount'
  | 'idempotency_key'
  | 'snapshot_payout_method'
  | 'snapshot_mobile_number'
  | 'snapshot_bank_code'
  | 'snapshot_account_number'
  | 'disbursal_attempts'
>;

interface StaffRow {
  user_id: string | null;
  school_id: string;
}

/**
 * Called when payroll batch funding is confirmed by the Pesapal webhook.
 *
 * 1. Atomically flips all HOLD_UNTIL_FUNDED items → QUEUED.
 * 2. Iterates each QUEUED item and dispatches via Pesapal Openfloat B2C.
 * 3. Reads ONLY from snapshot columns — never from live staff_payment_profiles.
 * 4. Uses idempotency_key to prevent double-payment on retries.
 */
export async function queueDisbursementBatch(batchId: string): Promise<void> {
  const supabase = createAdminClient();

  // ── Step 1: Flip HOLD_UNTIL_FUNDED → QUEUED ──────────────────────────────
  const { error: flipError } = await supabase
    .from('batch_line_items')
    .update({
      disbursal_status: 'QUEUED' as DisbursalStatus,
      updated_at: new Date().toISOString(),
    } satisfies BatchLineItemUpdate)
    .eq('batch_id', batchId)
    .eq('disbursal_status', 'HOLD_UNTIL_FUNDED');

  if (flipError) {
    throw new Error(`Failed to queue line items for batch ${batchId}: ${flipError.message}`);
  }

  // ── Step 2: Fetch QUEUED items ────────────────────────────────────────────
  const { data: lineItems, error: fetchError } = await supabase
    .from('batch_line_items')
    .select(
      `id, batch_id, staff_id, worker_name, payout_amount, idempotency_key,
       snapshot_payout_method, snapshot_mobile_number, snapshot_bank_code,
       snapshot_account_number, disbursal_attempts`,
    )
    .eq('batch_id', batchId)
    .eq('disbursal_status', 'QUEUED');

  if (fetchError || !lineItems) {
    throw new Error(`Failed to fetch queued line items: ${fetchError?.message}`);
  }

  // ── Step 3: Disburse each item ────────────────────────────────────────────
  for (const item of lineItems as LineItemQueryRow[]) {
    try {
      let destination: string;
      let account: Parameters<typeof disburseFunds>[0]['account'];

      if (item.snapshot_payout_method === 'MOBILE_MONEY') {
        if (!item.snapshot_mobile_number) {
          throw new Error(`No mobile number in snapshot for line item ${item.id}`);
        }
        destination = sanitizePhoneForPayment(item.snapshot_mobile_number);
        account = {
          mobileNumber: `+${destination}`,
          network:
            destination.startsWith('25677') || destination.startsWith('25678')
              ? 'MTN'
              : 'AIRTEL',
        };
      } else {
        if (!item.snapshot_bank_code || !item.snapshot_account_number) {
          throw new Error(`No bank details in snapshot for line item ${item.id}`);
        }
        account = {
          bankCode: item.snapshot_bank_code,
          accountNumber: item.snapshot_account_number,
        };
      }

      const result = await disburseFunds({
        uniqueOrderId: item.idempotency_key,
        amount: Number(item.payout_amount),
        currency: 'UGX',
        description: `Salary: ${item.worker_name}`,
        account,
      });

      if (result.success) {
        const successUpdate: BatchLineItemUpdate = {
          disbursal_status: 'SUCCESS' as DisbursalStatus,
          ...(result.trackingId && { provider_receipt_id: result.trackingId }),
          disbursed_at: new Date().toISOString(),
          disbursal_attempts: item.disbursal_attempts + 1,
          last_error: null,
          updated_at: new Date().toISOString(),
        };
        await supabase.from('batch_line_items').update(successUpdate).eq('id', item.id);

        // Notify worker — isolated, never throws to outer loop
        try {
          const { data: staffData } = await supabase
            .from('staff')
            .select('user_id, school_id')
            .eq('id', item.staff_id)
            .single();

          const staff = staffData as StaffRow | null;
          if (staff) {
            const phone =
              item.snapshot_payout_method === 'MOBILE_MONEY'
                ? (item.snapshot_mobile_number ?? undefined)
                : undefined;

            await dispatchNotifications({
              schoolId: staff.school_id,
              relatedEntityType: 'payroll_disbursal',
              relatedEntityId: String(item.id),
              channels: phone ? ['IN_APP', 'SMS'] : ['IN_APP'],
              recipientUserId: staff.user_id ?? undefined,
              recipientPhone: phone ? `+${sanitizePhoneForPayment(phone)}` : undefined,
            });
          }
        } catch (notifyErr) {
          console.error('[Payroll] Post-disbursal notification failed:', notifyErr);
        }
      } else {
        const failUpdate: BatchLineItemUpdate = {
          disbursal_status: 'FAILED' as DisbursalStatus,
          last_error: result.error ?? 'Unknown gateway error',
          disbursal_attempts: item.disbursal_attempts + 1,
          updated_at: new Date().toISOString(),
        };
        await supabase.from('batch_line_items').update(failUpdate).eq('id', item.id);
        console.error(`[Payroll Disbursal] Failed for item ${item.id}:`, result.error);
      }
    } catch (err) {
      const errUpdate: BatchLineItemUpdate = {
        disbursal_status: 'FAILED' as DisbursalStatus,
        last_error: err instanceof Error ? err.message : 'Unknown error',
        disbursal_attempts: (item.disbursal_attempts ?? 0) + 1,
        updated_at: new Date().toISOString(),
      };
      await supabase.from('batch_line_items').update(errUpdate).eq('id', item.id);
      console.error(`[Payroll Disbursal] Unexpected error for item ${item.id}:`, err);
    }
  }
}
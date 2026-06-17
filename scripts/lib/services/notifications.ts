import { createAdminClient } from '@/lib/supabase/admin';
import { sendSms, getSchoolCredentials } from '@/lib/africas-talking/client';
import type { Database } from '@/types/database';

type NotificationLogInsert = Database['public']['Tables']['notification_logs']['Insert'];
type NotificationLogUpdate = Database['public']['Tables']['notification_logs']['Update'];
type InAppNotificationInsert = Database['public']['Tables']['in_app_notifications']['Insert'];
type NotificationChannel = Database['public']['Enums']['notification_channel'];

// SMS_SINGLE_UNIT_MAX: messages exceeding this consume 2 carrier billing units
const SMS_SINGLE_UNIT_MAX = 160;

interface DispatchOptions {
  schoolId: string;
  relatedEntityType: 'tuition_payment' | 'payroll_disbursal' | 'subscription';
  relatedEntityId: string;
  channels: Array<'IN_APP' | 'SMS'>;
  recipientUserId?: string;
  recipientPhone?: string;
  /** If omitted, auto-generated from the related entity */
  message?: string;
}

/**
 * Dispatch dual-channel notifications.
 * IN_APP write is synchronous and immediate.
 * SMS dispatch is isolated — its failure does NOT throw or affect callers.
 */
export async function dispatchNotifications(opts: DispatchOptions): Promise<void> {
  const supabase = createAdminClient();

  const messageText = opts.message ?? (await buildMessageText(supabase, opts));
  if (!messageText) return;

  const isMultiUnit = messageText.length > SMS_SINGLE_UNIT_MAX;

  // ── IN_APP notification ───────────────────────────────────────────────────
  if (opts.channels.includes('IN_APP')) {
    try {
      const logInsert: NotificationLogInsert = {
        school_id: opts.schoolId,
        recipient_user_id: opts.recipientUserId ?? null,
        recipient_phone: null,
        channel_type: 'IN_APP' as NotificationChannel,
        message_body: messageText,
        delivery_status: 'sent',
        multi_sms_flag: false,
        related_entity_type: opts.relatedEntityType,
        related_entity_id: opts.relatedEntityId,
        sent_at: new Date().toISOString(),
      };
      await supabase.from('notification_logs').insert(logInsert);

      // Write to in_app_notifications for bell-icon inbox
      if (opts.recipientUserId) {
        const notifInsert: InAppNotificationInsert = {
          school_id: opts.schoolId,
          recipient_user_id: opts.recipientUserId,
          title: buildTitle(opts.relatedEntityType),
          body: messageText,
          related_entity_type: opts.relatedEntityType,
          related_entity_id: opts.relatedEntityId,
          is_read: false,
          type: opts.relatedEntityType,
        };
        await supabase.from('in_app_notifications').insert(notifInsert);
      }
    } catch (err) {
      console.error('[Notifications] IN_APP write failed:', err);
    }
  }

  // ── SMS notification ──────────────────────────────────────────────────────
  if (opts.channels.includes('SMS') && opts.recipientPhone) {
    let logRowId: string | null = null;

    try {
      const smsLogInsert: NotificationLogInsert = {
        school_id: opts.schoolId,
        recipient_user_id: opts.recipientUserId ?? null,
        recipient_phone: opts.recipientPhone,
        channel_type: 'SMS' as NotificationChannel,
        message_body: messageText,
        delivery_status: 'pending',
        multi_sms_flag: isMultiUnit,
        related_entity_type: opts.relatedEntityType,
        related_entity_id: opts.relatedEntityId,
      };

      const { data: logRow } = await supabase
        .from('notification_logs')
        .insert(smsLogInsert)
        .select('id')
        .single();

      logRowId = logRow?.id ?? null;

      if (isMultiUnit) {
        console.warn(
          `[Notifications] SMS to ${opts.recipientPhone} is ${messageText.length} chars — ` +
            `will consume 2 SMS units. Entity: ${opts.relatedEntityType}/${opts.relatedEntityId}`,
        );
      }

      const credentials = await getSchoolCredentials(supabase, opts.schoolId);
      if (!credentials) {
        throw new Error("Africa's Talking credentials not configured for this school");
      }

      const response = await sendSms(
        { to: opts.recipientPhone, message: messageText },
        credentials,
      );

      type AtRecipient = {
        statusCode?: number;
        status?: string;
        cost?: string;
        messageId?: string;
      };
      const recipient = response?.SMSMessageData?.Recipients?.[0] as AtRecipient | undefined;
      const isSuccess = recipient?.statusCode === 101 || recipient?.status === 'Success';
      const cost = recipient?.cost
        ? parseFloat(String(recipient.cost).replace(/[^0-9.-]+/g, '')) || null
        : null;

      if (logRowId) {
        const update: NotificationLogUpdate = {
          delivery_status: isSuccess ? 'sent' : 'failed',
          sent_at: isSuccess ? new Date().toISOString() : null,
          last_error: isSuccess
            ? null
            : `AT statusCode=${recipient?.statusCode ?? 'unknown'}`,
          cost,
          provider_message_id: recipient?.messageId ?? null,
        };
        await supabase.from('notification_logs').update(update).eq('id', logRowId);
      }
    } catch (err) {
      console.error('[Notifications] SMS dispatch failed:', err);
      if (logRowId) {
        try {
          const failUpdate: NotificationLogUpdate = {
            delivery_status: 'failed',
            last_error: err instanceof Error ? err.message : 'Unknown SMS error',
          };
          await supabase.from('notification_logs').update(failUpdate).eq('id', logRowId);
        } catch {
          // best-effort — don't propagate
        }
      }
    }
  }
}

function buildTitle(entityType: string): string {
  switch (entityType) {
    case 'tuition_payment':
      return 'Fee Payment Confirmed';
    case 'payroll_disbursal':
      return 'Salary Disbursed';
    default:
      return 'Notification';
  }
}

// ── Join result types for buildMessageText ────────────────────────────────────

interface TuitionPaymentJoin {
  amount: number;
  receipt_number: string | null;
  fee_type_label: string | null;
  students: { full_name?: string } | null;
  schools: { name?: string } | null;
}

interface BatchLineItemJoin {
  payout_amount: number;
  worker_name: string;
  snapshot_payout_method: string;
}

async function buildMessageText(
  supabase: ReturnType<typeof createAdminClient>,
  opts: DispatchOptions,
): Promise<string | null> {
  if (opts.relatedEntityType === 'tuition_payment') {
    const { data } = await supabase
      .from('tuition_payments')
      .select('amount, receipt_number, fee_type_label, students(full_name), schools(name)')
      .eq('id', opts.relatedEntityId)
      .single();

    if (!data) return null;
    const d = data as unknown as TuitionPaymentJoin;
    const student = d.students?.full_name ?? 'your child';
    const school = d.schools?.name ?? 'the school';
    return (
      `Payment of UGX ${Number(d.amount).toLocaleString()} confirmed for ${student} at ${school}. ` +
      `Receipt: ${d.receipt_number ?? 'Pending'}. ` +
      `Fee type: ${d.fee_type_label ?? 'School Fees'}.`
    );
  }

  if (opts.relatedEntityType === 'payroll_disbursal') {
    const { data } = await supabase
      .from('batch_line_items')
      .select('payout_amount, worker_name, snapshot_payout_method')
      .eq('id', Number(opts.relatedEntityId))
      .single();

    if (!data) return null;
    const d = data as unknown as BatchLineItemJoin;
    const method = d.snapshot_payout_method === 'BANK' ? 'bank account' : 'mobile wallet';
    return (
      `Your salary of UGX ${Number(d.payout_amount).toLocaleString()} has been sent to your ` +
      `${method}. Contact your bursar for queries.`
    );
  }

  return null;
}
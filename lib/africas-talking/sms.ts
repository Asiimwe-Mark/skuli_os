import { sendSms, type ATCredentials } from './client';

export interface SmsRecipient {
  phone: string;
  name?: string;
}

export interface SmsResult {
  phone: string;
  success: boolean;
  messageId?: string;
  status?: string;
  error?: string;
}

/**
 * Send a single SMS message.
 */
export async function sendSingleSms(
  phone: string,
  message: string,
  credentials?: ATCredentials
): Promise<SmsResult> {
  try {
    const response = await sendSms({ to: phone, message }, credentials);
    const recipient = response.SMSMessageData?.Recipients?.[0];

    return {
      phone,
      success: recipient?.status === 'Success',
      messageId: recipient?.messageId,
      status: recipient?.status,
    };
  } catch (error) {
    return {
      phone,
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * Send SMS to multiple recipients with rate limiting.
 * Africa's Talking recommends max 20 recipients per batch.
 */
export async function sendBulkSms(
  recipients: SmsRecipient[],
  message: string,
  credentials?: ATCredentials,
  batchSize = 20
): Promise<SmsResult[]> {
  const results: SmsResult[] = [];

  // Process in batches to avoid rate limiting
  for (let i = 0; i < recipients.length; i += batchSize) {
    const batch = recipients.slice(i, i + batchSize);
    const phones = batch.map((r) => r.phone);

    try {
      const response = await sendSms({ to: phones, message }, credentials);
      const sentRecipients = response.SMSMessageData?.Recipients || [];

      for (const recipient of sentRecipients) {
        results.push({
          phone: recipient.number,
          success: recipient.status === 'Success',
          messageId: recipient.messageId,
          status: recipient.status,
        });
      }

      // Add failed phones that weren't in the response
      const respondedPhones = new Set(sentRecipients.map((r: { number: string }) => r.number));
      for (const batchPhone of phones) {
        if (!respondedPhones.has(batchPhone)) {
          results.push({
            phone: batchPhone,
            success: false,
            error: 'No response from provider',
          });
        }
      }
    } catch (error) {
      // Mark entire batch as failed
      for (const phone of phones) {
        results.push({
          phone,
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    }

    // Rate limiting delay between batches (100ms)
    if (i + batchSize < recipients.length) {
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
  }

  return results;
}

/**
 * Personalize message with recipient name.
 */
export function personalizeMessage(template: string, name: string): string {
  return template.replace(/\{name\}/gi, name);
}

/**
 * Bulk-send per-recipient SMS in batched API calls.
 *
 * The existing `sendBulkSms` sends the same body to every
 * recipient in a batch. This variant supports the communication
 * broadcast flow where each recipient sees a personalised message
 * (`Hi John, your balance for P5 is UGX 250,000`). We group
 * recipients by identical body so the AT batched API is still
 * used, then emit a per-recipient result so the caller can build
 * the `sms_logs` rows.
 */
export interface PerRecipientSms {
  phone: string;
  message: string;
}

export interface PerRecipientSmsResult {
  phone: string;
  message: string;
  success: boolean;
  messageId?: string;
  status?: string;
  cost?: number;
  error?: string;
}

export async function sendBulkSmsPerRecipient(
  items: PerRecipientSms[],
  credentials?: ATCredentials,
  batchSize = 20,
): Promise<PerRecipientSmsResult[]> {
  const results: PerRecipientSmsResult[] = [];

  // Group by identical body so each AT call has a single message
  // string + an array of phones. Preserves the AT batched
  // throughput benefit while supporting per-recipient text.
  const byBody = new Map<string, PerRecipientSms[]>();
  for (const item of items) {
    const bucket = byBody.get(item.message);
    if (bucket) bucket.push(item);
    else byBody.set(item.message, [item]);
  }

  for (const [body, recipients] of byBody) {
    for (let i = 0; i < recipients.length; i += batchSize) {
      const batch = recipients.slice(i, i + batchSize);
      const phones = batch.map((r) => r.phone);

      try {
        const response = await sendSms({ to: phones, message: body }, credentials);
        const sentRecipients = response.SMSMessageData?.Recipients || [];

        for (const recipient of sentRecipients) {
          const matched = batch.find((r) => r.phone === recipient.number);
          results.push({
            phone: recipient.number,
            message: body,
            success: recipient.status === 'Success',
            messageId: recipient.messageId,
            status: recipient.status,
          });
          void matched;
        }

        // Phones AT did not respond about — mark as failed.
        const responded = new Set(sentRecipients.map((r: { number: string }) => r.number));
        for (const b of batch) {
          if (!responded.has(b.phone)) {
            results.push({
              phone: b.phone,
              message: body,
              success: false,
              error: 'No response from provider',
            });
          }
        }
      } catch (error) {
        for (const b of batch) {
          results.push({
            phone: b.phone,
            message: body,
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error',
          });
        }
      }

      if (i + batchSize < recipients.length) {
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
    }
  }

  return results;
}

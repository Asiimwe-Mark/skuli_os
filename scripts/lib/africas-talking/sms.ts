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

import crypto from 'crypto';

/**
 * Verify Africa's Talking webhook signature using HMAC-SHA256.
 * The signature is sent in the 'X-AT-Signature' header.
 */
export function verifyWebhookSignature(
  payload: string | Buffer,
  signature: string,
  apiKey: string
): boolean {
  try {
    const hmac = crypto.createHmac('sha256', apiKey);
    hmac.update(typeof payload === 'string' ? payload : payload.toString());
    const computedSignature = hmac.digest('hex');

    // Use timing-safe comparison to prevent timing attacks
    return crypto.timingSafeEqual(
      Buffer.from(computedSignature, 'hex'),
      Buffer.from(signature, 'hex')
    );
  } catch {
    return false;
  }
}

/**
 * Parse and validate an Africa's Talking webhook request.
 */
export async function parseWebhookRequest(
  request: Request,
  apiKey: string
): Promise<{ valid: boolean; body?: unknown; error?: string }> {
  try {
    const signature = request.headers.get('X-AT-Signature') || request.headers.get('x-at-signature');
    if (!signature) {
      return { valid: false, error: 'Missing signature header' };
    }

    const rawBody = await request.text();

    if (!verifyWebhookSignature(rawBody, signature, apiKey)) {
      return { valid: false, error: 'Invalid signature' };
    }

    const body = JSON.parse(rawBody);
    return { valid: true, body };
  } catch (error) {
    return {
      valid: false,
      error: error instanceof Error ? error.message : 'Failed to parse webhook',
    };
  }
}

/**
 * SMS delivery report webhook payload.
 */
export interface SmsDeliveryReport {
  id: string;
  status: string;
  phoneNumber: string;
  failureReason?: string;
  networkCode?: string;
}

/**
 * Mobile money payment callback webhook payload.
 */
export interface MobileMoneyCallback {
  transactionId: string;
  status: string;
  provider: string;
  phoneNumber: string;
  amount: number;
  currency: string;
  metadata?: Record<string, string>;
}

/**
 * Parse SMS delivery report from webhook body.
 */
export function parseSmsDeliveryReport(body: unknown): SmsDeliveryReport | null {
  if (!body || typeof body !== 'object') return null;

  const data = body as Record<string, unknown>;
  if (!data.id || !data.status || !data.phoneNumber) return null;

  return {
    id: String(data.id),
    status: String(data.status),
    phoneNumber: String(data.phoneNumber),
    failureReason: data.failureReason ? String(data.failureReason) : undefined,
    networkCode: data.networkCode ? String(data.networkCode) : undefined,
  };
}

/**
 * Parse mobile money callback from webhook body.
 */
export function parseMobileMoneyCallback(body: unknown): MobileMoneyCallback | null {
  if (!body || typeof body !== 'object') return null;

  const data = body as Record<string, unknown>;
  if (!data.transactionId || !data.status || !data.phoneNumber) return null;

  return {
    transactionId: String(data.transactionId),
    status: String(data.status),
    provider: String(data.provider || ''),
    phoneNumber: String(data.phoneNumber),
    amount: Number(data.amount || 0),
    currency: String(data.currency || 'UGX'),
    metadata: data.metadata as Record<string, string> | undefined,
  };
}

import crypto from 'crypto';

/**
 * Africa's Talking uses **base64** for the `X-Africa-Talking-Signature`
 * header (per AT docs). The earlier version of this file emitted a
 * `hex` digest which made `verifyWebhookSignature` incompatible with
 * the header the live gateway actually sends, so the helper was
 * silently dead code and every webhook route had to re-implement HMAC
 * verification inline.
 *
 * The helper now:
 *  - supports both base64 (live) and hex (some sandboxes) encodings,
 *    chosen at the call site
 *  - uses `timingSafeEqual` with a length pre-check so we never leak
 *    the expected digest length via timing
 *  - returns false (never throws) on any malformed input
 */
export type ATSignatureEncoding = 'base64' | 'hex';

function safeDigest(encoding: ATSignatureEncoding, key: string, payload: string): string {
  const hmac = crypto.createHmac('sha256', key);
  hmac.update(typeof payload === 'string' ? payload : Buffer.from(payload).toString('utf-8'));
  return hmac.digest(encoding);
}

export function verifyWebhookSignature(
  payload: string | Buffer,
  signature: string,
  apiKey: string,
  encoding: ATSignatureEncoding = 'base64',
): boolean {
  if (!apiKey || !signature) return false;
  try {
    const computed = safeDigest(encoding, apiKey, payload as string);
    const a = Buffer.from(computed, encoding);
    const b = Buffer.from(signature, encoding);
    if (a.length !== b.length) return false;
    return crypto.timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

/**
 * Parse and validate an Africa's Talking webhook request.
 */
export async function parseWebhookRequest(
  request: Request,
  apiKey: string,
  encoding: ATSignatureEncoding = 'base64',
): Promise<{ valid: boolean; body?: unknown; error?: string }> {
  try {
    const signature =
      request.headers.get('X-AT-Signature') ||
      request.headers.get('x-at-signature') ||
      request.headers.get('X-Africa-Talking-Signature') ||
      request.headers.get('x-africa-talking-signature') ||
      '';
    if (!signature) {
      return { valid: false, error: 'Missing signature header' };
    }

    const rawBody = await request.text();

    if (!verifyWebhookSignature(rawBody, signature, apiKey, encoding)) {
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

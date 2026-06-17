import crypto from 'crypto';

/**
 * Generate a deterministic idempotency key for a payroll line item.
 * sha256(lineItemId + destination + amount)
 * Identical inputs always produce the same key so gateway retries are deduped.
 */
export function generateDisbursementIdempotencyKey(
  lineItemId: string | number,
  destination: string, // mobile number or account number
  amount: number
): string {
  return crypto
    .createHash('sha256')
    .update(`${lineItemId}:${destination}:${amount}`)
    .digest('hex');
}

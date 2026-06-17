/**
 * Normalize Uganda phone numbers to +256XXXXXXXXX format.
 * Accepts: 07XXXXXXXX, 7XXXXXXXX, +256XXXXXXXXX, 256XXXXXXXXX
 */
export function normalizePhone(phone: string): string {
  const digits = phone.replace(/\D/g, "");

  if (digits.startsWith("256") && digits.length === 12) {
    return `+${digits}`;
  }
  if (digits.startsWith("0") && digits.length === 10) {
    return `+256${digits.slice(1)}`;
  }
  if (digits.length === 9 && (digits.startsWith("7") || digits.startsWith("3"))) {
    return `+256${digits}`;
  }
  return `+${digits}`;
}

export function isValidUgandaPhone(phone: string): boolean {
  const normalized = normalizePhone(phone);
  return /^\+256[37]\d{8}$/.test(normalized);
}

export function formatPhoneDisplay(phone: string): string {
  const normalized = normalizePhone(phone);
  // +256 7XX XXX XXX
  return normalized.replace(/(\+256)(\d{3})(\d{3})(\d{3})/, "$1 $2 $3 $4");
}

/**
 * Detect the Ugandan mobile-money provider from a phone number.
 *
 * MTN Uganda prefixes:   077, 078, 076, 039, 031
 * Airtel Uganda prefixes: 070, 074, 075, 020
 *
 * Returns "mtn" | "airtel" | null (unknown). The previous implementation
 * classified every 07x number as MTN, mislabelling Airtel 070/074/075.
 */
export function detectMobileMoneyProvider(
  phone: string
): "mtn" | "airtel" | null {
  const normalized = normalizePhone(phone); // +256XXXXXXXXX
  const match = normalized.match(/^\+256(\d{2})/);
  if (!match) return null;
  const prefix = match[1];
  const mtn = new Set(["77", "78", "76", "39", "31"]);
  const airtel = new Set(["70", "74", "75", "20"]);
  if (mtn.has(prefix)) return "mtn";
  if (airtel.has(prefix)) return "airtel";
  return null;
}

/**
 * Strict Uganda phone sanitiser for financial transactions.
 * Strips whitespace, drops leading zeros, drops leading '+',
 * prepends '256'. Throws if result is not exactly 12 characters.
 * Returns the clean 12-char string (no '+' prefix) for gateway APIs.
 */
export function sanitizePhoneForPayment(raw: string): string {
  // Strip all whitespace
  let cleaned = raw.replace(/\s+/g, "");
  // Drop leading '+'
  if (cleaned.startsWith("+")) cleaned = cleaned.slice(1);
  // Drop leading '256' if present, then re-add to normalise
  if (cleaned.startsWith("256")) cleaned = cleaned.slice(3);
  // Drop leading '0' (local format: 07x / 03x)
  if (cleaned.startsWith("0")) cleaned = cleaned.slice(1);
  // Prepend country code
  cleaned = `256${cleaned}`;
  if (cleaned.length !== 12) {
    throw new Error(
      `Invalid Uganda phone number: "${raw}" \u2192 "${cleaned}" (expected 12 digits)`
    );
  }
  return cleaned;
}

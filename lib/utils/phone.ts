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

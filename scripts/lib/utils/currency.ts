/**
 * Audit 10.15: the previous `formatUGX` hard-coded UGX, so a
 * Kenyan school signing up would still see "UGX 50,000" in
 * the UI. Map the school's country_code (UG / KE / TZ) to its
 * ISO 4217 currency code and pass that to formatCurrency.
 */
const COUNTRY_TO_CURRENCY: Record<string, string> = {
  UG: "UGX",
  KE: "KES",
  TZ: "TZS",
  NG: "NGN",
  GH: "GHS",
  RW: "RWF",
  ZM: "ZMW",
};

export function currencyForCountry(countryCode: string | null | undefined): string {
  if (!countryCode) return "UGX";
  return COUNTRY_TO_CURRENCY[countryCode.toUpperCase()] ?? "UGX";
}

/**
 * Generic currency formatter. Defaults to UGX for backward compatibility.
 * Safe against null/undefined/non-numeric input — returns "—" for missing values.
 */
export function formatCurrency(
  amount: number | string | null | undefined,
  currencyCode: string = "UGX"
): string {
  const n = typeof amount === "string" ? parseFloat(amount) : amount;
  if (n == null || !Number.isFinite(n)) return `${currencyCode} —`;
  return `${currencyCode} ${n.toLocaleString("en-UG")}`;
}

// Convenience: format using the currency for a given country.
export function formatForCountry(
  amount: number | string | null | undefined,
  countryCode: string | null | undefined,
): string {
  return formatCurrency(amount, currencyForCountry(countryCode));
}

// Kept as an alias for backward compatibility across the existing codebase.
export const formatUGX = (amount: number | string | null | undefined): string =>
  formatCurrency(amount, "UGX");

export function parseUGX(value: string | null | undefined): number {
  if (!value) return 0;
  const n = Number(String(value).replace(/[^0-9.-]+/g, ""));
  return Number.isFinite(n) ? n : 0;
}

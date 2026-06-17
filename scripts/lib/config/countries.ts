export const SUPPORTED_COUNTRIES = ["UG", "KE", "TZ"] as const;
export type CountryCode = (typeof SUPPORTED_COUNTRIES)[number];

export interface CountryConfig {
  name: string;
  currencyCode: string;
  currencySymbol: string;
  phonePrefixes: string[];
  mobileMoneyProviders: { name: string; code: string }[];
  isLaunched: boolean;
}

export const COUNTRY_CONFIG: Record<CountryCode, CountryConfig> = {
  UG: {
    name: "Uganda",
    currencyCode: "UGX",
    currencySymbol: "UGX",
    phonePrefixes: ["+256"],
    mobileMoneyProviders: [
      { name: "MTN Mobile Money", code: "mtn" },
      { name: "Airtel Money", code: "airtel" },
    ],
    isLaunched: true,
  },
  KE: {
    name: "Kenya",
    currencyCode: "KES",
    currencySymbol: "KES",
    phonePrefixes: ["+254"],
    mobileMoneyProviders: [
      { name: "M-Pesa", code: "mpesa" },
      { name: "Airtel Money", code: "airtel" },
    ],
    isLaunched: false,
  },
  TZ: {
    name: "Tanzania",
    currencyCode: "TZS",
    currencySymbol: "TZS",
    phonePrefixes: ["+255"],
    mobileMoneyProviders: [
      { name: "M-Pesa", code: "mpesa" },
      { name: "Tigo Pesa", code: "tigo" },
      { name: "Airtel Money", code: "airtel" },
    ],
    isLaunched: false,
  },
};

export function currencyForCountry(code: string | null | undefined): string {
  const key = (code ?? "UG") as CountryCode;
  return COUNTRY_CONFIG[key]?.currencyCode ?? "UGX";
}

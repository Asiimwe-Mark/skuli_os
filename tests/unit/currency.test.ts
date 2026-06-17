/**
 * Gate tests for lib/utils/currency (audit 10.15).
 *
 * The previous `formatUGX` was hard-coded to "UGX" so a Kenyan
 * school would see "UGX 50,000" in the UI even though their
 * accounts are in KES. The new currencyForCountry +
 * formatForCountry helpers map country_code to the right
 * ISO 4217 currency.
 */
import { describe, it, expect } from "vitest";
import {
  formatCurrency,
  formatUGX,
  formatForCountry,
  currencyForCountry,
  parseUGX,
} from "@/lib/utils/currency";

describe("currencyForCountry (audit 10.15)", () => {
  it("returns UGX for Uganda", () => {
    expect(currencyForCountry("UG")).toBe("UGX");
  });
  it("returns KES for Kenya", () => {
    expect(currencyForCountry("KE")).toBe("KES");
  });
  it("returns TZS for Tanzania", () => {
    expect(currencyForCountry("TZ")).toBe("TZS");
  });
  it("is case-insensitive", () => {
    expect(currencyForCountry("ug")).toBe("UGX");
    expect(currencyForCountry("ke")).toBe("KES");
  });
  it("falls back to UGX for unknown / null / undefined", () => {
    expect(currencyForCountry(null)).toBe("UGX");
    expect(currencyForCountry(undefined)).toBe("UGX");
    expect(currencyForCountry("")).toBe("UGX");
    expect(currencyForCountry("ZZ")).toBe("UGX");
  });
});

describe("formatForCountry", () => {
  it("formats KES for Kenya", () => {
    expect(formatForCountry(50000, "KE")).toMatch(/^KES\s/);
  });
  it("formats TZS for Tanzania", () => {
    expect(formatForCountry(50000, "TZ")).toMatch(/^TZS\s/);
  });
  it("formats UGX for Uganda", () => {
    expect(formatForCountry(50000, "UG")).toMatch(/^UGX\s/);
  });
  it("returns the placeholder for null amounts", () => {
    expect(formatForCountry(null, "KE")).toBe("KES —");
  });
  it("accepts a string amount", () => {
    expect(formatForCountry("50000", "KE")).toMatch(/^KES\s/);
  });
});

describe("formatCurrency (backward compat)", () => {
  it("defaults to UGX", () => {
    expect(formatCurrency(50000)).toMatch(/^UGX\s/);
  });
  it("respects an explicit currency", () => {
    expect(formatCurrency(50000, "USD")).toMatch(/^USD\s/);
  });
});

describe("formatUGX (backward compat alias)", () => {
  it("still returns UGX formatting", () => {
    expect(formatUGX(50000)).toMatch(/^UGX\s/);
  });
  it("handles null", () => {
    expect(formatUGX(null)).toBe("UGX —");
  });
});

describe("parseUGX", () => {
  it("strips non-numeric characters", () => {
    expect(parseUGX("UGX 50,000")).toBe(50000);
  });
  it("returns 0 for empty", () => {
    expect(parseUGX("")).toBe(0);
    expect(parseUGX(null)).toBe(0);
  });
  it("handles negatives", () => {
    expect(parseUGX("-1,500")).toBe(-1500);
  });
});

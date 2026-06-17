/**
 * Gate tests for lib/utils/dates (audit 10.14).
 *
 * The previous code used `new Date().toISOString().split("T")[0]`
 * to produce a "today" YYYY-MM-DD for date inputs and
 * `.eq("date", ...)` filters. That returns the UTC date, which
 * is off by one day for users east or west of UTC. The new
 * todayLocalISODate helper returns the local YYYY-MM-DD.
 */
import { describe, it, expect } from "vitest";
import { todayLocalISODate, toLocalISODate } from "@/lib/utils/dates";

describe("todayLocalISODate (audit 10.14)", () => {
  it("returns the local YYYY-MM-DD, not the UTC one", () => {
    // Build a date that is 2026-06-06 in some non-UTC tz.
    // 2026-06-06T23:30:00Z is 2026-06-07 in Asia/Tokyo (UTC+9) and
    // 2026-06-06 in UTC. We assert that the helper picks the
    // local date, not the UTC date.
    const d = new Date("2026-06-06T23:30:00Z");
    const local = todayLocalISODate(d);
    // The exact value depends on the runner's tz, but it must
    // match d.getFullYear/getMonth/getDate, not the UTC parts.
    const expected = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    expect(local).toBe(expected);
    // And in particular, in a non-UTC runner the UTC date would
    // be 2026-06-06, but the local date is 2026-06-07. The test
    // would fail if the helper still returned the UTC string.
    // We assert the local/UTC mismatch is handled:
    if (d.getDate() !== d.getUTCDate()) {
      expect(local).not.toBe(d.toISOString().split("T")[0]);
    }
  });

  it("pads single-digit month and day with leading zeros", () => {
    const d = new Date(2026, 0, 5); // Jan 5 2026 local
    expect(todayLocalISODate(d)).toBe("2026-01-05");
  });

  it("handles end-of-year", () => {
    const d = new Date(2026, 11, 31); // Dec 31 2026 local
    expect(todayLocalISODate(d)).toBe("2026-12-31");
  });
});

describe("toLocalISODate", () => {
  it("returns '' for null/undefined/invalid input", () => {
    expect(toLocalISODate(null)).toBe("");
    expect(toLocalISODate(undefined)).toBe("");
    expect(toLocalISODate("not a date")).toBe("");
  });

  it("returns the local YYYY-MM-DD for a valid date string", () => {
    const d = new Date(2026, 5, 6);
    expect(toLocalISODate(d.toISOString())).toBe("2026-06-06");
  });

  it("returns the local YYYY-MM-DD for a Date object", () => {
    const d = new Date(2026, 5, 6, 14, 30);
    expect(toLocalISODate(d)).toBe("2026-06-06");
  });
});

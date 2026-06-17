/**
 * Gate tests for lib/utils/csv (audit 5.2).
 *
 * The previous inline implementation used "\n" as the row terminator
 * and always wrapped every value in quotes. Excel on Windows treats
 * a bare LF inside a quoted field inconsistently, and the `"-always`
 * approach produces ugly output for simple fields. The new helper:
 * - Wraps a value in quotes ONLY if it contains `,`, `"`, `\r`, or `\n`
 * - Doubles embedded quotes (RFC 4180)
 * - Joins rows with `\r\n` (RFC 4180)
 */
import { describe, it, expect } from "vitest";
import { toCsv } from "@/lib/utils/csv";

describe("toCsv (audit 5.2)", () => {
  it("joins simple values with a comma", () => {
    expect(toCsv([["a", "b", "c"]])).toBe("a,b,c");
  });

  it("does not quote plain values", () => {
    const out = toCsv([["John Doe", "P5", "active"]]);
    expect(out).toBe("John Doe,P5,active");
    expect(out).not.toMatch(/"/);
  });

  it("quotes any value containing a comma", () => {
    expect(toCsv([["Doe, John"]])).toBe('"Doe, John"');
  });

  it("doubles embedded double quotes", () => {
    expect(toCsv([['He said "hi"']])).toBe('"He said ""hi"""');
  });

  it("quotes values containing a newline", () => {
    expect(toCsv([["line1\nline2"]])).toBe('"line1\nline2"');
  });

  it("uses CRLF as the row separator (RFC 4180)", () => {
    const out = toCsv([
      ["h1", "h2"],
      ["a", "b"],
    ]);
    expect(out).toBe("h1,h2\r\na,b");
  });

  it("handles a null / undefined as empty string", () => {
    expect(toCsv([[null, undefined, "x"]])).toBe(",,x");
  });

  it("stringifies numbers", () => {
    expect(toCsv([["n", 42]])).toBe("n,42");
  });

  it("preserves a value with both comma and quote", () => {
    expect(toCsv([['a, "b"']])).toBe('"a, ""b"""');
  });

  it("handles a student-style row with mixed fields", () => {
    const out = toCsv([
      ["Admission No", "Full Name", "Class"],
      ["ADM-001", "Doe, John", 'Said "hi"'],
    ]);
    expect(out).toBe(
      'Admission No,Full Name,Class\r\nADM-001,"Doe, John","Said ""hi"""'
    );
  });
});

/**
 * Regression tests for CSV formula injection (audit 12.x).
 *
 * OWASP: any cell whose first character is one of `=`, `+`, `-`, `@`,
 * TAB (`\t`), or CR (`\r`) is a formula-injection vector. Excel /
 * Google Sheets will execute the cell as a formula on open. The
 * toCsv helper must neutralise these by prepending a single quote `'`
 * so the cell is treated as text.
 */
describe("toCsv formula-injection neutralisation (audit 12.x)", () => {
  it.each([
    ["=cmd|'/c calc'!A1", "'=cmd|'/c calc'!A1"],
    ["+1+1", "'+1+1"],
    ["-2+3+cmd|'calc'", "'-2+3+cmd|'calc'"],
    ["@SUM(1+1)", "'@SUM(1+1)"],
    // Cells containing CR/LF get wrapped in quotes (RFC 4180), so
    // the formula-neutralising leading quote goes inside the wrap.
    ["\tleading-tab", "'\tleading-tab"],
    ["\rleading-cr", '"\'\rleading-cr"'],
  ])("neutralises a cell starting with %s", (input, expected) => {
    expect(toCsv([[input]])).toBe(expected);
  });

  it("does NOT neutralise plain text (only the formula-lead chars are escaped)", () => {
    expect(toCsv([["plain name"]])).toBe("plain name");
    expect(toCsv([["school=Kampala"]])).toBe("school=Kampala");
  });

  it("neutralises a real-world payload inside a quoted cell", () => {
    // A name like `=HYPERLINK("https://evil","click me")` is the
    // textbook phishing formula. It must NOT be passed through
    // unescaped into an Excel cell. The original value contains a
    // comma, so the helper wraps it in quotes; the leading `=` is
    // also neutralised with a `'`, so the cell is `"'=HYPERLINK(...)"`.
    const evil = '=HYPERLINK("https://evil","click me")';
    const out = toCsv([["Student", evil]]);
    // The cell text begins with `'` so Excel treats it as a string,
    // not a formula. The output does NOT contain a bare `=` after
    // a delimiter, which is the actual injection vector.
    expect(out).toBe("Student,\"'=HYPERLINK(\"\"https://evil\"\",\"\"click me\"\")\"");
  });

  it("neutralises even when the value is empty after the leading char", () => {
    expect(toCsv([["="]])).toBe("'=");
    expect(toCsv([["+"]])).toBe("'+");
    expect(toCsv([["-"]])).toBe("'-");
  });
});

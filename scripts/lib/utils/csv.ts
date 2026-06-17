/**
 * CSV export helpers (audit 5.2).
 *
 * The previous inline implementation used "\n" as the row terminator
 * and wrapped each value in `"..."`. Excel on Windows treats a bare
 * LF inside a quoted field inconsistently — modern Excel reads it
 * fine, but legacy tooling and some POSIX readers expect the RFC 4180
 * CRLF row terminator and a properly escaped value.
 *
 * `toCsv(rows)`:
 * - Wraps any value containing a comma, quote, CR, or LF in double quotes
 * - Escapes embedded double quotes by doubling them (`"` -> `""`)
 * - Joins rows with `\r\n` (RFC 4180)
 * - Joins columns with `,`
 *
 * CSV injection (audit 12.x): any cell whose first character is one
 * of `=`, `+`, `-`, `@`, TAB (`\t`), or CR (`\r`) is a formula-injection
 * vector. Excel/Sheets will execute the cell as a formula on open.
 * OWASP recommends prepending a single quote `'` to neutralise the
 * formula. We apply this BEFORE the existing escape so the resulting
 * CSV stays RFC-4180 compliant.
 */
const FORMULA_INJECTION_LEAD = /^[=+\-@\t\r]/;

function neutralizeFormula(s: string): string {
  return FORMULA_INJECTION_LEAD.test(s) ? `'${s}` : s;
}

export function toCsv(rows: (string | number | null | undefined)[][]): string {
  const escape = (v: string | number | null | undefined): string => {
    if (v === null || v === undefined) return "";
    const s = neutralizeFormula(String(v));
    if (/[",\r\n]/.test(s)) {
      return `"${s.replace(/"/g, '""')}"`;
    }
    return s;
  };
  return rows.map((r) => r.map(escape).join(",")).join("\r\n");
}

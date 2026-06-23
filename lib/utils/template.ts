/**
 * SMS / announcement template engine.
 *
 * Why this exists
 * ---------------
 * Before this helper, the codebase had two slightly different
 * implementations of `{name}`, `{balance}`, `{school_name}` etc.
 * substitution:
 *
 *   • `lib/africas-talking/sms.ts:personalizeMessage` — one regex per
 *     variable, no template registry, hard-coded list.
 *   • `app/api/communication/send/route.ts:personalizeMessage` —
 *     the same shape again, with `formatUGX(balance)` and a
 *     `{results_link}` that interpolates the public app URL.
 *
 * Both are now retired in favour of this single `renderTemplate`
 * function. It uses one compiled regex, accepts an arbitrary vars
 * record, leaves unknown placeholders untouched, and is dependency-
 * free.
 *
 * Why unknown placeholders are NOT replaced
 * -----------------------------------------
 * Some schools write `{date}` or `{headteacher}` expecting the
 * engine to fail safely when a future placeholder hasn't been
 * wired up. Replacing unknowns with empty strings would silently
 * delete content; raising an error would crash the broadcast. The
 * middle ground — leaving `{placeholder}` as-is in the output — is
 * visible in the SMS preview UI so the school sees exactly what
 * will be sent.
 *
 * Why we don't escape HTML
 * ------------------------
 * Africa's Talking messages are plain text. No HTML, no SQL, no
 * markdown. The escape surface would be misleading; if a future
 * channel accepts HTML the channel-specific formatter should own
 * its own escape.
 */

const TEMPLATE_REGEX = /\{([a-z_][a-z0-9_]*)\}/gi;

/**
 * Render a template string by interpolating every `{key}` token
 * with `String(vars[key])`.
 *
 * Unknown keys (missing from `vars`, or matching no token in the
 * template) are left as `{key}` so a template author can spot a
 * missing variable in the SMS preview UI.
 *
 * Variables whose value is `null` or `undefined` are also left
 * untouched for the same reason.
 */
export function renderTemplate(
  template: string,
  vars: Record<string, string | number | null | undefined>,
): string {
  return template.replace(TEMPLATE_REGEX, (match, key: string) => {
    const value = vars[key];
    if (value == null) return match;
    return String(value);
  });
}

/**
 * Convert a vars object so only primitive string / number values
 * survive. Strips functions, objects, arrays, and any value the
 * recipient would not be able to read. Use this before passing
 * user-supplied data into `renderTemplate`.
 */
export function sanitizeVars(
  vars: Record<string, unknown>,
): Record<string, string | number> {
  const out: Record<string, string | number> = {};
  for (const [k, v] of Object.entries(vars)) {
    if (v == null) continue;
    if (typeof v === "string" || typeof v === "number") {
      out[k] = v;
    }
  }
  return out;
}
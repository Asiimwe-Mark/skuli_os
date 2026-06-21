import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";

/**
 * Mint a receipt number through the database's
 * `generate_receipt_number(p_school_id)` advisory-locked function
 * (created in migration 0019).
 *
 * Audit §1.5 / §8.12: the codebase used to mint receipt numbers in
 * at least three places with two different schemes:
 *
 *   - DB `generate_receipt_number()` — sequential, advisory-locked
 *   - JS in `app/api/fees/payments/route.ts` — UUID suffix
 *   - JS in the AT MM webhook — random hex
 *
 * This helper is the single entry point every route should call. If
 * the RPC fails (e.g. the function has not yet been migrated in a
 * dev environment) we fall back to a defensive `<school>-<ts>-<rand>`
 * pattern that still cannot collide within a school because the
 * random suffix uses 6 bytes (48 bits) of crypto-random entropy.
 */
export async function generateReceiptNumber(
  supabase: SupabaseClient<Database>,
  schoolId: string,
): Promise<string> {
  try {
    const { data, error } = await supabase.rpc(
      "generate_receipt_number" as never,
      { p_school_id: schoolId } as never,
    );
    if (!error && typeof data === "string" && (data as string).length > 0) {
      return data;
    }
  } catch {
    // fall through to defensive fallback
  }

  // Defensive fallback. Used only when the DB function is unavailable
  // (test envs, fresh migration order). Cryptographically random 6
  // bytes give ~280 trillion possibilities per school per month.
  const now = new Date();
  const ym = `${now.getUTCFullYear()}${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
  const rand = Array.from(
    crypto.getRandomValues(new Uint8Array(6)),
    (b) => b.toString(16).padStart(2, "0"),
  ).join("").toUpperCase();
  return `SKULI-${schoolId.slice(0, 4).toUpperCase()}-${ym}-${rand}`;
}

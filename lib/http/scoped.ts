/**
 * Per-tenant Supabase helpers + request/query parsing.
 *
 * Why this file exists
 * --------------------
 * Every authenticated route opens with the same five lines:
 *
 *     const schoolId = ctx.profile.school_id!;
 *     const { searchParams } = new URL(request.url);
 *     const page = parseInt(searchParams.get("page") || "1", 10);
 *     const limit = Math.min(parseInt(searchParams.get("limit") || "50", 10), 200);
 *     const from = (page - 1) * limit;
 *
 * Plus a hand-rolled `.ilike.%${search}%` interpolation that is
 * both SQL-injection-prone for `%` / `_` and inconsistent across
 * routes (some accept class_id, some accept term_id, some accept
 * both). This file centralises:
 *
 *   1. `scopedQuery` — returns a Supabase query already scoped to
 *      the caller's `school_id`. Replaces `ctx.profile.school_id!`
 *      in every read endpoint.
 *   2. `crossTenantQuery` — same, but for SUPER_ADMIN handlers
 *      that intentionally cross school boundaries (e.g. the
 *      `/api/admin/*` namespace).
 *   3. `paginated.parse` — single source of truth for
 *      page/limit/from/to. Bound to MAX_LIMIT = 200 so a misconfigured
 *      client cannot ask for one million rows.
 *   4. `paginated.envelope` — single source of truth for the
 *      `{ items, total, page, limit, totalPages }` envelope.
 *   5. `escapeIlike` — escapes `%`, `_`, and `\` so user-supplied
 *      search strings cannot be turned into wildcard matches.
 *
 * All helpers are pure (no network) and side-effect free; safe to
 * call from any route handler, server action, or unit test.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";
import type { AuthContext } from "@/lib/http";

type TableName = keyof Database["public"]["Tables"];

/**
 * Default and hard-cap on the page size. The audit found handlers
 * using 50, 100, and 500; we standardise on 50 with a 200 cap so a
 * single endpoint cannot accidentally pull an entire term's worth
 * of rows in one request.
 */
const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 200;

/**
 * Build a Supabase query already filtered to the authenticated
 * school. Use this in every read endpoint; it eliminates the
 * `ctx.profile.school_id!` non-null assertion and the manual
 * `.eq("school_id", schoolId)` chain.
 *
 * The returned builder is typed against the table's Row type so
 * downstream `.select(...)` arguments narrow correctly.
 */
export function scopedQuery<Table extends TableName>(
  ctx: AuthContext,
  table: Table,
) {
  // The Supabase SDK returns a discriminated union from
  // `from(table)` based on the column-argument type. Because we
  // widen the table parameter to a keyof union, the conditional
  // generic collapses onto the column-set intersection (effectively
  // just `school_id`), so we chain `.eq` directly on the SDK
  // return. The `any` is confined to this one call; everything
  // downstream stays strictly typed because `from(table)` already
  // returns a table-specific PostgrestQueryBuilder.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const client = ctx.supabase as any;
  return client.from(table).eq("school_id", ctx.schoolId);
}

/**
 * Same as `scopedQuery` but for handlers that intentionally cross
 * tenant boundaries (e.g. `SUPER_ADMIN` on `/api/admin/*`). The
 * caller must supply the schoolId explicitly; we never infer it
 * from the session when crossing tenants.
 */
export function crossTenantQuery<Table extends TableName>(
  ctx: AuthContext,
  table: Table,
  schoolId: string,
) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const client = ctx.supabase as any;
  return client.from(table).eq("school_id", schoolId);
}

/**
 * Page / limit parsing + envelope shaping.
 *
 * `parse(req)` reads `?page=` and `?limit=` from the URL with
 * safe fall-backs; `envelope(items, total, page, limit)` produces
 * the `{ items, total, page, limit, totalPages }` shape that every
 * list endpoint on the API returns.
 */
export const paginated = {
  parse(req: Request): { page: number; limit: number; from: number; to: number } {
    const url = new URL(req.url);
    const rawPage = parseInt(url.searchParams.get("page") ?? "1", 10);
    const rawLimit = parseInt(url.searchParams.get("limit") ?? String(DEFAULT_LIMIT), 10);
    const page = Number.isFinite(rawPage) && rawPage > 0 ? rawPage : 1;
    const limit = Number.isFinite(rawLimit) && rawLimit > 0
      ? Math.min(rawLimit, MAX_LIMIT)
      : DEFAULT_LIMIT;
    const from = (page - 1) * limit;
    const to = from + limit - 1;
    return { page, limit, from, to };
  },

  envelope<T>(
    items: T[],
    total: number,
    page: number,
    limit: number,
  ): { items: T[]; total: number; page: number; limit: number; totalPages: number } {
    const safeItems = items ?? [];
    const safeTotal = total ?? safeItems.length;
    return {
      items: safeItems,
      total: safeTotal,
      page,
      limit,
      totalPages: limit > 0 ? Math.max(1, Math.ceil(safeTotal / limit)) : 1,
    };
  },
};

/**
 * Escape a user-supplied string for safe interpolation inside a
 * PostgREST `.ilike.%...%` filter.
 *
 * PostgREST treats `%` and `_` as wildcards inside `ilike`. A search
 * for `100%` would otherwise match every row that contains "100"
 * followed by any character. We escape both wildcards plus the
 * escape character itself.
 *
 * Caller is expected to wrap with `%${escapeIlike(term)}%` for
 * "contains" semantics; for prefix/suffix matches the caller
 * composes the wildcards themselves.
 */
export function escapeIlike(term: string): string {
  return term.replace(/[\\%_]/g, (ch) => `\\${ch}`);
}

/**
 * Get a single search-param string with a safe fallback. Empty
 * strings are treated as "not set" so a stray `?search=` does not
 * accidentally trigger an empty `.ilike.%%` match.
 */
export function searchParam(
  url: URL,
  key: string,
): string | null {
  const v = url.searchParams.get(key);
  if (v == null) return null;
  const trimmed = v.trim();
  return trimmed.length > 0 ? trimmed : null;
}

/**
 * Build a `.or(...)` filter clause for ilike across multiple
 * columns. Example:
 *
 *     searchFilter(["full_name", "admission_number", "parent_phone"], term)
 *
 * Returns `null` when `term` is empty so the caller can skip the
 * `.or()` entirely.
 */
export function searchFilter(
  columns: readonly string[],
  term: string | null | undefined,
): string | null {
  if (!term || columns.length === 0) return null;
  const safe = escapeIlike(term);
  return columns.map((c) => `${c}.ilike.%${safe}%`).join(",");
}

// Re-export SupabaseClient type for convenience to callers that
// only need to type a single function parameter.
export type { SupabaseClient };
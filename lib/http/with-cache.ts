/**
 * `withSchoolReadCache` — the route-level wrapper around `withSchoolCache`.
 *
 * Why this wrapper exists
 * -----------------------
 * `withSchoolCache` returns `{ value, hit }`. The route still has to
 * wrap the value in the standard envelope (`respond.cacheable(...)`)
 * AND stamp the `x-skuli-cache` header so observability can chart hit
 * rate per route. Doing those two things in two places (the route +
 * a separate `setCacheHeader` call) is what produced the original
 * audit finding P3 — easy to forget the header, easy to forget the
 * `applyTo` on the response, easy to drift.
 *
 * This wrapper threads both through a single return shape:
 *
 *     const { value, applyTo } = await withSchoolReadCache(
 *       { schoolId, inputShape: `students:${page}:${limit}` },
 *       async () => loadStudents(...),
 *     );
 *     return applyTo(respond.cacheable(value));
 *
 * Or, equivalently, `respond.cacheable` already stamps the cacheable
 * Cache-Control header. To attach the observability header in the
 * simplest case the route can call:
 *
 *     const res = respond.cacheable(value);
 *     res.headers.set("x-skuli-cache", hit);
 *     return res;
 *
 * `applyTo(response)` is the documented way to do that without
 * remembering the header name.
 */

import {
  setCacheHeader,
  withSchoolCache,
} from "@/lib/api-cache";

export interface ReadCacheKey {
  schoolId: string;
  inputShape: string;
  revalidateSeconds?: number;
}

export interface ReadCacheResult<T> {
  value: T;
  hit: "hit" | "miss" | "stale-revalidate";
  /**
   * Attach `x-skuli-cache: <hit>` to the response in one call.
   * Returns the same response for chaining.
   */
  applyTo: (response: Response) => Response;
}

/**
 * Wrap a read endpoint's body in the per-school cache. The wrapped
 * function must be PURE — same input keys produce same output.
 *
 * Behaviour is identical to `withSchoolCache` from `@/lib/api-cache`,
 * plus an `applyTo(response)` helper that stamps the observability
 * header.
 */
export async function withSchoolReadCache<T>(
  key: ReadCacheKey,
  fn: () => Promise<T>,
): Promise<ReadCacheResult<T>> {
  const { value, hit } = await withSchoolCache(key, fn);
  return {
    value,
    hit,
    applyTo: (response: Response) => setCacheHeader(response, hit),
  };
}

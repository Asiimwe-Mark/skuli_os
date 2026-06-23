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
   *
   * The `response` argument is typed loosely as `Response | T` so
   * callers can pass either a pre-built `Response` (the wrapper
   * passes it through unchanged) or a plain serialisable value
   * (the wrapper falls back to `respond.cacheable(value)` so the
   * Cache-Control header is still attached).
   */
  applyTo: (response: Response | T) => Response;
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
    applyTo: (response: Response | T) => {
      // If the caller hands us a plain value (the common case for
      // list endpoints), wrap it in the cacheable envelope and
      // stamp the header in one go.
      if (!(response instanceof Response)) {
        return setCacheHeader(
          new Response(JSON.stringify({ success: true, data: response }), {
            status: 200,
            headers: { "Content-Type": "application/json", "Cache-Control": "private, max-age=30, stale-while-revalidate=60" },
          }),
          hit,
        );
      }
      return setCacheHeader(response, hit);
    },
  };
}

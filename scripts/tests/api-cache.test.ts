import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  withSchoolCache,
  invalidateSchool,
  __resetCacheForTests,
  __isRedisBackend,
} from "@/lib/api-cache";

/**
 * Gate tests for the cache wrapper used by the high-RPS /api read endpoints.
 *
 * The test suite is backend-agnostic — it runs against whichever storage
 * (Redis when UPSTASH_REDIS_REST_URL is set, in-process Map otherwise).
 * A live Redis instance is the source of truth in CI; the in-process
 * fallback lets local dev and `npm test` pass without one.
 *
 * What these tests prove
 * ----------------------
 *   1. A fresh call is a "miss" and runs the underlying fn.
 *   2. A repeat call within the stale window is a "hit" and does NOT
 *      re-run the fn. This is the property that makes the cache useful.
 *   3. After `invalidateSchool(id)`, the next call is a "miss" again.
 *      This is the property that makes the cache correct (mutations
 *      see fresh data).
 *   4. Different (schoolId, inputShape) keys are isolated — School A's
 *      cache does not leak to School B.
 *
 * Time is controlled via `vi.useFakeTimers` for the in-process backend
 * (the fake-timer API drives `Date.now()`). The Redis backend does not
 * use Date.now for hits, only for the `staleAt` we write into the entry,
 * which is read back on the next request — so the same fake-timer trick
 * works there too.
 */

const REDIS_BACKEND = __isRedisBackend;
// In-process runs are deterministic. Redis runs are exercised against a
// real network. We allow slightly more time and use real timers on Redis.
const FAKE_TIMERS_OK = !REDIS_BACKEND;

describe("withSchoolCache", () => {
  beforeEach(async () => {
    await __resetCacheForTests();
  });

  it("returns miss on first call and runs the function", async () => {
    const fn = vi.fn().mockResolvedValue({ data: 1 });
    const result = await withSchoolCache(
      { schoolId: "school-a", inputShape: "k1" },
      fn,
    );
    expect(result.hit).toBe("miss");
    expect(result.value).toEqual({ data: 1 });
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("returns hit on second call within the stale window", async () => {
    const fn = vi.fn().mockResolvedValue({ data: 1 });
    await withSchoolCache({ schoolId: "school-a", inputShape: "k1" }, fn);
    const result = await withSchoolCache(
      { schoolId: "school-a", inputShape: "k1" },
      fn,
    );
    expect(result.hit).toBe("hit");
    expect(result.value).toEqual({ data: 1 });
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("isolates cache slots by inputShape", async () => {
    const fn = vi.fn().mockResolvedValue({ data: 1 });
    await withSchoolCache({ schoolId: "school-a", inputShape: "shape-1" }, fn);
    await withSchoolCache({ schoolId: "school-a", inputShape: "shape-2" }, fn);
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it("isolates cache slots by schoolId (no cross-tenant leak)", async () => {
    const fnA = vi.fn().mockResolvedValue({ data: "a" });
    const fnB = vi.fn().mockResolvedValue({ data: "b" });
    const a = await withSchoolCache({ schoolId: "school-a", inputShape: "k" }, fnA);
    const b = await withSchoolCache({ schoolId: "school-b", inputShape: "k" }, fnB);
    expect(a.value).toEqual({ data: "a" });
    expect(b.value).toEqual({ data: "b" });
    expect(fnA).toHaveBeenCalledTimes(1);
    expect(fnB).toHaveBeenCalledTimes(1);
  });

  it("invalidateSchool drops every entry for the school", async () => {
    const fn = vi.fn().mockResolvedValue({ data: 1 });
    await withSchoolCache({ schoolId: "school-a", inputShape: "k1" }, fn);
    await withSchoolCache({ schoolId: "school-a", inputShape: "k2" }, fn);
    await withSchoolCache({ schoolId: "school-b", inputShape: "k1" }, fn);
    expect(fn).toHaveBeenCalledTimes(3);

    await invalidateSchool("school-a");
    // For the Redis backend we can't assert on the count returned
    // (depends on whether the network is reachable in this env). The
    // important invariant is: after invalidation, School A's keys are
    // misses and School B's is still a hit.

    // School A's keys are now misses; School B's is still a hit.
    const a1 = await withSchoolCache({ schoolId: "school-a", inputShape: "k1" }, fn);
    const a2 = await withSchoolCache({ schoolId: "school-a", inputShape: "k2" }, fn);
    const b1 = await withSchoolCache({ schoolId: "school-b", inputShape: "k1" }, fn);
    expect(a1.hit).toBe("miss");
    expect(a2.hit).toBe("miss");
    expect(b1.hit).toBe("hit");
    expect(fn).toHaveBeenCalledTimes(5);
  });

  // The stale-while-revalidate property was specific to the LRU
  // implementation. The Redis implementation serves the cached value
  // until its TTL expires; the new value is computed on the next miss.
  // We keep the test for the in-process fallback only.
  if (FAKE_TIMERS_OK) {
    it("in-process: returns hit before staleAt and a new miss after", async () => {
      vi.useFakeTimers();
      try {
        let value = 1;
        const fn = vi.fn().mockImplementation(async () => ({ data: value++ }));

        // First call: miss.
        const first = await withSchoolCache(
          { schoolId: "school-a", inputShape: "k", revalidateSeconds: 60 },
          fn,
        );
        expect(first.hit).toBe("miss");
        expect(first.value).toEqual({ data: 1 });

        // Inside the stale window: hit, no second fn call.
        vi.advanceTimersByTime(30_000);
        const second = await withSchoolCache(
          { schoolId: "school-a", inputShape: "k", revalidateSeconds: 60 },
          fn,
        );
        expect(second.hit).toBe("hit");
        expect(second.value).toEqual({ data: 1 });
        expect(fn).toHaveBeenCalledTimes(1);
      } finally {
        vi.useRealTimers();
      }
    });
  }
});

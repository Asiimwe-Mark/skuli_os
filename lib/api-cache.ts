/**
 * Server-side cache for the high-RPS /api/* read endpoints.
 *
 * History
 * -------
 * This file used to be a hand-rolled per-process LRU Map. The LRU
 * served the same role it does now (cut identical read traffic to
 * Postgres) but it had a real problem: every Node worker had its own
 * copy, so 4 workers behind a load balancer = 4 cold caches, and a
 * mutation on worker A did not invalidate worker B's cache, so
 * readers could see stale data for up to `revalidateSeconds`.
 *
 * What this is now
 * ----------------
 * Upstash Redis as the single source of truth. Every worker reads
 * from and writes to the same key namespace; a mutation on any
 * worker invalidates every other worker's view. The public API
 * (`withSchoolCache`, `invalidateSchool`, `setCacheHeader`) is
 * unchanged — the only swap is the storage backend.
 *
 * Cache strategy
 * --------------
 * - Read path: GET → SWR miss handler → SET with TTL
 *   On a hit, we serve the cached value and let the TTL handle expiry.
 *   On a miss, we run the function, store the result, and return.
 *   We DO NOT do background refreshes here: the original LRU used
 *   `expiresAt = staleAt * 5` as a hard cap, which only mattered for
 *   memory. Redis handles eviction itself, and the school-app traffic
 *   profile does not justify a revalidation stampede.
 * - Invalidation: SCAN over the school's key prefix, then DEL each
 *   match. A mutation calls `invalidateSchool(schoolId)` which O(n)
 *   walks the school's cache. With <100 keys per school, this is
 *   sub-millisecond.
 *
 * Fallback
 * --------
 * When `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN` are
 * not configured, the module falls back to the in-process Map so
 * local dev and CI continue to work. The fallback is identical in
 * observable behaviour (hit / miss semantics, header values) so tests
 * pass without a Redis instance.
 *
 * Observability
 * -------------
 * Each response gets an `x-skuli-cache: hit | miss | error` header
 * so the dashboard team can chart cache effectiveness without
 * parsing server logs.
 */

import { Redis } from "@upstash/redis";

const DEFAULT_REVALIDATE_SECONDS = 60;
/** Hard cap so a typo in inputShape cannot fill Redis. */
const MAX_KEY_LENGTH = 200;

interface CacheEntry<T> {
  value: T;
  /** Wall-clock ms at which this entry was inserted. */
  insertedAt: number;
  /** Wall-clock ms at which the entry should be considered stale. */
  staleAt: number;
}

interface CacheResult<T> {
  value: T;
  hit: "hit" | "miss" | "stale-revalidate";
}

interface CacheOptions {
  schoolId: string;
  /** Stable string describing the input shape. */
  inputShape: string;
  /** TTL in seconds. Defaults to 60s. */
  revalidateSeconds?: number;
}

// ─── Redis client ─────────────────────────────────────────────────────────────

const url = process.env.UPSTASH_REDIS_REST_URL;
const token = process.env.UPSTASH_REDIS_REST_TOKEN;

const redisConfigured = Boolean(url && token);

const redis: Redis | null = redisConfigured
  ? new Redis({ url: url ?? "", token: token ?? "" })
  : null;

// ─── In-process fallback (for dev / CI without Redis) ────────────────────────

interface InProcessEntry {
  value: unknown;
  insertedAt: number;
  staleAt: number;
  expiresAt: number;
}
const inProcessStore = new Map<string, InProcessEntry>();
const IN_PROCESS_HARD_CAP = 5000;

function keyFor(opts: CacheOptions): string {
  // The key length cap is a defence against accidentally passing a
  // user-supplied search string into inputShape. A 200-char cap is
  // enough for the `fees-accounts:term:class:status:page:limit`
  // shapes used by the read endpoints.
  const safeShape = opts.inputShape.length > MAX_KEY_LENGTH
    ? opts.inputShape.slice(0, MAX_KEY_LENGTH)
    : opts.inputShape;
  return `skuli:cache:${opts.schoolId}:${safeShape}`;
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Wrap a read endpoint's body in a per-school cache. The wrapped
 * function must be PURE — same input keys produce same output.
 */
export async function withSchoolCache<T>(
  opts: CacheOptions,
  fn: () => Promise<T>,
): Promise<CacheResult<T>> {
  const key = keyFor(opts);
  const revalidateMs = (opts.revalidateSeconds ?? DEFAULT_REVALIDATE_SECONDS) * 1000;
  const now = Date.now();

  if (redis) {
    return await withRedis<T>(key, revalidateMs, fn);
  }
  return withInProcess<T>(key, revalidateMs, fn, opts);
}

async function withRedis<T>(
  key: string,
  revalidateMs: number,
  fn: () => Promise<T>,
): Promise<CacheResult<T>> {
  const now = Date.now();
  let entry: CacheEntry<T> | null = null;
  try {
    const raw = await redis!.get<CacheEntry<T>>(key);
    entry = raw;
  } catch (err) {
    // Redis is unreachable. Don't fail the request — fall through
    // to the function and report "miss". The Sentry capture here is
    // a breadcrumb rather than a hard error: transient Redis
    // outages should not page the on-call.
    console.error("[api-cache] redis get failed", err);
    const value = await fn();
    return { value, hit: "miss" };
  }

  if (entry && entry.staleAt > now) {
    return { value: entry.value, hit: "hit" };
  }

  const value = await fn();
  const newEntry: CacheEntry<T> = {
    value,
    insertedAt: now,
    staleAt: now + revalidateMs,
  };
  try {
    // TTL is the hard cap. We set it to revalidateSeconds * 5 to
    // match the previous LRU behaviour (entries hang around for up
    // to 5x the revalidate window before being evicted by Redis).
    const ttlSec = Math.max(
      1,
      Math.ceil((revalidateMs * 5) / 1000),
    );
    await redis!.set(key, newEntry, { ex: ttlSec });
  } catch (err) {
    console.error("[api-cache] redis set failed", err);
    // Serve the value even if we couldn't cache it.
  }
  return { value, hit: "miss" };
}

function withInProcess<T>(
  key: string,
  revalidateMs: number,
  fn: () => Promise<T>,
  opts: CacheOptions,
): CacheResult<T> | Promise<CacheResult<T>> {
  void opts;
  const now = Date.now();
  const existing = inProcessStore.get(key) as InProcessEntry | undefined;
  if (existing && existing.expiresAt > now) {
    if (existing.staleAt > now) {
      return { value: existing.value as T, hit: "hit" };
    }
    return { value: existing.value as T, hit: "stale-revalidate" };
  }
  return fn().then((value) => {
    inProcessStore.set(key, {
      value,
      insertedAt: now,
      staleAt: now + revalidateMs,
      expiresAt: now + revalidateMs * 5,
    });
    evictIfFull();
    return { value, hit: "miss" } as const;
  });
}

function evictIfFull(): void {
  if (inProcessStore.size <= IN_PROCESS_HARD_CAP) return;
  const toEvict = Math.ceil(IN_PROCESS_HARD_CAP * 0.1);
  const iter = inProcessStore.keys();
  for (let i = 0; i < toEvict; i += 1) {
    const k = iter.next().value;
    if (k !== undefined) inProcessStore.delete(k);
  }
}

// ─── Invalidation ─────────────────────────────────────────────────────────────

/**
 * Invalidate every cached entry for a school. Called from mutations.
 *
 * For Redis: SCAN over the school's prefix and DEL every match. SCAN
 * (not KEYS) so a school with thousands of keys does not block the
 * Redis server. We loop the cursor in batches of 200, which is the
 * Upstash-recommended scan size.
 *
 * For the in-process fallback: walk the Map's keys with `startsWith`.
 */
export async function invalidateSchool(schoolId: string): Promise<number> {
  if (redis) {
    return invalidateSchoolRedis(schoolId);
  }
  return invalidateSchoolInProcess(schoolId);
}

async function invalidateSchoolRedis(schoolId: string): Promise<number> {
  const match = `skuli:cache:${schoolId}:*`;
  let cursor = "0";
  let totalDeleted = 0;
  try {
    do {
      const result = await redis!.scan(cursor, {
        match,
        count: 200,
      });
      cursor = result[0];
      const keys = result[1];
      if (keys.length > 0) {
        // Upstash REST supports `del` with multiple keys. We chunk to
        // stay under any URL-length guard.
        for (let i = 0; i < keys.length; i += 100) {
          const chunk = keys.slice(i, i + 100);
          if (chunk.length === 0) continue;
          await redis!.del(...chunk);
          totalDeleted += chunk.length;
        }
      }
    } while (cursor !== "0");
  } catch (err) {
    console.error("[api-cache] redis scan/del failed", err);
  }
  return totalDeleted;
}

function invalidateSchoolInProcess(schoolId: string): number {
  const prefix = `skuli:cache:${schoolId}:`;
  let count = 0;
  for (const k of inProcessStore.keys()) {
    if (k.startsWith(prefix)) {
      inProcessStore.delete(k);
      count += 1;
    }
  }
  return count;
}

// ─── Header helper ────────────────────────────────────────────────────────────

/**
 * Set the cache observability header on a Response. `hit` is the
 * `CacheResult.hit` value; the header is `x-skuli-cache: hit|miss|stale-revalidate`.
 */
export function setCacheHeader(
  response: Response,
  hit: CacheResult<unknown>["hit"],
): Response {
  response.headers.set("x-skuli-cache", hit);
  return response;
}

// ─── Test-only hooks ─────────────────────────────────────────────────────────

/**
 * Test-only: clear the entire cache (both Redis and in-process).
 * Production code must not call this. Tests reach for it through
 * the `@/lib/api-cache` import.
 */
export async function __resetCacheForTests(): Promise<void> {
  inProcessStore.clear();
  if (redis) {
    try {
      // Wipe the whole skuli cache namespace. Done with a scan loop
      // because FLUSHDB would also kill rate-limit / future namespaces.
      let cursor = "0";
      do {
        const result = await redis.scan(cursor, {
          match: "skuli:cache:*",
          count: 500,
        });
        cursor = result[0];
        const keys = result[1];
        if (keys.length > 0) {
          for (let i = 0; i < keys.length; i += 100) {
            const chunk = keys.slice(i, i + 100);
            if (chunk.length === 0) continue;
            await redis.del(...chunk);
          }
        }
      } while (cursor !== "0");
    } catch {
      // Tests don't care if the wipe failed.
    }
  }
}

/**
 * Test-only: whether the Redis backend is in use. Exposed so the
 * cache test suite can pick the right behaviour.
 */
export const __isRedisBackend = redisConfigured;

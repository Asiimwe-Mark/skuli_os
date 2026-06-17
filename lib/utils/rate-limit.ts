/**
 * Rate limiter with two backends:
 *
 *   1. Distributed (Upstash Redis) via `@upstash/ratelimit`. Active
 *      when `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN`
 *      are set. Used in production for any route that needs to be
 *      rate-limited across multiple Node workers.
 *
 *   2. In-process Map fallback. Used in local dev, CI, and when Redis
 *      is unreachable. Resets on server restart, so it's only
 *      effective for a single instance.
 *
 * The two paths are kept in the same file because the caller contract
 * is identical (`checkRateLimitAsync(identifier, limit, windowMs)`).
 * Callers don't need to know which backend is active.
 *
 * Choosing the algorithm
 * ----------------------
 * For the rate limiters below we use `slidingWindow(limit, windowMs)`
 * from `@upstash/ratelimit`. A sliding window is the right primitive
 * for "no more than N requests in the last W seconds" — it is more
 * accurate than a fixed-window counter (no boundary spikes) and
 * cheaper than a true token bucket. Upstash implements it as
 * two ZSETs (one for the window, one for the request timestamps),
 * so memory is O(limit) per identifier and the lookup is O(log N).
 */

import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";

interface RateLimitWindow {
  timestamps: number[];
}

const inProcessStore = new Map<string, RateLimitWindow>();

// Prune entries older than 1 hour every 5 minutes to prevent memory leaks
const PRUNE_INTERVAL_MS = 5 * 60 * 1000;
const ENTRY_MAX_AGE_MS = 60 * 60 * 1000;
let lastPrune = Date.now();

function maybePrune(): void {
  const now = Date.now();
  if (now - lastPrune < PRUNE_INTERVAL_MS) return;
  lastPrune = now;
  for (const [key, window] of inProcessStore.entries()) {
    const cutoff = now - ENTRY_MAX_AGE_MS;
    window.timestamps = window.timestamps.filter((t) => t > cutoff);
    if (window.timestamps.length === 0) {
      inProcessStore.delete(key);
    }
  }
}

export interface RateLimitResult {
  success: boolean;
  remaining: number;
  /** Unix ms at which the oldest request falls out of the window. */
  resetAt: number;
  /** Total limit configured for this rule. Useful for `X-RateLimit-Limit` headers. */
  limit: number;
}

// ─── Distributed (Upstash) backend ───────────────────────────────────────────

const url = process.env.UPSTASH_REDIS_REST_URL;
const token = process.env.UPSTASH_REDIS_REST_TOKEN;
const distributedConfigured = Boolean(url && token);

const sharedRedis: Redis | null = distributedConfigured
  ? new Redis({ url: url ?? "", token: token ?? "" })
  : null;

/**
 * Cache of Ratelimit instances keyed by `${limit}/${windowMs}`. Each
 * call site usually uses the same `limit`/`windowMs` pair, so we
 * build the limiter once and reuse it. Building a new Ratelimit on
 * every request would re-validate the Redis client on every call.
 */
const ratelimitCache = new Map<string, Ratelimit>();

function getRatelimit(limit: number, windowMs: number): Ratelimit | null {
  if (!sharedRedis) return null;
  const key = `${limit}/${windowMs}`;
  const cached = ratelimitCache.get(key);
  if (cached) return cached;
  const rl = new Ratelimit({
    redis: sharedRedis,
    // Sliding window. `prefix` keeps our keys from colliding with the
    // api-cache namespace on the same Upstash instance.
    limiter: Ratelimit.slidingWindow(limit, `${windowMs} ms`),
    prefix: "skuli:rl",
    analytics: false,
    ephemeralCache: new Map(),
  });
  ratelimitCache.set(key, rl);
  return rl;
}

async function upstashLimit(
  identifier: string,
  limit: number,
  windowMs: number,
): Promise<RateLimitResult | null> {
  const rl = getRatelimit(limit, windowMs);
  if (!rl) return null;
  try {
    const res = await rl.limit(identifier);
    return {
      success: res.success,
      remaining: res.remaining,
      resetAt: res.reset,
      limit,
    };
  } catch (err) {
    // Network / timeout / Redis outage. We never fail-open hard —
    // the caller gets null and falls back to the in-process limiter.
    // We do NOT console.error here: this codepath is hot, and a
    // temporary Redis blip would drown the logs. Sentry breadcrumbs
    // are added by the error-report helper if the caller wires it in.
    void err;
    return null;
  }
}

// ─── In-process fallback ─────────────────────────────────────────────────────

/**
 * Check and record a request for the given identifier.
 *
 * @param identifier - IP address or any unique key
 * @param limit      - Maximum requests allowed in the window
 * @param windowMs   - Rolling window duration in milliseconds
 */
export function checkRateLimit(
  identifier: string,
  limit: number,
  windowMs: number,
): RateLimitResult {
  maybePrune();

  const now = Date.now();
  const cutoff = now - windowMs;

  if (!inProcessStore.has(identifier)) {
    inProcessStore.set(identifier, { timestamps: [] });
  }

  const entry = inProcessStore.get(identifier);
  if (!entry) {
    // Defensive: should be unreachable because we just set it.
    return { success: true, remaining: limit, resetAt: now + windowMs, limit };
  }

  // Remove timestamps outside the current window
  entry.timestamps = entry.timestamps.filter((t) => t > cutoff);

  const count = entry.timestamps.length;
  const remaining = Math.max(0, limit - count);
  const oldest = entry.timestamps[0];
  const resetAt = oldest !== undefined ? oldest + windowMs : now + windowMs;

  if (count >= limit) {
    return { success: false, remaining: 0, resetAt, limit };
  }

  // Record this request
  entry.timestamps.push(now);

  return { success: true, remaining: remaining - 1, resetAt, limit };
}

// ─── Public async entry point ────────────────────────────────────────────────

/**
 * Distributed-aware rate limit check.
 *
 * Uses Upstash Redis when configured; otherwise falls back to the
 * per-instance in-memory limiter. Same semantics as `checkRateLimit`.
 */
export async function checkRateLimitAsync(
  identifier: string,
  limit: number,
  windowMs: number,
): Promise<RateLimitResult> {
  const distributed = await upstashLimit(identifier, limit, windowMs);
  if (distributed) return distributed;
  return checkRateLimit(identifier, limit, windowMs);
}

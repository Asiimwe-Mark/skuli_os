/**
 * Query client config and a localStorage-backed persister for React Query.
 *
 * Cache strategy (three-layer stack):
 *
 *   Layer 1 — Browser HTTP cache (Cache-Control from api-helpers.ts)
 *     max-age=30s, stale-while-revalidate=60s
 *     Cost: zero JS, zero network for the first 30 s after a page load.
 *
 *   Layer 2 — React Query in-memory + localStorage persister (this file)
 *     staleTime: 2 min  → second navigation within 2 min is instant.
 *     gcTime: 24 h      → cache survives the whole working day.
 *     persistence TTL: 5 min → cross-tab and hard-reload reuse.
 *
 *   Layer 3 — Server-side per-process LRU (lib/api-cache.ts)
 *     revalidateSeconds: 60 s → even a cold React Query cache hits the
 *     server LRU instead of Postgres on the second request within 60 s.
 *
 * The three layers are deliberately aligned:
 *   HTTP cache (30 s) < Server LRU (60 s) < React Query stale (120 s)
 * so the user always gets the freshest data the caching stack can offer
 * without a Postgres hit on every interaction.
 */
import {
  QueryClient,
  type Query,
} from "@tanstack/react-query";

const PERSIST_TTL_MS = 5 * 60 * 1000; // 5 minutes
const STORAGE_KEY = "skuli:react-query:v1";

function isPersistableQuery(q: Query): boolean {
  if (q.state.status === "error") return false;
  if (q.state.fetchStatus === "fetching" && !q.state.dataUpdatedAt) return false;
  return true;
}

interface Persister {
  persistClient: (client: unknown) => Promise<void>;
  restoreClient: () => Promise<unknown>;
  removeClient: () => Promise<void>;
}

interface PersistClient {
  clientState: { queries: Query[]; mutations: unknown[] };
  buster?: string;
}

export function createPersister(): Persister {
  return {
    persistClient: async (client: unknown) => {
      try {
        const c = client as PersistClient;
        const now = Date.now();
        const persistable = c.clientState.queries.filter(isPersistableQuery);
        const snapshot = {
          v: 1,
          savedAt: now,
          queries: persistable.map((q) => ({
            queryHash: q.queryHash,
            queryKey: q.queryKey,
            state: q.state,
          })),
          mutations: c.clientState.mutations,
        };
        const serialized = JSON.stringify(snapshot);
        // Cap at 3 MB — iOS Safari private mode silently fails at 5 MB.
        if (serialized.length > 3 * 1024 * 1024) {
          console.warn(
            `[query-persist] snapshot ${(serialized.length / 1024 / 1024).toFixed(2)}MB exceeds 3MB cap; skipping persist`,
          );
          return;
        }
        localStorage.setItem(STORAGE_KEY, serialized);
      } catch (err) {
        console.warn("[query-persist] persist failed", err);
      }
    },
    restoreClient: async () => {
      try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (!raw) return undefined;
        const snapshot = JSON.parse(raw) as {
          v: number;
          savedAt: number;
          queries: Array<{
            queryHash: string;
            queryKey: unknown;
            state: Query["state"];
          }>;
        };
        if (snapshot.v !== 1) return undefined;
        if (Date.now() - snapshot.savedAt > PERSIST_TTL_MS) {
          localStorage.removeItem(STORAGE_KEY);
          return undefined;
        }
        return {
          buster: String(snapshot.savedAt),
          clientState: {
            queries: snapshot.queries.map((q) => ({
              queryHash: q.queryHash,
              queryKey: q.queryKey,
              state: q.state,
            })),
            mutations: [],
          },
        };
      } catch (err) {
        console.warn("[query-persist] restore failed", err);
        return undefined;
      }
    },
    removeClient: async () => {
      try {
        localStorage.removeItem(STORAGE_KEY);
      } catch {
        // ignore
      }
    },
  };
}

/**
 * Build a QueryClient tuned for a school-management app.
 *
 * staleTime 2 min:
 *   Lists of students / classes / expenses don't change mid-session.
 *   A 2-min window means the second navigation is always instant AND
 *   picks up changes made by a sibling tab within the window-focus
 *   refetch cycle (refetchOnWindowFocus: true).
 *
 * gcTime 24 h:
 *   A long tail so queries stay warm for the duration of a working day.
 *   The persister's 5-min TTL is shorter, so the in-memory cache is
 *   always the faster path on a live session.
 *
 * refetchOnWindowFocus true (default):
 *   A bursar switching tabs after recording a payment will see updated
 *   balances without a manual refresh.
 *
 * refetchOnReconnect true:
 *   Ugandan schools often have spotty connectivity. When the device
 *   reconnects, queries silently revalidate.
 *
 * retry 1 (4xx never retried):
 *   Transient 5xx / 429s get one retry with exponential backoff.
 *   Auth / permission errors (4xx) are not retried — they won't fix
 *   themselves and retrying just delays the error state.
 */
export function createQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 2 * 60 * 1000,        // 2 minutes
        gcTime: 24 * 60 * 60 * 1000,     // 24 hours
        refetchOnWindowFocus: true,
        refetchOnReconnect: true,
        retry: (failureCount, error) => {
          if (failureCount >= 2) return false;
          const status =
            (error as { status?: number } | null)?.status ?? 0;
          if (status >= 400 && status < 500) return false;
          return true;
        },
        retryDelay: (attempt) => Math.min(1000 * 2 ** attempt, 8000),
      },
      mutations: {
        retry: 0,
      },
    },
  });
}

/** Clear persisted cache on sign-out so the next user doesn't see stale data. */
export function clearPersistedCache() {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // ignore
  }
}

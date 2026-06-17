import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  createPersister,
  clearPersistedCache,
  createQueryClient,
} from "@/lib/query-persist";

/**
 * Regression tests for the React Query persistence layer.
 *
 * The cache must:
 *   - Round-trip query data through localStorage
 *   - Reject expired snapshots
 *   - Skip failed queries (don't persist them)
 *   - Tolerate a quota-exceeded / disabled-storage environment
 */

const STORAGE_KEY = "skuli:react-query:v1";

beforeEach(() => {
  localStorage.clear();
  vi.spyOn(console, "warn").mockImplementation(() => undefined);
});

afterEach(() => {
  vi.restoreAllMocks();
});

function makeQuerySnapshot(opts: {
  queryHash: string;
  queryKey: unknown[];
  status: "pending" | "success" | "error";
  data?: unknown;
  dataUpdatedAt?: number;
  fetchStatus?: "fetching" | "idle" | "paused";
}) {
  return {
    queryHash: opts.queryHash,
    queryKey: opts.queryKey,
    state: {
      status: opts.status,
      data: opts.data,
      dataUpdatedAt: opts.dataUpdatedAt ?? Date.now(),
      fetchStatus: opts.fetchStatus ?? "idle",
    },
  } as never;
}

describe("createPersister", () => {
  it("round-trips a successful query", async () => {
    const persister = createPersister();
    const client = createQueryClient();
    client.setQueryData(["staff", "s1"], [{ id: "u1", name: "Asiimwe" }]);
    await persister.persistClient({
      clientState: { queries: client.getQueryCache().getAll(), mutations: [] },
    });
    const restored = await persister.restoreClient();
    expect(restored).toBeDefined();
    const state = (restored as { clientState: { queries: unknown[] } })
      .clientState;
    expect(state.queries).toHaveLength(1);
  });

  it("returns undefined when no snapshot is stored", async () => {
    const persister = createPersister();
    expect(await persister.restoreClient()).toBeUndefined();
  });

  it("returns undefined and clears the storage when the snapshot is older than the TTL", async () => {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        v: 1,
        savedAt: Date.now() - 10 * 60 * 1000, // 10 min ago, > 5 min TTL
        queries: [makeQuerySnapshot({ queryHash: "h", queryKey: ["x"], status: "success" })],
      }),
    );
    const persister = createPersister();
    expect(await persister.restoreClient()).toBeUndefined();
    expect(localStorage.getItem(STORAGE_KEY)).toBeNull();
  });

  it("skips failed queries when persisting", async () => {
    const persister = createPersister();
    await persister.persistClient({
      clientState: {
        queries: [
          makeQuerySnapshot({
            queryHash: "good",
            queryKey: ["ok"],
            status: "success",
            data: [1, 2, 3],
          }),
          makeQuerySnapshot({
            queryHash: "bad",
            queryKey: ["err"],
            status: "error",
          }),
        ],
        mutations: [],
      },
    });
    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "{}");
    expect(stored.queries).toHaveLength(1);
    expect(stored.queries[0].queryHash).toBe("good");
  });

  it("removeClient clears localStorage", async () => {
    localStorage.setItem(STORAGE_KEY, "anything");
    const persister = createPersister();
    await persister.removeClient();
    expect(localStorage.getItem(STORAGE_KEY)).toBeNull();
  });

  it("clearPersistedCache clears localStorage", () => {
    localStorage.setItem(STORAGE_KEY, "anything");
    clearPersistedCache();
    expect(localStorage.getItem(STORAGE_KEY)).toBeNull();
  });

  it("createQueryClient returns a fresh client each call", () => {
    const a = createQueryClient();
    const b = createQueryClient();
    expect(a).not.toBe(b);
    // The defaults should be applied to both.
    const defaults = a.getDefaultOptions();
    expect(defaults.queries?.staleTime).toBe(2 * 60 * 1000);
    expect(defaults.queries?.gcTime).toBe(24 * 60 * 60 * 1000);
  });

  it("degrades silently when localStorage write throws (e.g. quota)", async () => {
    const setItem = vi
      .spyOn(Storage.prototype, "setItem")
      .mockImplementation(() => {
        throw new Error("QuotaExceededError");
      });
    const persister = createPersister();
    await expect(
      persister.persistClient({
        clientState: { queries: [], mutations: [] },
      }),
    ).resolves.toBeUndefined();
    setItem.mockRestore();
  });
});

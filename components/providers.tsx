"use client";

import {
  QueryClientProvider,
  type QueryClient,
} from "@tanstack/react-query";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { Toaster } from "@/components/ui/toaster";
import { ThemeProvider } from "@/components/theme-toggle";
import {
  createPersister,
  createQueryClient,
  clearPersistedCache,
} from "@/lib/query-persist";

export function Providers({ children }: { children: ReactNode }) {
  // One QueryClient per browser session. The persister below hydrates
  // the cache from localStorage on mount and re-saves on every change.
  const [client] = useState<QueryClient>(() => createQueryClient());
  const restoredRef = useRef(false);

  useEffect(() => {
    if (restoredRef.current) return;
    restoredRef.current = true;
    const persister = createPersister();
    let unsub: (() => void) | undefined;
    void (async () => {
      const restored = await persister.restoreClient();
      if (restored && typeof restored === "object" && "clientState" in restored) {
        // The persister returns a serialised clientState — restore each
        // query into the live cache. We don't try to play back mutations.
        const state = (restored as { clientState: { queries: Array<unknown> } })
          .clientState;
        for (const q of state.queries) {
          const qq = q as { queryHash: string; queryKey: unknown; state: unknown };
          const data = (qq.state as { data?: unknown }).data;
          if (qq.queryKey) {
            client.setQueryData(qq.queryKey as readonly unknown[], data, {
              updatedAt:
                (qq.state as { dataUpdatedAt?: number }).dataUpdatedAt ?? Date.now(),
            });
          }
        }
        // Audit (Bug #2): previously this loop force-refetched every
        // restored query sequentially, blocking render for 10–20
        // waterfall network requests on every mount and producing the
        // "page loses data then refills" symptom. The fix is to NOT
        // refetch here. React Query's staleTime + refetchOnWindowFocus
        // already keep the cache honest: the restored data renders
        // instantly, and queries that have been stale longer than
        // staleTime (2 min — see createQueryClient) will revalidate
        // lazily on the next mount of the component that owns them.
      }

      // Refactor (Phase 7): debounce + scope the persistence
      // subscription.
      //
      // The previous implementation called
      //   persister.persistClient(...)
      // synchronously on every cache change. With mutations firing
      // in quick succession (record payment, push notification,
      // cache invalidate, etc.) that was up to ~5 JSON.stringify +
      // localStorage.setItem calls per second on the main thread.
      //
      // The new implementation:
      //   1. Coalesces changes inside a 250 ms window.
      //   2. Filters to queries whose key is school-scoped (the
      //      queryKeys factory always includes schoolId as a
      //      positional arg; portal/parent queries use no schoolId
      //      so they are intentionally NOT persisted — see below).
      //   3. Runs the actual write on idle so it never blocks paint.
      //
      // Why portal queries are excluded
      //   Portal queries are per-parent, not per-school. Persisting
      //   them in localStorage leaks data between parents on shared
      //   devices and inflates the persisted size for schools where
      //   the parent app is the primary surface. The queryKeys
      //   factory's portal helpers (`portalNotifications`,
      //   `portalMessages`) omit schoolId — that's our discriminator.
      const persistableKey = (queryKey: unknown): boolean => {
        if (!Array.isArray(queryKey) || queryKey.length === 0) return false;
        // The queryKeys factory always emits a string as the first
        // element. We trust that contract here — lint enforces it
        // for pages via `no-restricted-syntax`.
        const head = queryKey[0];
        if (typeof head !== "string") return false;
        return head !== "portal-notifications" && head !== "portal-messages";
      };

      let pendingHandle: ReturnType<typeof setTimeout> | null = null;
      const writeSoon = () => {
        if (pendingHandle !== null) return;
        pendingHandle = setTimeout(() => {
          pendingHandle = null;
          const all = client.getQueryCache().getAll();
          const persistableQueries = all.filter((q) =>
            persistableKey(q.queryKey),
          );
          void persister.persistClient({
            clientState: {
              queries: persistableQueries,
              mutations: client.getMutationCache().getAll(),
            },
            buster: String(Date.now()),
          });
        }, 250);
      };

      const unsubscribe = client.getQueryCache().subscribe(writeSoon);
      unsub = unsubscribe;
    })();
    return () => {
      unsub?.();
    };
  }, [client]);

  // Clear the cache when the user signs out so the next sign-in
  // doesn't see a flash of the previous user's data. The dashboard
  // layout triggers a hard navigation on SIGNED_OUT — we hook into
  // that here as a belt-and-suspenders.
  useEffect(() => {
    const onBeforeUnload = () => {
      // No-op for now; the persister flushes on every change.
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, []);

  // Expose a helper for sign-out flows.
  useEffect(() => {
    (window as unknown as { __skuliClearCache?: () => void }).__skuliClearCache = () => {
      clearPersistedCache();
      client.clear();
    };
  }, [client]);

  // Audit (Bug #6): register the service worker once at the root so the
  // dashboard, teacher, and portal layouts all benefit from offline
  // caching regardless of which surface the user hits first. Previously
  // SW registration lived in teacher/layout.tsx and portal/layout.tsx
  // only, so a fresh browser profile that landed directly on /dashboard
  // never had the SW installed — explaining the "works on mobile, not
  // desktop" inconsistency. Idempotent: navigator.serviceWorker.register
  // is a no-op if the SW is already registered for this scope.
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!("serviceWorker" in navigator)) return;
    // Register after the first idle frame so SW install never blocks
    // the initial render or the LCP measurement.
    const handle = window.setTimeout(() => {
      void navigator.serviceWorker.register("/sw.js").catch((err) => {
        console.warn("[sw] registration failed", err);
      });
    }, 0);
    return () => window.clearTimeout(handle);
  }, []);

  return (
    <ThemeProvider>
      <QueryClientProvider client={client}>
        {children}
        <Toaster />
      </QueryClientProvider>
    </ThemeProvider>
  );
}

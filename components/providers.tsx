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
      // Subscribe to every cache change and re-persist. This is the
      // hand-rolled equivalent of PersistQueryClientProvider.
      const unsubscribe = client.getQueryCache().subscribe(() => {
        void persister.persistClient({
          clientState: {
            queries: client.getQueryCache().getAll(),
            mutations: client.getMutationCache().getAll(),
          },
          buster: String(Date.now()),
        });
      });
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

// SKULI Service Worker
const CACHE_NAME = "skuli-static-v1";
const ATTENDANCE_CACHE = "skuli-attendance-v1";
const OFFLINE_URL = "/offline";
const ATTENDANCE_CACHE_TTL = 24 * 60 * 60 * 1000; // 24 hours

// Assets to pre-cache on install
const PRECACHE_URLS = [OFFLINE_URL];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(PRECACHE_URLS))
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((key) => key !== CACHE_NAME && key !== ATTENDANCE_CACHE)
          .map((key) => caches.delete(key))
      )
    )
  );
  self.clients.claim();
});

// ── Background Sync: flush queued offline attendance ──────────────────────────
self.addEventListener("sync", (event) => {
  if (event.tag === "sync-attendance") {
    event.waitUntil(syncAttendanceFromSW());
  }
});

function openAttendanceDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open("skuli-attendance", 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains("pending")) {
        db.createObjectStore("pending", { keyPath: "id" });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function idbGetAll(store) {
  return new Promise((resolve, reject) => {
    const req = store.getAll();
    req.onsuccess = () => resolve(req.result || []);
    req.onerror = () => reject(req.error);
  });
}

async function syncAttendanceFromSW() {
  const db = await openAttendanceDB();
  const tx = db.transaction("pending", "readwrite");
  const store = tx.objectStore("pending");
  const all = await idbGetAll(store);
  for (const batch of all) {
    try {
      const res = await fetch("/api/attendance", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(batch),
      });
      if (res.ok) {
        const delTx = db.transaction("pending", "readwrite");
        delTx.objectStore("pending").delete(batch.id);
      }
    } catch {
      // Leave in store; Background Sync will retry on the next sync event.
    }
  }
}

self.addEventListener("fetch", (event) => {
  const { request } = event;

  // Never cache non-GET requests (POST, PUT, DELETE)
  if (request.method !== "GET") return;

  const url = new URL(request.url);

  // Attendance class-list AND dashboard /api/classes: cache-first with 24h TTL
  if (url.pathname === "/api/attendance/class-list" || url.pathname === "/api/classes") {
    event.respondWith(
      caches.open(ATTENDANCE_CACHE).then((cache) =>
        cache.match(request).then((cached) => {
          if (cached) {
            const cachedTime = parseInt(cached.headers.get("x-cached-at") || "0", 10);
            if (Date.now() - cachedTime < ATTENDANCE_CACHE_TTL) {
              // Refresh in background
              fetch(request).then((response) => {
                if (response.ok) {
                  const clone = response.clone();
                  clone.blob().then((blob) => {
                    const headers = new Headers(clone.headers);
                    headers.set("x-cached-at", Date.now().toString());
                    cache.put(request, new Response(blob, { headers }));
                  });
                }
              }).catch(() => {});
              return cached;
            }
          }
          // No valid cache — fetch from network
          return fetch(request).then((response) => {
            if (response.ok) {
              const clone = response.clone();
              clone.blob().then((blob) => {
                const headers = new Headers(clone.headers);
                headers.set("x-cached-at", Date.now().toString());
                cache.put(request, new Response(blob, { headers }));
              });
            }
            return response;
          }).catch(() => {
            // Offline and no cache — return empty class list
            if (cached) return cached;
            return new Response(
              JSON.stringify({ data: { classes: [] }, offline: true }),
              { status: 200, headers: { "Content-Type": "application/json" } }
            );
          });
        })
      )
    );
    return;
  }

  // API routes: network-first, no cache fallback for mutations
  if (url.pathname.startsWith("/api/")) {
    event.respondWith(
      fetch(request).catch(() =>
        new Response(JSON.stringify({ error: "Offline" }), {
          status: 503,
          headers: { "Content-Type": "application/json" },
        })
      )
    );
    return;
  }

  // Static assets (/_next/static/): cache-first
  if (url.pathname.startsWith("/_next/static/")) {
    event.respondWith(
      caches.match(request).then((cached) => {
        if (cached) return cached;
        return fetch(request).then((response) => {
          if (response.ok) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
          }
          return response;
        });
      })
    );
    return;
  }

  // Navigation requests: stale-while-revalidate with offline fallback
  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request)
        .then((response) => {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
          return response;
        })
        .catch(() =>
          caches.match(request).then((cached) =>
            cached || caches.match(OFFLINE_URL)
          )
        )
    );
    return;
  }

  // Other requests (images, fonts, etc.): cache-first with network fallback
  event.respondWith(
    caches.match(request).then((cached) => {
      if (cached) return cached;
      return fetch(request).then((response) => {
        if (response.ok) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
        }
        return response;
      });
    })
  );
});

// Display push notifications
self.addEventListener("push", (event) => {
  if (!event.data) return;

  const data = event.data.json();
  const options = {
    body: data.body || "",
    icon: "/icons/icon-192.svg",
    badge: "/icons/icon-192.svg",
    data: { url: data.url || "/portal" },
    tag: data.tag || undefined,
    renotify: true,
  };

  event.waitUntil(
    self.registration.showNotification(data.title || "SKULI", options)
  );
});

// Handle notification clicks — open the URL
self.addEventListener("notificationclick", (event) => {
  event.notification.close();

  const url = event.notification.data?.url || "/portal";

  event.waitUntil(
    clients.matchAll({ type: "window", includeUncontrolled: true }).then((windowClients) => {
      // Focus existing window if open
      for (const client of windowClients) {
        if (client.url.includes(url) && "focus" in client) {
          return client.focus();
        }
      }
      // Otherwise open a new window
      return clients.openWindow(url);
    })
  );
});

/**
 * Nuru service worker. Network-first for HTML; cache-first for static assets.
 * Bumped on deploy by changing CACHE_VERSION.
 *
 * On flaky Kenyan connections, the cache lets users see their last-loaded
 * search results and listing pages even when offline.
 */

const CACHE_VERSION = "nuru-v1";
const STATIC_CACHE = `nuru-static-${CACHE_VERSION}`;
const RUNTIME_CACHE = `nuru-runtime-${CACHE_VERSION}`;
const PRECACHE = ["/", "/search", "/manifest.webmanifest"];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(STATIC_CACHE).then((c) => c.addAll(PRECACHE)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const names = await caches.keys();
      await Promise.all(
        names
          .filter((n) => n !== STATIC_CACHE && n !== RUNTIME_CACHE)
          .map((n) => caches.delete(n)),
      );
      await self.clients.claim();
    })(),
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;

  const url = new URL(req.url);
  // Never cache API, auth, or webhook responses.
  if (url.pathname.startsWith("/api/") || url.pathname.startsWith("/v1/")) return;

  // Network-first for navigation requests.
  if (req.mode === "navigate") {
    event.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone();
          caches.open(RUNTIME_CACHE).then((c) => c.put(req, copy));
          return res;
        })
        .catch(() => caches.match(req).then((cached) => cached ?? caches.match("/"))),
    );
    return;
  }

  // Cache-first for everything else (assets, images).
  event.respondWith(
    caches.match(req).then((cached) => {
      if (cached) return cached;
      return fetch(req).then((res) => {
        if (res.ok && res.type === "basic") {
          const copy = res.clone();
          caches.open(RUNTIME_CACHE).then((c) => c.put(req, copy));
        }
        return res;
      });
    }),
  );
});

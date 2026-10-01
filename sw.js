// Offline support: network-first for every same-origin GET, falling back to
// the cache when the network fails.  Each request revalidates with the
// server (cache: "no-cache"), so the browser's HTTP cache (GitHub Pages
// sends max-age=600) never mixes files of two deploys while online.  No
// precache; on activate, this page's older caches ("keypath-" but not the
// current one) are deleted, never another site's on the same origin.
const CACHE = "keypath-v1";

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", event => event.waitUntil((async () => {
  const names = await caches.keys();
  await Promise.all(names.filter(n => n.startsWith("keypath-") && n !== CACHE).map(n => caches.delete(n)));
  await self.clients.claim();
})()));

self.addEventListener("fetch", event => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  event.respondWith((async () => {
    try {
      const res = await fetch(req, { cache: "no-cache" });
      if (res.ok && res.type === "basic") {
        const copy = res.clone();
        event.waitUntil(caches.open(CACHE).then(c => c.put(req, copy)).catch(() => {}));
      }
      return res;
    } catch (err) {
      const hit = await caches.match(req, { ignoreSearch: true });
      if (hit) return hit;
      throw err;
    }
  })());
});

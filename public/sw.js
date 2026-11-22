/* Stained Glass Visualizer service worker
   - navigation/HTML: network-first (never serve stale shells)
   - static assets: cache-first with background fill */
const VERSION = 'sgv-v1'
const ASSET_CACHE = `${VERSION}-assets`

self.addEventListener('install', (event) => {
  self.skipWaiting()
  event.waitUntil(Promise.resolve())
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys()
      await Promise.all(keys.filter((k) => !k.startsWith(VERSION)).map((k) => caches.delete(k)))
      await self.clients.claim()
    })(),
  )
})

self.addEventListener('fetch', (event) => {
  const req = event.request
  if (req.method !== 'GET') return
  const url = new URL(req.url)
  if (url.origin !== self.location.origin) return

  if (req.mode === 'navigate' || url.pathname.endsWith('.html')) {
    event.respondWith(
      fetch(req)
        .then((res) => res)
        .catch(() => caches.match(req)),
    )
    return
  }

  event.respondWith(
    caches.match(req).then(
      (cached) =>
        cached ||
        fetch(req).then((res) => {
          if (res.ok) {
            const copy = res.clone()
            caches.open(ASSET_CACHE).then((c) => c.put(req, copy))
          }
          return res
        }),
    ),
  )
})

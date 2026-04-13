/**
 * MirMari Service Worker — Phase 8 (app shell cache + offline page)
 *
 * Strategy: network-first for navigation, stale-while-revalidate for assets.
 * Falls back to /offline for navigation requests when the network is unavailable.
 */

const CACHE_NAME = 'mirmari-v2';

// Assets to pre-cache on install (app shell + offline fallback)
const PRECACHE_URLS = [
  '/',
  '/offline',
  '/assets/logo.svg',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
];

// ── Install: pre-cache the app shell ────────────────────────────────────────
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(PRECACHE_URLS))
  );
  // Activate immediately — don't wait for old tabs to close
  self.skipWaiting();
});

// ── Activate: delete outdated caches ────────────────────────────────────────
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
      )
  );
  // Take control of all open clients immediately
  self.clients.claim();
});

// ── Fetch: network-first, fall back to cache ────────────────────────────────
self.addEventListener('fetch', (event) => {
  // Skip non-GET requests and Supabase API calls (always need fresh data)
  if (
    event.request.method !== 'GET' ||
    event.request.url.includes('supabase.co')
  ) {
    return;
  }

  const isNavigation = event.request.mode === 'navigate';

  event.respondWith(
    fetch(event.request)
      .then((response) => {
        // Cache a clone of successful responses for offline fallback
        if (response.ok) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
        }
        return response;
      })
      .catch(() => {
        // Network failed — try cache first
        return caches.match(event.request).then((cached) => {
          if (cached) return cached;
          // For navigation requests with no cache hit, serve the offline page
          if (isNavigation) {
            return caches.match('/offline');
          }
          return new Response('', { status: 408 });
        });
      })
  );
});

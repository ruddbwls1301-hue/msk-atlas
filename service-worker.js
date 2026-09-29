/*
 * MSK Mechanics Atlas — service worker (PWA layer only).
 *
 * The app is a single self-contained HTML file (CSS, JS and GLB models inlined),
 * so the offline shell is just index.html plus the PWA assets below.
 * The app has no API / sync traffic; any such request (or anything cross-origin)
 * is left untouched and goes straight to the network.
 *
 * Updates: navigations are network-first (the cached shell is refreshed on every
 * online visit) and other assets are stale-while-revalidate, so a new deploy
 * reaches users without touching CACHE_VERSION. Bump CACHE_VERSION only to force
 * a clean precache (e.g. an asset was renamed or removed); old msk-atlas-* caches
 * are deleted on activate.
 * All URLs are relative to this file, so it works under a repository subpath.
 * This worker never touches localStorage / IndexedDB.
 */
const CACHE_PREFIX = 'msk-atlas-';
const CACHE_VERSION = 'msk-atlas-v1';
const SHELL_URL = './';
const PRECACHE = [
  SHELL_URL,
  './manifest.webmanifest',
  './pwa.js',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/maskable-icon-192.png',
  './icons/maskable-icon-512.png',
  './icons/apple-touch-icon-180.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE_VERSION)
      .then((cache) => cache.addAll(PRECACHE.map((url) => new Request(url, { cache: 'reload' }))))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys.filter((key) => key.startsWith(CACHE_PREFIX) && key !== CACHE_VERSION).map((key) => caches.delete(key)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

function isBypassed(request, url) {
  if (request.method !== 'GET') return true;
  if (url.origin !== self.location.origin) return true;
  if (/\/(api|sync)(\/|$)/.test(url.pathname)) return true;
  return false;
}

// Only the app entry (scope root or index.html) may refresh the cached shell.
function isShellUrl(url) {
  const scopePath = new URL(self.registration.scope).pathname;
  return url.pathname === scopePath || url.pathname === `${scopePath}index.html`;
}

function isHtmlResponse(response) {
  return !!response && response.ok && (response.headers.get('content-type') || '').includes('text/html');
}

// Navigation: network first, cached shell as offline fallback.
async function handleNavigation(event) {
  const { request } = event;
  const cache = await caches.open(CACHE_VERSION);
  try {
    const response = await fetch(request);
    if (isShellUrl(new URL(request.url)) && isHtmlResponse(response)) {
      event.waitUntil(cache.put(SHELL_URL, response.clone()));
    }
    return response;
  } catch (error) {
    const cached = (await cache.match(SHELL_URL)) || (await cache.match(request, { ignoreSearch: true }));
    if (cached) return cached;
    throw error;
  }
}

// Static same-origin assets: stale-while-revalidate.
async function handleAsset(event) {
  const { request } = event;
  const cache = await caches.open(CACHE_VERSION);
  const cached = await cache.match(request, { ignoreSearch: true });
  const network = fetch(request)
    .then((response) => {
      if (response && response.ok) return cache.put(request, response.clone()).then(() => response);
      return response;
    })
    .catch(() => undefined);
  event.waitUntil(network);
  return cached || (await network) || Response.error();
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);
  if (isBypassed(request, url)) return;
  if (request.mode === 'navigate') {
    event.respondWith(handleNavigation(event));
    return;
  }
  event.respondWith(handleAsset(event));
});

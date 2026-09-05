/* Mission Control service worker: app-shell cache + FCM background push.
   One SW handles both because a scope can only have one active worker. */

/* Push and caching are independent jobs that share one worker because a scope
   can only have one. If the messaging SDK cannot load — blocked, offline, CDN
   down — the cache handlers below must still install and work, so every part of
   the push setup is wrapped and failure is recorded rather than thrown. */
let messagingReady = false;
try {
importScripts('https://www.gstatic.com/firebasejs/10.14.1/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.14.1/firebase-messaging-compat.js');

firebase.initializeApp({
  apiKey: "AIzaSyAiFSwmMc-qYYtXgsiaENQ3nRBBrmy7dc8",
  authDomain: "newt-90ca4.firebaseapp.com",
  projectId: "newt-90ca4",
  storageBucket: "newt-90ca4.firebasestorage.app",
  messagingSenderId: "772443408217",
  appId: "1:772443408217:web:fa78c2bb719a883e382e48"
});

const messaging = firebase.messaging();
messagingReady = true;

// Pushes sent with a `notification` payload are displayed by the browser
// automatically; this handler covers data-only messages so nothing is silent.
messaging.onBackgroundMessage((payload) => {
  const d = (payload && payload.data) || {};
  if (payload && payload.notification) return; // already displayed
  self.registration.showNotification(d.title || 'FLOWSTATE', {
    body: d.body || '',
    icon: 'icons/icon-192.png',
    badge: 'icons/icon-192.png',
    data: { url: d.url || './' }
  });
});

} catch (e) {
  // Cache handlers below are registered regardless.
  console.warn('FLOWSTATE SW: messaging unavailable, caching still active', e);
}

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || './';
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
      for (const c of list) {
        if (c.url.includes('phone-dashboard') && 'focus' in c) return c.focus();
      }
      return clients.openWindow(url);
    })
  );
});

/* ---------------- app-shell cache ---------------- */
const CACHE_PREFIX = 'flowstate-';
const CACHE = CACHE_PREFIX + 'midnight-v1';
const SHELL = [
  './',
  'index.html',
  'ui/midnight.css',
  'ui/midnight.mjs',
  'assets/filament.svg',
  'fonts/newsreader.woff2',
  'schedule.json',
  'manifest.json',
  'icons/icon-192.png',
  'icons/icon-512.png'
];

// Background moods — precached so the first offline open has its mood art rather
// than only the CSS gradient fallback. Deliberately NOT in SHELL: addAll() is
// atomic, so one 404 here would fail the whole install and leave the app with no
// service worker. The art is decorative and the gradients render without it, so
// it gets the same best-effort treatment as the CDN module below.
const MOOD_ASSETS = [
  'moods/default.svg',
  'moods/drift.svg',
  'moods/nebula.svg',
  'moods/glacier.svg',
  'moods/cinder.svg',
  'moods/meridian.svg'
];

// Cross-origin modules worth keeping offline. Version-pinned URLs, so a cached
// copy is never stale — cache-first is correct and saves the import round-trip
// that would otherwise delay the first ring animation on every cold open.
const RUNTIME_PINNED = [
  'https://cdn.jsdelivr.net/npm/motion@11.11.13/+esm'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE)
      .then((c) => c.addAll(SHELL).then(() =>
        // Best-effort: a blocked or offline CDN — or a missing mood file — must not
        // fail the install and leave the app without a service worker at all.
        Promise.all(
          MOOD_ASSETS.map((u) => c.add(u).catch(() => {}))
            .concat(RUNTIME_PINNED.map((u) => c.add(new Request(u, { mode: 'cors' })).catch(() => {})))
        )
      ))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      // Only this app's own caches. github.io is a shared origin: every project
      // published under the same account lives here, and deleting every key
      // would wipe a neighbouring app's cache as a side effect of our upgrade.
      .then((keys) => Promise.all(
        keys.filter((k) => k.startsWith(CACHE_PREFIX) && k !== CACHE).map((k) => caches.delete(k))
      ))
      .then(() => self.clients.claim())
  );
});

// Network-first for same-origin GETs (the app is one file that changes often);
// fall back to cache when offline. Pinned cross-origin modules are cache-first.
// Everything else cross-origin (Firebase, fonts) passes straight through.
// Only this app's own URLs are intercepted: same-origin requests under the
// registration scope, plus the explicitly pinned cross-origin modules.
// github.io is a shared origin, so a bare same-origin test would put this
// worker in front of a neighbouring project's requests.
const SCOPE_PATH = new URL(self.registration.scope).pathname;

// A 404 or a 502 is a valid HTTP response, so a naive cache.put stores it and
// the next offline open serves the error instead of the app. Only successful,
// non-partial, basic/cors responses are worth keeping.
const cacheable = (res) =>
  res && res.ok && res.status === 200 && (res.type === 'basic' || res.type === 'cors');

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);
  if (url.origin !== self.location.origin) {
    if (!RUNTIME_PINNED.includes(req.url.split('?')[0])) return;
    event.respondWith(
      caches.match(req).then((hit) => hit || fetch(req).then((res) => {
        if (cacheable(res)) { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(req, copy)); }
        return res;
      }))
    );
    return;
  }
  if (!url.pathname.startsWith(SCOPE_PATH)) return;

  event.respondWith(
    fetch(req)
      .then((res) => {
        if (cacheable(res)) {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(req, copy));
          return res;
        }
        // Server answered, but with an error. Prefer a known-good cached copy
        // over showing the failure — and never overwrite that copy with it.
        return caches.match(req, { ignoreSearch: true }).then((hit) => hit || res);
      })
      .catch(() => caches.match(req, { ignoreSearch: true }))
  );
});

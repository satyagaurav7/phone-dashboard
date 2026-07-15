/* Mission Control service worker: app-shell cache + FCM background push.
   One SW handles both because a scope can only have one active worker. */

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
const CACHE = 'flowstate-v1';
const SHELL = [
  './',
  'index.html',
  'schedule.json',
  'manifest.json',
  'icons/icon-192.png',
  'icons/icon-512.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// Network-first for same-origin GETs (the app is one file that changes often);
// fall back to cache when offline. Cross-origin (Firebase, fonts) passes through.
self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) return;
  event.respondWith(
    fetch(req)
      .then((res) => {
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put(req, copy));
        return res;
      })
      .catch(() => caches.match(req, { ignoreSearch: true }))
  );
});

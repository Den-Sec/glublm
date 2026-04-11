/**
 * GlubLM Desk Pet Service Worker
 * - Pre-caches static assets
 * - Streaming cache for the 40MB ONNX model with progress reporting
 * - Handles notifications while tab is in background
 */

const CACHE_VERSION = 'glub-v1';
const CACHE_MODEL = 'glub-model-v1';

const STATIC_ASSETS = [
  './',
  './index.html',
  './style.css',
  './app.js',
  './manifest.json',
  './engine/canvas.js',
  './engine/bowl.js',
  './engine/bubbles.js',
  './engine/sprites.js',
  './engine/movement.js',
  './engine/state-machine.js',
  './engine/speech.js',
  './engine/idle.js',
  './inference/model.js',
  './inference/tokenizer.js',
  './data/idle-phrases.json',
  './tokenizer.json',
];

// ============================================================
// Lifecycle
// ============================================================
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_VERSION).then((cache) => {
      return cache.addAll(STATIC_ASSETS).catch((err) => {
        console.warn('[sw] Some assets failed to cache:', err);
      });
    }).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((k) => k !== CACHE_VERSION && k !== CACHE_MODEL)
          .map((k) => caches.delete(k))
      )
    ).then(() => self.clients.claim())
  );
});

// ============================================================
// Fetch handler
// ============================================================
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // Only handle same-origin (and CDN for ORT)
  if (url.origin !== self.location.origin &&
      !url.hostname.includes('jsdelivr.net')) {
    return;
  }

  // Model file: streaming cache with progress
  if (url.pathname.endsWith('model.onnx')) {
    event.respondWith(handleModelFetch(event.request));
    return;
  }

  // Everything else: cache-first
  event.respondWith(
    caches.match(event.request).then((cached) => {
      if (cached) return cached;
      return fetch(event.request).then((resp) => {
        if (resp && resp.status === 200 && resp.type !== 'opaque') {
          const clone = resp.clone();
          caches.open(CACHE_VERSION).then((c) => c.put(event.request, clone));
        }
        return resp;
      }).catch(() => cached || new Response('offline', { status: 503 }));
    })
  );
});

async function handleModelFetch(request) {
  const cache = await caches.open(CACHE_MODEL);
  const cached = await cache.match(request);
  if (cached) return cached;

  // Fetch with progress reporting to all clients
  const response = await fetch(request);
  const total = parseInt(response.headers.get('Content-Length') || '0');

  if (!response.body) {
    // Fallback: no streaming
    const clone = response.clone();
    cache.put(request, clone);
    return response;
  }

  const reader = response.body.getReader();
  const chunks = [];
  let received = 0;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    received += value.length;

    // Report progress
    const clients = await self.clients.matchAll();
    for (const c of clients) {
      c.postMessage({
        type: 'model-download-progress',
        received,
        total,
      });
    }
  }

  // Reconstruct blob
  const blob = new Blob(chunks);
  const newResponse = new Response(blob, {
    status: 200,
    headers: response.headers,
  });
  cache.put(request, newResponse.clone());
  return newResponse;
}

// ============================================================
// Notifications
// ============================================================
let notifTimer = null;
let notifPhrases = [];
let notifFrequencyPerDay = 4;

self.addEventListener('message', (event) => {
  const data = event.data;
  if (!data || !data.type) return;

  switch (data.type) {
    case 'start-notifications':
      notifFrequencyPerDay = data.frequency || 4;
      notifPhrases = data.phrases || [];
      startNotifTimer();
      break;
    case 'stop-notifications':
      stopNotifTimer();
      break;
    case 'update-phrases':
      notifPhrases = data.phrases || [];
      break;
  }
});

function startNotifTimer() {
  stopNotifTimer();
  // Interval based on frequency per day, with some randomization
  const intervalMs = Math.max(30 * 60 * 1000, (24 * 60 * 60 * 1000) / notifFrequencyPerDay);
  notifTimer = setInterval(() => {
    showRandomNotification();
  }, intervalMs);
}

function stopNotifTimer() {
  if (notifTimer) {
    clearInterval(notifTimer);
    notifTimer = null;
  }
}

async function showRandomNotification() {
  if (notifPhrases.length === 0) return;
  const phrase = notifPhrases[Math.floor(Math.random() * notifPhrases.length)];
  try {
    await self.registration.showNotification('Glub', {
      body: phrase,
      icon: './assets/icons/icon-192.png',
      badge: './assets/icons/icon-192.png',
      tag: 'glub-idle',
      renotify: true,
      silent: false,
      requireInteraction: false,
    });
  } catch (e) {
    console.warn('[sw] Notification failed:', e);
  }
}

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => {
      for (const c of clients) {
        if (c.url.includes(self.location.pathname.replace(/\/sw\.js$/, '')) && 'focus' in c) {
          return c.focus();
        }
      }
      if (self.clients.openWindow) {
        return self.clients.openWindow('./');
      }
    })
  );
});

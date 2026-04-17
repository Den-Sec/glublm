/**
 * GlubLM Desk Pet Service Worker
 * - Pre-caches static assets
 * - Streaming cache for the 40MB ONNX model with progress reporting
 * - Handles notifications while tab is in background
 */

// Bump on any release. The model cache is versioned separately so we
// don't force a 40 MB re-download on every code update.
const CACHE_VERSION = 'glub-v6';
const CACHE_MODEL = 'glub-model-v3';

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
  './engine/dissolve.js',
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
//
// Strategy:
// - model.onnx     : cache-first (40 MB, never re-download unless cleared)
// - tokenizer.json : cache-first (large BPE vocab, stable)
// - everything else: stale-while-revalidate (fast load + background update)
//
// Stale-while-revalidate means: serve the cached copy immediately (fast),
// but ALSO refetch from the network in the background and update the cache
// for next time. This prevents the "new app.js with old movement.js" bug
// where code updates create cache inconsistencies between reloads.
// ============================================================
self.addEventListener('fetch', (event) => {
  const req = event.request;
  const url = new URL(req.url);

  // Only GET, same-origin (or jsdelivr for ORT)
  if (req.method !== 'GET') return;
  if (url.origin !== self.location.origin && !url.hostname.includes('jsdelivr.net')) {
    return;
  }

  // Model file: streaming cache-first with progress reporting
  if (url.pathname.endsWith('model.onnx')) {
    event.respondWith(handleModelFetch(req));
    return;
  }

  // tokenizer.json: cache-first (stable, medium-sized)
  if (url.pathname.endsWith('tokenizer.json')) {
    event.respondWith(cacheFirst(req));
    return;
  }

  // Everything else: stale-while-revalidate
  event.respondWith(staleWhileRevalidate(req));
});

/**
 * Cache-first strategy: return cached response if present, else fetch + cache.
 */
async function cacheFirst(request) {
  const cached = await caches.match(request);
  if (cached) return cached;
  try {
    const resp = await fetch(request);
    if (resp && resp.status === 200 && resp.type !== 'opaque') {
      const cache = await caches.open(CACHE_VERSION);
      cache.put(request, resp.clone());
    }
    return resp;
  } catch {
    return new Response('offline', { status: 503 });
  }
}

/**
 * Stale-while-revalidate: return cached immediately, refetch in background.
 * This is the right strategy for JS/CSS/HTML where we want fast loads AND
 * fresh content on next visit.
 */
async function staleWhileRevalidate(request) {
  const cache = await caches.open(CACHE_VERSION);
  const cached = await cache.match(request);

  // Start background fetch (don't await - let it run)
  const fetchPromise = fetch(request).then((resp) => {
    if (resp && resp.status === 200 && resp.type !== 'opaque') {
      cache.put(request, resp.clone());
    }
    return resp;
  }).catch(() => null);

  // Return cached immediately if we have it, else wait for network
  return cached || fetchPromise || new Response('offline', { status: 503 });
}

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

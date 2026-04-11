# Desk Pet Phase 3: PWA + Polish

> **Spec:** [`../specs/2026-04-10-deskpet-design.md`](../specs/2026-04-10-deskpet-design.md)
> **Ultraplan:** [`2026-04-10-deskpet-ultraplan.md`](2026-04-10-deskpet-ultraplan.md)
> **Depends on:** Phase 1 complete (engine), Phase 2 complete (intelligence + idle phrases)
> **Phase focus:** PWA manifest, Service Worker, offline caching (40MB model), push notifications, settings panel, mobile optimization, GitHub Pages deploy

---

## Task 1: PWA manifest

**Goal:** Make the desk pet installable as a standalone app.

- [ ] Step 1: Create `desk-pet/manifest.json`:
  ```json
  {
    "name": "GlubLM Desk Pet",
    "short_name": "Glub",
    "description": "A goldfish companion that already forgot this description",
    "start_url": ".",
    "display": "standalone",
    "orientation": "any",
    "background_color": "#e5f4ff",
    "theme_color": "#ff8b3d",
    "categories": ["entertainment", "games"],
    "icons": [
      {
        "src": "assets/icons/icon-192.png",
        "sizes": "192x192",
        "type": "image/png",
        "purpose": "any maskable"
      },
      {
        "src": "assets/icons/icon-512.png",
        "sizes": "512x512",
        "type": "image/png",
        "purpose": "any maskable"
      }
    ]
  }
  ```
- [ ] Step 2: Add manifest link to `index.html`:
  ```html
  <link rel="manifest" href="manifest.json">
  <meta name="theme-color" content="#ff8b3d">
  <meta name="apple-mobile-web-app-capable" content="yes">
  <meta name="apple-mobile-web-app-status-bar-style" content="default">
  <link rel="apple-touch-icon" href="assets/icons/icon-192.png">
  ```
- [ ] Step 3: Create PWA icons:
  - 192x192 and 512x512 PNG
  - Orange goldfish on blue circle background
  - Can be upscaled from a small pixel art original
  - Save to `desk-pet/assets/icons/`
- [ ] Step 4: Verify: Chrome DevTools > Application > Manifest shows valid manifest with icons

**Files:** `desk-pet/manifest.json`, `desk-pet/index.html`, `desk-pet/assets/icons/`

---

## Task 2: Service Worker - static asset caching

**Goal:** Cache all static assets for offline use (everything except the 40MB model).

- [ ] Step 1: Create `desk-pet/sw.js`:
  ```javascript
  const CACHE_NAME = 'glub-v1';
  const STATIC_ASSETS = [
    './',
    './index.html',
    './style.css',
    './app.js',
    './engine/canvas.js',
    './engine/sprites.js',
    './engine/state-machine.js',
    './engine/movement.js',
    './engine/bowl.js',
    './engine/bubbles.js',
    './engine/speech.js',
    './engine/idle.js',
    './inference/model.js',
    './inference/tokenizer.js',
    './data/idle-phrases.json',
    './assets/sprites.png',
    './assets/sprite-meta.js',
    './manifest.json',
  ];
  ```
- [ ] Step 2: Implement install event:
  - Pre-cache all STATIC_ASSETS
  - Skip model.onnx and tokenizer.json (handled separately)
  - `self.skipWaiting()` for immediate activation
- [ ] Step 3: Implement activate event:
  - Delete old caches (any cache not matching CACHE_NAME)
  - `self.clients.claim()` for immediate control
- [ ] Step 4: Implement fetch event - cache-first strategy:
  ```javascript
  self.addEventListener('fetch', (event) => {
    event.respondWith(
      caches.match(event.request)
        .then(cached => cached || fetch(event.request)
          .then(response => {
            // Clone and cache new responses
            const clone = response.clone();
            caches.open(CACHE_NAME).then(c => c.put(event.request, clone));
            return response;
          })
        )
    );
  });
  ```
- [ ] Step 5: Register SW in `app.js`:
  ```javascript
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('./sw.js');
  }
  ```
- [ ] Step 6: Verify: load page, go offline (DevTools > Network > Offline), reload - page loads from cache

**Files:** `desk-pet/sw.js`, `desk-pet/app.js`

---

## Task 3: Service Worker - model caching with progress

**Goal:** Cache the 40MB model.onnx on first load with download progress feedback.

- [ ] Step 1: Add special handling for model.onnx in SW fetch event:
  - First request: fetch from network, stream into cache, report progress via MessageChannel
  - Subsequent requests: serve from cache (instant)
- [ ] Step 2: Implement streaming cache with progress:
  ```javascript
  // In SW: when fetching model.onnx
  async function fetchAndCacheModel(request) {
    const response = await fetch(request);
    const contentLength = response.headers.get('Content-Length');
    const reader = response.body.getReader();
    const chunks = [];
    let received = 0;

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
      received += value.length;
      // Post progress to client
      self.clients.matchAll().then(clients => {
        clients.forEach(c => c.postMessage({
          type: 'download-progress',
          received,
          total: parseInt(contentLength) || 0,
        }));
      });
    }

    const blob = new Blob(chunks);
    const cachedResponse = new Response(blob, {
      headers: response.headers,
    });
    const cache = await caches.open(CACHE_NAME);
    await cache.put(request, cachedResponse);
    return new Response(blob, { headers: response.headers });
  }
  ```
- [ ] Step 3: In `app.js`, listen for progress messages from SW:
  ```javascript
  navigator.serviceWorker.addEventListener('message', (event) => {
    if (event.data.type === 'download-progress') {
      updateProgressBar(event.data.received, event.data.total);
    }
  });
  ```
- [ ] Step 4: Handle tokenizer.json similarly (small file, same cache strategy)
- [ ] Step 5: Handle ONNX Runtime CDN script caching:
  - Add to static assets or handle in fetch event
  - CDN may have CORS issues with opaque responses - handle gracefully
- [ ] Step 6: Verify: clear cache, reload with slow network throttle, see progress bar. Then reload - instant from cache.

**Files:** `desk-pet/sw.js`, `desk-pet/app.js`

---

## Task 4: Offline indicator

**Goal:** Subtle visual feedback when offline.

- [ ] Step 1: Listen for online/offline events:
  ```javascript
  window.addEventListener('online', () => { ... });
  window.addEventListener('offline', () => { ... });
  ```
- [ ] Step 2: When offline and model is cached:
  - Subtle indicator only (small "offline" text in corner, very low opacity)
  - Everything works normally (the whole point is offline)
- [ ] Step 3: When offline and model is NOT cached:
  - Show message: "the goldfish needs the internet for the first visit. come back when you're online!"
  - Idle phrases still work (they're cached with static assets)
  - Input disabled
- [ ] Step 4: Verify: go offline in DevTools, observe behavior in both cached and uncached states

**Files:** `desk-pet/app.js`

---

## Task 5: Push notification system

**Goal:** Fish sends notifications when user is away.

- [ ] Step 1: Add notification permission request flow:
  - After first-run tutorial (Task 10 Phase 2), wait 30 seconds
  - Show in-app prompt: "allow glub to tap on the glass when you're away?"
  - Two buttons: "sure" (requests Notification.requestPermission) and "no thanks"
  - Store decision in localStorage (`glub_notifs`)
  - If denied, never ask again. If dismissed, ask again after 3 sessions.
- [ ] Step 2: Select notification phrases:
  - Filter idle phrases with `"notification": true` tag
  - Fallback: use any `bored`, `long_silence`, `cheerful` phrases
  - Time-aware: use time-of-day filtering same as idle scheduler
- [ ] Step 3: Implement notification scheduling in Service Worker:
  ```javascript
  // In sw.js
  let notifInterval = null;

  self.addEventListener('message', (event) => {
    if (event.data.type === 'start-notifications') {
      const frequency = event.data.frequency || 4; // per day
      const intervalMs = (24 * 60 * 60 * 1000) / frequency;
      notifInterval = setInterval(() => {
        showRandomNotification();
      }, intervalMs);
    }
    if (event.data.type === 'stop-notifications') {
      clearInterval(notifInterval);
    }
  });

  async function showRandomNotification() {
    const phrases = await getNotificationPhrases(); // from cached idle-phrases.json
    const phrase = phrases[Math.floor(Math.random() * phrases.length)];
    self.registration.showNotification('Glub', {
      body: phrase.text,
      icon: './assets/icons/icon-192.png',
      badge: './assets/icons/icon-192.png',
      tag: 'glub-idle', // replace previous notification
      renotify: true,
    });
  }
  ```
- [ ] Step 4: Trigger notification start when tab visibility changes to hidden:
  ```javascript
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      navigator.serviceWorker.controller?.postMessage({
        type: 'start-notifications',
        frequency: getNotifFrequency(),
      });
    } else {
      navigator.serviceWorker.controller?.postMessage({
        type: 'stop-notifications',
      });
    }
  });
  ```
- [ ] Step 5: Notification click: focus existing tab or open new one
  ```javascript
  // In sw.js
  self.addEventListener('notificationclick', (event) => {
    event.notification.close();
    event.waitUntil(
      clients.matchAll({ type: 'window' }).then(cls => {
        for (const c of cls) {
          if (c.url.includes('desk-pet') && 'focus' in c) return c.focus();
        }
        return clients.openWindow('./');
      })
    );
  });
  ```
- [ ] Step 6: Verify: switch to another tab, wait for notification, click notification → returns to desk pet

**Known limitation:** Notifications stop when the browser is fully closed (no push server). Document in README.

**Files:** `desk-pet/sw.js`, `desk-pet/app.js`

---

## Task 6: Settings panel

**Goal:** Minimal settings accessible via gear icon.

- [ ] Step 1: Add settings gear icon to UI (bottom-right corner):
  - SVG gear icon or Unicode character
  - Positioned fixed, subtle opacity, hover reveals
- [ ] Step 2: Create settings overlay (DOM, not canvas):
  ```html
  <div id="settings" class="hidden">
    <h3>settings</h3>
    <label>
      notifications
      <select id="notif-freq">
        <option value="0">off</option>
        <option value="2">gentle (2/day)</option>
        <option value="4" selected>normal (4/day)</option>
        <option value="8">chatty (8/day)</option>
      </select>
    </label>
    <label>
      fish name
      <input id="fish-name" type="text" placeholder="glub" maxlength="16">
    </label>
    <div class="settings-footer">
      <a href="https://github.com/Den-Sec/glublm">about</a>
      <button id="close-settings">done</button>
    </div>
  </div>
  ```
- [ ] Step 3: Style settings panel:
  - Semi-transparent backdrop
  - Rounded card, matching bowl aesthetic
  - Small, centered, doesn't cover full screen
- [ ] Step 4: Persist settings in localStorage:
  - `glub_notif_freq`: notification frequency (0, 2, 4, 8)
  - `glub_fish_name`: custom fish name (default: "glub")
  - Load on init, save on change
- [ ] Step 5: Fish name integration:
  - If user sets a name, notification title uses it instead of "Glub"
  - Idle phrases could reference the name (stretch goal, not required)
- [ ] Step 6: Verify: open settings, change frequency, close, reopen - changes persisted

**Files:** `desk-pet/index.html`, `desk-pet/style.css`, `desk-pet/app.js`

---

## Task 7: PWA install prompt

**Goal:** Custom "adopt this goldfish" install prompt.

- [ ] Step 1: Capture `beforeinstallprompt` event:
  ```javascript
  let deferredPrompt = null;
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredPrompt = e;
    showInstallBanner();
  });
  ```
- [ ] Step 2: Show custom install banner:
  - Small banner at top of screen: "adopt this goldfish? [install] [not now]"
  - Styled to match bowl aesthetic (rounded, semi-transparent)
  - "install" triggers `deferredPrompt.prompt()`
  - "not now" dismisses, stores in sessionStorage (show again next session)
- [ ] Step 3: Handle install success:
  - Listen for `appinstalled` event
  - Show brief speech bubble: "i live here now!"
  - Store in localStorage to never show banner again
- [ ] Step 4: Verify: on supported browser (Chrome), install banner appears. Install works. App opens standalone.

**Files:** `desk-pet/app.js`, `desk-pet/style.css`

---

## Task 8: Mobile optimization

**Goal:** Perfect mobile experience.

- [ ] Step 1: Prevent all default touch behaviors on canvas:
  - No zoom, no scroll, no context menu
  - `touch-action: none` CSS
  - `preventDefault()` on touchstart, touchmove, contextmenu
- [ ] Step 2: Handle virtual keyboard:
  - When input focused: bowl content shifts up (CSS transform or viewport adjustment)
  - When input blurred: bowl returns to normal
  - Use `visualViewport` API for precise keyboard height
- [ ] Step 3: Handle orientation changes:
  - Canvas resize on orientationchange event
  - Bowl re-centers
  - Fish stays within new bounds
- [ ] Step 4: Handle safe area insets (notch devices):
  - `env(safe-area-inset-*)` in CSS for input positioning
  - Ensure bowl doesn't render behind notch
- [ ] Step 5: Performance on low-end devices:
  - If FPS drops below 30, reduce bubble count
  - If FPS drops below 20, disable water wave animation
  - Check via rolling average of frame delta
- [ ] Step 6: Test on actual mobile device (or Chrome DevTools device mode):
  - iPhone SE viewport (375x667)
  - iPhone 15 Pro viewport (393x852)
  - Pixel 7 viewport (412x915)
  - iPad viewport (768x1024)
- [ ] Step 7: Verify: all viewports look good, touch works, keyboard works, no jank

**Files:** `desk-pet/style.css`, `desk-pet/app.js`

---

## Task 9: Final polish

**Goal:** Quality pass on visual and interaction details.

- [ ] Step 1: Favicon:
  - Add favicon link to index.html
  - Use the 192px icon scaled down, or a 32x32 version
- [ ] Step 2: Open Graph / meta tags:
  ```html
  <meta property="og:title" content="GlubLM Desk Pet">
  <meta property="og:description" content="A goldfish companion that already forgot this description">
  <meta property="og:image" content="assets/icons/icon-512.png">
  <meta property="og:type" content="website">
  ```
- [ ] Step 3: Page title update when fish speaks:
  - Briefly change document.title to the phrase (then revert)
  - Fun touch when tab is in background
- [ ] Step 4: Clean up all console.log statements (except errors)
- [ ] Step 5: Minify idle-phrases.json (remove whitespace formatting)
- [ ] Step 6: Add version number to cache name (for future updates):
  - `CACHE_NAME = 'glub-v1'` - bump on updates
- [ ] Step 7: Add `<noscript>` fallback message
- [ ] Step 8: Verify: no console warnings, Lighthouse PWA audit passes key checks

**Files:** `desk-pet/index.html`, `desk-pet/sw.js`, `desk-pet/app.js`

---

## Task 10: GitHub Pages deployment

**Goal:** Deploy desk pet to GitHub Pages.

- [ ] Step 1: Decide deployment path:
  - Option A: Deploy at `/desk-pet/` (keep existing demo at root)
  - Option B: Replace root demo (desk pet becomes the main experience)
  - **Recommended: Option A** for now, switch to B later
- [ ] Step 2: Update `.github/workflows/deploy-pages.yml`:
  - Add desk-pet directory to the deploy artifact
  - Ensure model.onnx is included (it's large - verify GH Pages limits)
  - GitHub Pages has a 1GB soft limit - 40MB model is fine
- [ ] Step 3: Update model/tokenizer paths if needed:
  - If deploying at `/desk-pet/`, all relative paths should work as-is
  - Verify SW scope matches deployment path
- [ ] Step 4: Push and verify:
  - Wait for GH Actions to complete
  - Visit `den-sec.github.io/glublm/desk-pet/`
  - Test on mobile
  - Test install prompt
  - Test offline behavior
- [ ] Step 5: Update README.md with link to desk pet demo:
  - Add "Desk Pet" section with screenshot and link
  - Brief description of features

**Files:** `.github/workflows/deploy-pages.yml`, `README.md`

---

## Task 11: Phase 3 integration test and ship

**Goal:** Full end-to-end verification and final commit.

- [ ] Step 1: Full test checklist:
  - [ ] Fresh visit: model downloads with progress bar
  - [ ] Second visit: instant load from cache
  - [ ] Offline mode: everything works after first visit
  - [ ] PWA install prompt appears (Chrome/Edge)
  - [ ] App installs and opens standalone
  - [ ] Notifications: permission prompt after tutorial
  - [ ] Notifications: appear when tab is in background
  - [ ] Notification click: returns to desk pet
  - [ ] Settings: open, change frequency, save, persist
  - [ ] Settings: fish name persists
  - [ ] Mobile: touch works, keyboard works, responsive
  - [ ] Mobile: no zoom, no scroll interference
  - [ ] Mobile: safe area insets (if notch device)
  - [ ] Desktop: all interactions work
  - [ ] GitHub Pages: live and accessible
  - [ ] Lighthouse PWA audit: passes core checks
  - [ ] No console errors or warnings
- [ ] Step 2: Update SESSION_NOTES.md with desk pet completion status
- [ ] Step 3: Update README.md with desk pet section
- [ ] Step 4: Final commit: `feat(desk-pet): phase 3 PWA complete - desk pet shipped`
- [ ] Step 5: Tag: `v0.4.0-deskpet`
- [ ] Step 6: Push to GitHub

**Files:** All desk-pet/ files, README.md, SESSION_NOTES.md

---

## Phase 3 Exit Criteria

1. PWA manifest valid, app installable on Chrome/Edge
2. Service Worker caches all assets including 40MB model
3. Full offline functionality after first visit
4. Notifications work when tab is in background
5. Settings panel persists notification frequency and fish name
6. Install prompt ("adopt this goldfish") appears and works
7. Mobile-optimized: touch, keyboard, orientation, safe areas
8. Deployed on GitHub Pages
9. Lighthouse PWA audit passes
10. Zero console errors

---

## Known Limitations (document in README)

1. **Notifications stop when browser closes** - no push server, so notifications only work while browser is running (even in background). Real push requires a server relay.
2. **iOS Safari PWA**: Notifications not supported in iOS PWA mode. Core experience (fish, chat, idle phrases) works fine.
3. **Model download**: First visit requires ~40MB download. Subsequent visits are instant from cache.
4. **Browser support**: Requires ES modules, Canvas 2D, Service Worker. Works on all modern browsers (Chrome, Firefox, Safari, Edge). IE not supported.

---

*End of Phase 3 plan. After completion, the GlubLM Desk Pet is shipped!*

/**
 * GlubLM Desk Pet - main entry point.
 * Orchestrates: canvas, bowl, sprites, movement, state machine,
 * bubbles, speech, idle scheduler, ONNX inference, and chat input.
 */

import { CanvasManager } from './engine/canvas.js';
import { Bowl } from './engine/bowl.js';
import { BubbleSystem, SplashSystem } from './engine/bubbles.js';
import { DissolveSystem } from './engine/dissolve.js';
import { SpriteEngine } from './engine/sprites.js';
import { FishMovement } from './engine/movement.js';
import { FishStateMachine, STATES } from './engine/state-machine.js';
import { SpeechBubble } from './engine/speech.js';

// Re-exported here to make duration-aware FSM transitions readable inline.
const speechDuration = (text) => SpeechBubble.calcDuration(text);
import { IdleScheduler } from './engine/idle.js';
import { OnnxModel } from './inference/model.js';
import { shouldShowOnboarding, runOnboarding } from './engine/onboarding.js';

// ============================================================
// Systems
// ============================================================
let canvas, bowl, bubbles, splash, sprites, movement, fsm, speech, idle, model, dissolve;
let lastInteractionTime = performance.now();
let randomEventTimer = 0;
let nextRandomEvent = 8 + Math.random() * 15;
let sleepCheckTimer = 0;
const SLEEP_TIMEOUT = 300;

// Spiral click animation
let spiralActive = false;
let spiralAngle = 0;
let spiralTimer = 0;
let spiralCx = 0;
let spiralCy = 0;
const SPIRAL_DURATION = 0.6;
const SPIRAL_RADIUS = 12;

// Chat state
let chatBusy = false;

// DOM refs
let promptEl, sendEl, chatInputEl, loadingEl, statusEl, progressEl;
let settingsBtn, settingsPanel, settingsClose, notifFreqEl, fishNameEl;
let installBanner, installBtn, installDismiss, iosInstallBanner, iosInstallDismiss;

/** Update the load progress bar + status text. */
function updateProgress(pct, label) {
  if (statusEl) {
    const pctText = pct > 0 && pct < 100 ? ` ${pct}%` : (pct >= 100 ? '' : '...');
    statusEl.textContent = `${label}${pctText}`;
  }
  if (progressEl) {
    progressEl.style.width = Math.max(2, pct) + '%';
  }
}

// PWA install
let deferredInstallPrompt = null;

// Settings (persisted in localStorage)
const SETTINGS = {
  notifFreq: parseInt(localStorage.getItem('glub_notif_freq') || '4'),
  fishName: localStorage.getItem('glub_fish_name') || '',
  installDismissed: localStorage.getItem('glub_install_dismissed') === '1',
  installed: localStorage.getItem('glub_installed') === '1',
  installShowCount: parseInt(localStorage.getItem('glub_install_show_count') || '0'),
};

// Set to true if model load fails - gates install banner + keeps loading overlay visible.
let modelLoadFailed = false;

// ============================================================
// Random events
// ============================================================
const RANDOM_EVENTS = [
  { state: STATES.BUMPING,         weight: 2, duration: 1.5 },
  { state: STATES.BLOWING_BUBBLES, weight: 3, duration: 2.5 },
  { state: STATES.TURNING,         weight: 2, duration: 0.8 },
  { state: STATES.EATING,          weight: 1, duration: 2 },
  { state: STATES.FORGETTING,      weight: 2, duration: 2.5 },
];

function pickRandomEvent() {
  const total = RANDOM_EVENTS.reduce((s, e) => s + e.weight, 0);
  let r = Math.random() * total;
  for (const e of RANDOM_EVENTS) { r -= e.weight; if (r <= 0) return e; }
  return RANDOM_EVENTS[0];
}

function getFishSize() {
  return Math.max(14, Math.min(24, Math.round(canvas.width * 0.1)));
}

// ============================================================
// Chat
// ============================================================
async function handleChat(text) {
  if (chatBusy || !text.trim()) return;
  chatBusy = true;
  promptEl.disabled = true;
  sendEl.disabled = true;
  promptEl.placeholder = 'thinking...';

  const userText = text.trim();
  promptEl.value = '';

  // Show user message briefly
  speech.show(userText, { type: 'user', duration: 2 });

  lastInteractionTime = performance.now();
  idle.onUserInteraction();

  // Fish swims toward center and enters talking state.
  // We don't yet know how long the response will be, so use the cap (28s)
  // and refresh once the actual response arrives.
  const swim = bowl.getSwimBounds();
  movement.setTarget(swim.cx, swim.cy);
  fsm.transition(STATES.TALKING, { duration: 30, priority: 3 });

  // Wait for user bubble to show, then generate
  await new Promise(r => setTimeout(r, 1500));

  let response;
  try {
    response = await model.generate(userText);
  } catch (err) {
    console.error('Generate failed:', err);
    response = 'blub... i got confused';
  }

  const replyText = response || 'blub?';

  // Show fish response, and re-sync FSM TALKING window to the actual reply length
  speech.show(replyText, { type: 'fish' });
  fsm.transition(STATES.TALKING, { duration: speechDuration(replyText) + 1, priority: 3 });

  // Post-chat state transition
  const roll = Math.random();
  const postState = roll < 0.5 ? STATES.HAPPY : roll < 0.8 ? STATES.FORGETTING : STATES.EXCITED;
  fsm.transition(postState, { duration: 2, priority: 2 });

  idle.onChatComplete();

  // Re-enable input
  chatBusy = false;
  promptEl.disabled = false;
  sendEl.disabled = false;
  promptEl.placeholder = 'say something to the goldfish...';
  promptEl.focus();
}

// ============================================================
// Click/touch handling
// ============================================================
let pointerDownTime = 0;
let pointerDownPos = null;
let clickCount = 0;
let clickTimer = null;

function setupInput() {
  const el = canvas.el;

  // Cursor tracking - fish looks at mouse when hovering near the bowl
  el.addEventListener('pointermove', (e) => {
    const pos = canvas.screenToInternal(e.clientX, e.clientY);
    movement.setCursor(pos.x, pos.y);
  });

  el.addEventListener('pointerleave', () => {
    movement.setCursor(null, null);
  });

  el.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    pointerDownTime = performance.now();
    pointerDownPos = canvas.screenToInternal(e.clientX, e.clientY);
  });

  el.addEventListener('pointerup', (e) => {
    e.preventDefault();
    if (!pointerDownPos) return;
    const pos = canvas.screenToInternal(e.clientX, e.clientY);
    const hold = (performance.now() - pointerDownTime) / 1000;
    pointerDownPos = null;

    lastInteractionTime = performance.now();
    idle.onUserInteraction();

    if (fsm.currentState === STATES.SLEEPING) {
      fsm.transition(STATES.EXCITED, { duration: 1.5, priority: 3 });
      return;
    }

    const fs = getFishSize();
    const hitFish = Math.abs(pos.x - movement.x) < fs * 0.6
                 && Math.abs(pos.y - movement.y) < fs * 0.6;

    if (hitFish) {
      splash.burst(movement.x, movement.y, 10);
      if (hold > 0.5) {
        fsm.transition(STATES.HAPPY, { duration: 2.5, priority: 3 });
      } else {
        clickCount++;
        if (clickTimer) clearTimeout(clickTimer);
        clickTimer = setTimeout(() => {
          if (clickCount >= 2) {
            fsm.transition(STATES.EXCITED, { duration: 1.5, priority: 3 });
            splash.burst(movement.x, movement.y, 14);
          } else {
            startSpiral();
            fsm.transition(STATES.WIGGLING, { duration: SPIRAL_DURATION + 0.2, priority: 3 });
          }
          clickCount = 0;
        }, 250);
      }
    } else if (bowl.isInSwimBounds(pos.x, pos.y)) {
      splash.burst(pos.x, pos.y, 6);
    }
  });

  el.addEventListener('contextmenu', (e) => e.preventDefault());

  // Chat input
  const form = (e) => { e.preventDefault?.(); handleChat(promptEl.value); };
  sendEl.addEventListener('click', form);
  promptEl.addEventListener('keydown', (e) => { if (e.key === 'Enter') form(e); });
}

function prefersReducedMotion() {
  return window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
}

function startSpiral() {
  // Decorative effect - skip entirely when user asked for reduced motion.
  if (prefersReducedMotion()) {
    splash.burst(movement.x, movement.y, 6);
    return;
  }
  spiralActive = true;
  spiralAngle = 0;
  spiralTimer = 0;
  spiralCx = movement.x;
  spiralCy = movement.rawY;
  movement.pause(SPIRAL_DURATION + 0.3);
}

// ============================================================
// Settings panel
// ============================================================
function setupSettings() {
  notifFreqEl.value = String(SETTINGS.notifFreq);
  fishNameEl.value = SETTINGS.fishName;

  settingsBtn.addEventListener('click', () => {
    settingsPanel.classList.remove('hidden');
    // Move keyboard focus into the dialog for screen reader / keyboard users.
    setTimeout(() => settingsClose.focus(), 0);
  });

  function closeSettings() {
    settingsPanel.classList.add('hidden');
    saveSettings();
    settingsBtn.focus();  // return focus to the trigger
  }

  settingsClose.addEventListener('click', closeSettings);

  document.getElementById('settings-close')?.addEventListener('click', closeSettings);

  settingsPanel.addEventListener('click', (e) => {
    if (e.target === settingsPanel) closeSettings();
  });

  // ESC closes the settings dialog when open (standard dialog UX)
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !settingsPanel.classList.contains('hidden')) {
      e.preventDefault();
      closeSettings();
    }
  });

  notifFreqEl.addEventListener('change', async () => {
    SETTINGS.notifFreq = parseInt(notifFreqEl.value);
    localStorage.setItem('glub_notif_freq', String(SETTINGS.notifFreq));
    if (SETTINGS.notifFreq > 0) {
      await requestNotifPermissionAndStart();
    } else {
      stopNotifications();
    }
  });

  fishNameEl.addEventListener('change', () => {
    SETTINGS.fishName = fishNameEl.value.trim();
    localStorage.setItem('glub_fish_name', SETTINGS.fishName);
  });
}

function saveSettings() {
  localStorage.setItem('glub_notif_freq', String(SETTINGS.notifFreq));
  localStorage.setItem('glub_fish_name', SETTINGS.fishName);
}

// ============================================================
// PWA install prompt
// ============================================================
function setupInstallPrompt() {
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredInstallPrompt = e;
  });

  window.addEventListener('appinstalled', () => {
    SETTINGS.installed = true;
    localStorage.setItem('glub_installed', '1');
    installBanner.classList.add('hidden');
    // Fish celebrates
    setTimeout(() => {
      speech.show('i live here now!', { type: 'fish', duration: 4 });
      fsm.transition(STATES.EXCITED, { duration: 2, priority: 3 });
    }, 500);
  });

  installBtn.addEventListener('click', async () => {
    if (!deferredInstallPrompt) return;
    installBanner.classList.add('hidden');
    deferredInstallPrompt.prompt();
    await deferredInstallPrompt.userChoice;
    deferredInstallPrompt = null;
  });

  installDismiss.addEventListener('click', () => {
    installBanner.classList.add('hidden');
    SETTINGS.installDismissed = true;
    localStorage.setItem('glub_install_dismissed', '1');
  });
}

function isIos() {
  return /iP(hone|ad|od)/.test(navigator.userAgent) && !window.navigator.standalone;
}

function maybeShowInstallBanner() {
  if (SETTINGS.installed || SETTINGS.installDismissed) return;
  // Don't pester users when model failed - they have a bigger problem
  if (modelLoadFailed) return;
  // Cap to 3 shows total; after that, the user clearly isn't interested
  if (SETTINGS.installShowCount >= 3) return;

  function bumpShowCount() {
    SETTINGS.installShowCount++;
    localStorage.setItem('glub_install_show_count', String(SETTINGS.installShowCount));
  }

  // iOS: beforeinstallprompt doesn't exist, show manual instructions
  if (isIos()) {
    iosInstallDismiss.addEventListener('click', () => {
      iosInstallBanner.classList.add('hidden');
      SETTINGS.installDismissed = true;
      localStorage.setItem('glub_install_dismissed', '1');
    });
    setTimeout(() => {
      iosInstallBanner.classList.remove('hidden');
      bumpShowCount();
    }, 15000);
    return;
  }

  // Chromium: use beforeinstallprompt API
  if (!deferredInstallPrompt) return;
  setTimeout(() => {
    if (deferredInstallPrompt) {
      installBanner.classList.remove('hidden');
      bumpShowCount();
    }
  }, 15000);
}

// ============================================================
// Notifications
// ============================================================
async function setupNotifications() {
  if (!('Notification' in window) || !navigator.serviceWorker) return;

  // If user already enabled notifications and permission is granted, start
  if (SETTINGS.notifFreq > 0 && Notification.permission === 'granted') {
    startNotifications();
  }

  // Listen for visibility changes to trigger notification timer on background
  document.addEventListener('visibilitychange', () => {
    if (document.hidden && SETTINGS.notifFreq > 0 && Notification.permission === 'granted') {
      startNotifications();
    }
  });
}

async function requestNotifPermissionAndStart() {
  if (!('Notification' in window)) return;
  if (Notification.permission === 'default') {
    const result = await Notification.requestPermission();
    if (result !== 'granted') return;
  }
  if (Notification.permission !== 'granted') return;
  startNotifications();
}

function startNotifications() {
  if (!navigator.serviceWorker.controller) return;
  const notifPhrases = idle.getNotificationPhrases?.() || [];
  navigator.serviceWorker.controller.postMessage({
    type: 'start-notifications',
    frequency: SETTINGS.notifFreq,
    phrases: notifPhrases,
  });
}

function stopNotifications() {
  if (!navigator.serviceWorker.controller) return;
  navigator.serviceWorker.controller.postMessage({ type: 'stop-notifications' });
}

// ============================================================
// Render loop
// ============================================================
function render(dt) {
  const ctx = canvas.ctx;
  const w = canvas.width;
  const h = canvas.height;

  sprites.update(dt);
  fsm.update(dt);
  bubbles.update(dt);
  splash.update(dt);
  speech.update(dt);
  dissolve.update(dt);

  // Spiral override
  if (spiralActive) {
    spiralTimer += dt;
    spiralAngle += dt * 14;
    const r = SPIRAL_RADIUS * (1 - (spiralTimer / SPIRAL_DURATION) * 0.5);
    movement._x = spiralCx + Math.cos(spiralAngle) * r;
    movement._y = spiralCy + Math.sin(spiralAngle) * r;
    if (Math.random() < 0.3) splash.burst(movement._x, movement._y, 1);
    if (spiralTimer >= SPIRAL_DURATION) {
      spiralActive = false;
      movement._x = spiralCx;
      movement._y = spiralCy;
    }
  } else {
    movement.update(dt);
  }

  // Random events
  if (fsm.currentState === STATES.IDLE) {
    randomEventTimer += dt;
    if (randomEventTimer >= nextRandomEvent) {
      randomEventTimer = 0;
      nextRandomEvent = 12 + Math.random() * 25;
      const ev = pickRandomEvent();
      if (ev.state !== STATES.BUMPING || movement.isAtEdge) {
        fsm.transition(ev.state, { duration: ev.duration, priority: 1 });
      }
    }
  }

  // Idle phrases
  if (fsm.currentState === STATES.IDLE && !speech.isVisible) {
    const phrase = idle.update(dt);
    if (phrase) {
      speech.show(phrase.text, { type: 'fish' });
      fsm.transition(STATES.TALKING, {
        duration: speechDuration(phrase.text),
        priority: 2,
        onComplete: () => {
          if (Math.random() < 0.3) {
            setTimeout(() => fsm.transition(STATES.FORGETTING, { duration: 2, priority: 1 }), 500);
          }
        },
      });
    }
  }

  // Sleep check - fish sleeps only at night (22:00 - 06:00 local time)
  // During daytime, even long idle stays awake.
  sleepCheckTimer += dt;
  if (sleepCheckTimer > 5) {
    sleepCheckTimer = 0;
    const hour = new Date().getHours();
    const isNight = hour >= 22 || hour < 6;
    const silence = (performance.now() - lastInteractionTime) / 1000;

    // Only fall asleep if it's night AND inactive
    if (isNight && silence > SLEEP_TIMEOUT && fsm.currentState === STATES.IDLE) {
      fsm.transition(STATES.SLEEPING, { duration: Infinity, priority: 0 });
      const swim = bowl.getSwimBounds();
      movement.setTarget(swim.cx, swim.cy + swim.ry * 0.6);
    }

    // Wake up automatically when day comes (if the fish is still sleeping
    // from last night and the tab has been open through to morning)
    if (!isNight && fsm.currentState === STATES.SLEEPING) {
      fsm.transition(STATES.HAPPY, { duration: 2, priority: 3 });
      setTimeout(() => {
        speech.show('good morning!', { type: 'fish', duration: 3 });
      }, 500);
    }
  }

  // ---- Render to pixel buffer ----
  bowl.render(ctx, dt);
  bubbles.render(ctx);
  const fs = getFishSize();
  sprites.render(ctx, movement.x, movement.y, fs, !movement.facingRight, movement.getEyeLook());
  splash.render(ctx);

  // Blit to screen
  canvas.present();

  // Speech bubble at screen resolution (after present)
  const fishScreen = canvas.internalToScreen(movement.x, movement.y);
  speech.render(canvas.screenCtx, fishScreen.x, fishScreen.y, canvas.screenWidth, canvas.screenHeight);

  // Dissolve particles - rendered on screen ctx AFTER speech bubble
  // (so they appear as the words dispersing into the water)
  if (dissolve.hasParticles) {
    dissolve.render(canvas.screenCtx);
  }
}

// ============================================================
// Bootstrap
// ============================================================
async function init() {
  const canvasEl = document.getElementById('bowl');
  loadingEl = document.getElementById('loading');
  statusEl = document.getElementById('load-status');
  progressEl = document.getElementById('progress-fill');
  promptEl = document.getElementById('prompt');
  sendEl = document.getElementById('send');
  chatInputEl = document.getElementById('chat-input');
  settingsBtn = document.getElementById('settings-btn');
  settingsPanel = document.getElementById('settings-panel');
  settingsClose = document.getElementById('settings-done');
  notifFreqEl = document.getElementById('notif-freq');
  fishNameEl = document.getElementById('fish-name');
  installBanner = document.getElementById('install-banner');
  installBtn = document.getElementById('install-btn');
  installDismiss = document.getElementById('install-dismiss');
  iosInstallBanner = document.getElementById('ios-install-banner');
  iosInstallDismiss = document.getElementById('ios-install-dismiss');

  // -----------------------------------------------------------
  // PRIORITY ZERO: get the fish rendering on screen ASAP.
  // Everything async (SW register, model load, notifications) happens
  // AFTER the render loop is running so user never sees a blank page.
  // -----------------------------------------------------------

  // Create engine systems synchronously
  canvas = new CanvasManager(canvasEl);
  bowl = new Bowl(canvas);
  bubbles = new BubbleSystem(bowl);
  splash = new SplashSystem();
  sprites = new SpriteEngine();
  movement = new FishMovement(bowl);
  fsm = new FishStateMachine(sprites, movement);
  speech = new SpeechBubble();
  dissolve = new DissolveSystem();
  idle = new IdleScheduler(speech, fsm);
  model = new OnnxModel();

  // When a fish bubble fades out, burst dissolve particles from its rect
  speech.onFadeOutStart((rect) => {
    if (rect) {
      dissolve.burst(rect.cx, rect.cy, rect.w, rect.h, 18);
    }
  });

  setupInput();
  setupSettings();
  setupInstallPrompt();

  // Start render loop IMMEDIATELY - fish visible within first frame
  updateProgress(0, 'adopting goldfish');
  canvas.startLoop(render);

  // Load idle phrases in parallel (non-blocking)
  idle.loadPhrases('./data/idle-phrases.json');

  // Register service worker in parallel (non-blocking - don't await!)
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('./sw.js').catch((e) => {
      console.warn('SW registration failed:', e);
    });
    navigator.serviceWorker.addEventListener('message', (e) => {
      if (e.data?.type === 'model-download-progress') {
        const pct = e.data.total > 0 ? Math.round((e.data.received / e.data.total) * 100) : 0;
        updateProgress(pct, 'adopting goldfish');
      }
    });
  }

  // Greeting - fish says hello early (doesn't wait for model)
  setTimeout(() => {
    speech.show('glub!', { type: 'fish', duration: 3 });
    fsm.transition(STATES.HAPPY, { duration: 2, priority: 2 });
  }, 600);

  // Load ONNX model in background (parallel to everything else)
  try {
    await model.load('./model.onnx', './tokenizer.json', (stage, pct) => {
      if (stage === 'downloading') {
        updateProgress(pct, 'adopting goldfish');
      } else if (stage === 'loading') {
        updateProgress(100, 'waking up the goldfish');
      }
    });

    updateProgress(100, 'glub!');
    // Enable chat
    promptEl.disabled = false;
    sendEl.disabled = false;
    chatInputEl.classList.remove('hidden');
    settingsBtn.classList.remove('hidden');

    // First-run onboarding: show 3 hints to new users
    if (shouldShowOnboarding()) {
      runOnboarding().catch(err => console.warn('onboarding failed:', err));
    }
  } catch (e) {
    modelLoadFailed = true;
    updateProgress(0, 'glub (offline mode) - refresh to retry');
    settingsBtn.classList.remove('hidden');
    console.error('Model load failed:', e);
  }

  // Notifications (if previously enabled + permission granted)
  setupNotifications();

  // Show install banner on third visit if not dismissed
  maybeShowInstallBanner();

  // Hide loading overlay after a beat (but fish has been visible the whole time).
  // On model load failure, keep the overlay visible so the user sees the error message.
  if (!modelLoadFailed) {
    setTimeout(() => {
      loadingEl.classList.add('fade-out');
      setTimeout(() => { loadingEl.style.display = 'none'; }, 500);
    }, 400);
  }
}

document.addEventListener('DOMContentLoaded', init);

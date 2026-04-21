// Onboarding tutorial for desk-pet - Cluster B extended version.
// v1 flag -> v2 migration: existing v1 users see new tutorial once.
// HINTS: each with id/text/duration/target/demo.

const FLAG_V1 = 'glub_onboarded_v1';
const FLAG_V2 = 'glub_onboarded_v2';

export function shouldShowOnboarding() {
  const ls = globalThis.localStorage;
  if (!ls) return false;
  return ls.getItem(FLAG_V2) !== '1';
}

export function markOnboarded() {
  const ls = globalThis.localStorage;
  if (ls) ls.setItem(FLAG_V2, '1');
}

// HINTS structure - target() is resolved per-tick during the pulse loop.
// demo() is an async function invoked once per hint (can fire haptic + FSM transition + speech).
// All injected lazily via setDeps() to keep onboarding.js test-friendly.

let _deps = {
  haptic: null,
  sound: null,
  speech: null,
  fsm: null,
  STATES: null,
  getFishRect: null, // () => DOMRect screen-space
};

export function setDeps(deps) {
  _deps = { ..._deps, ...deps };
}

export const HINTS = [
  {
    id: 'tap',
    text: 'tap the fish',
    duration: 3000,
    target: () => (_deps.getFishRect ? _deps.getFishRect() : null),
    demo: async () => {
      if (_deps.haptic) _deps.haptic.pulse('tap_fish');
      // spiral swim is visual only - triggered via FSM or dedicated API if available
      if (_deps.fsm && _deps.STATES) {
        _deps.fsm.transition(_deps.STATES.EXCITED, { duration: 0.6, priority: 3 });
      }
    },
  },
  {
    id: 'hold',
    text: 'hold for happy',
    duration: 3000,
    target: () => (_deps.getFishRect ? _deps.getFishRect() : null),
    demo: async () => {
      if (_deps.haptic) _deps.haptic.pulse('long_press_happy');
      if (_deps.fsm && _deps.STATES) {
        _deps.fsm.transition(_deps.STATES.HAPPY, { duration: 2, priority: 3 });
      }
    },
  },
  {
    id: 'type',
    text: 'type to chat',
    duration: 3500,
    target: () => {
      const el = globalThis.document?.querySelector?.('#chat-input');
      return el ? el.getBoundingClientRect() : null;
    },
    demo: async () => {
      if (_deps.haptic) _deps.haptic.pulse('chat_send');
      if (_deps.speech) _deps.speech.show("hi there! i'm glub.", { type: 'fish', duration: 3 });
    },
  },
];

function sleep(ms, signal) {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(new DOMException('Aborted', 'AbortError'));
    const t = setTimeout(resolve, ms);
    signal?.addEventListener('abort', () => { clearTimeout(t); reject(new DOMException('Aborted', 'AbortError')); }, { once: true });
  });
}

function setCuePosition(cue, rect) {
  if (!cue || !rect) return;
  const size = Math.max(48, Math.max(rect.width, rect.height) + 16);
  cue.style.left = `${rect.left + rect.width / 2 - size / 2}px`;
  cue.style.top = `${rect.top + rect.height / 2 - size / 2}px`;
  cue.style.width = `${size}px`;
  cue.style.height = `${size}px`;
}

function prefersReducedMotion() {
  if (typeof globalThis.matchMedia !== 'function') return false;
  return !!globalThis.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

export async function runOnboarding({ signal } = {}) {
  const doc = globalThis.document;
  const overlay = doc?.getElementById?.('onboarding-overlay');
  const cue = doc?.getElementById?.('onboarding-cue');
  const textEl = doc?.querySelector?.('.onboarding-text');
  const reduced = prefersReducedMotion();

  if (overlay) overlay.classList?.add('visible');
  if (cue) cue.classList?.[reduced ? 'add' : 'remove']('hidden');

  try {
    for (const hint of HINTS) {
      if (signal?.aborted) break;
      if (textEl) textEl.textContent = hint.text;

      // position pulsing cue + start polling (100ms) to keep it on-target
      let pollTimer = null;
      if (!reduced && cue) {
        const update = () => setCuePosition(cue, hint.target());
        update();
        pollTimer = setInterval(update, 100);
      }

      try {
        if (!reduced) {
          // Kick off scripted demo (fire-and-forget; errors swallowed)
          hint.demo?.().catch(() => {});
        }
        await sleep(reduced ? 2000 : hint.duration, signal);
      } finally {
        if (pollTimer) clearInterval(pollTimer);
      }
    }
  } catch (err) {
    if (err?.name !== 'AbortError') throw err;
  } finally {
    if (overlay) overlay.classList?.remove('visible');
    if (cue) cue.classList?.add('hidden');
    markOnboarded();
  }
}

export function showTutorial() {
  // implemented in Task 9
  runOnboarding();
}

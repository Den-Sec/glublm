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

// Runtime (overlay + pulsing cue + loop) lives in later task - stub for now:
export function runOnboarding() {
  // implemented in Task 8
  markOnboarded();
}

export function showTutorial() {
  // implemented in Task 9
  runOnboarding();
}

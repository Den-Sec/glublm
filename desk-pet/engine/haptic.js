// HapticEngine - navigator.vibrate wrapper for desk-pet engagement layer.
// 5 presets, short pulses (<200ms total budget), respects reduced-motion.

export const PRESET_IDS = [
  'tap_fish',
  'long_press_happy',
  'double_excited',
  'splash_click',
  'chat_send',
];

const PATTERNS = {
  tap_fish: [10],
  long_press_happy: [20],
  double_excited: [40, 30, 40],
  splash_click: [10],
  chat_send: [10],
};

export class HapticEngine {
  constructor({ enabled = true } = {}) {
    this._enabled = !!enabled;
    const nav = globalThis.navigator;
    this._hasHaptic = !!(nav && typeof nav.vibrate === 'function');

    // reduced-motion via matchMedia
    this._reducedMotion = false;
    if (typeof globalThis.matchMedia === 'function') {
      const mql = globalThis.matchMedia('(prefers-reduced-motion: reduce)');
      this._reducedMotion = !!mql.matches;
      const onChange = (e) => { this._reducedMotion = !!e.matches; };
      if (typeof mql.addEventListener === 'function') {
        mql.addEventListener('change', onChange);
      } else if (typeof mql.addListener === 'function') {
        mql.addListener(onChange); // legacy Safari
      }
    }
  }

  get enabled() { return this._enabled; }
  get hasHaptic() { return this._hasHaptic; }

  setEnabled(on) { this._enabled = !!on; }

  pulse(presetId) {
    if (!PRESET_IDS.includes(presetId)) {
      throw new Error(`Unknown haptic preset: ${presetId}`);
    }
    if (!this._hasHaptic) return false;
    if (!this._enabled) return false;
    if (this._reducedMotion) return false;
    const pattern = PATTERNS[presetId];
    try { globalThis.navigator.vibrate(pattern); return true; }
    catch { return false; }
  }
}

let _instance = null;
export function getHaptic(opts) {
  if (!_instance) _instance = new HapticEngine(opts);
  return _instance;
}

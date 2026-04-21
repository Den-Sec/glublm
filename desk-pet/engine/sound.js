// SoundEngine - procedural Web Audio API synthesizer for desk-pet engagement layer.
// 6 oscillator presets, chiptune-style, on-brand with GBA pixel-art aesthetic.

export class SoundEngine {
  constructor({ enabled = true } = {}) {
    this._enabled = !!enabled;
    this._ctx = null;
    this._master = null;
    this._unlocked = false;
    this._hasAudio = (typeof globalThis.AudioContext !== 'undefined') ||
                     (typeof globalThis.webkitAudioContext !== 'undefined');
    this._lastPlayAt = new Map();
  }

  get enabled() { return this._enabled; }
  get hasAudio() { return this._hasAudio; }
  get isUnlocked() { return this._unlocked; }

  setEnabled(on) {
    this._enabled = !!on;
    if (!this._enabled && this._master) {
      try { this._master.disconnect(); } catch {}
    } else if (this._enabled && this._master && this._ctx) {
      try { this._master.connect(this._ctx.destination); } catch {}
    }
  }

  unlock() {
    if (!this._hasAudio || this._ctx) return;
    const Ctor = globalThis.AudioContext || globalThis.webkitAudioContext;
    this._ctx = new Ctor();
    this._master = this._ctx.createGain();
    this._master.gain.value = 0.7;
    this._master.connect(this._ctx.destination);
    this._ctx.resume().then(() => { this._unlocked = true; }, () => { /* policy reject, stay locked */ });
  }

  play(_presetId) {
    // implemented in later tasks
    return false;
  }
}

// Singleton factory. Consumers import `sound` and call `sound.unlock()` on first gesture.
let _instance = null;
export function getSound(opts) {
  if (!_instance) _instance = new SoundEngine(opts);
  return _instance;
}

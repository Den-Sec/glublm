// SoundEngine - procedural Web Audio API synthesizer for desk-pet engagement layer.
// 6 oscillator presets, chiptune-style, on-brand with GBA pixel-art aesthetic.

export const PRESET_IDS = [
  'bubble_pop',
  'splash_click',
  'nom_nom_eat',
  'forget_glub',
  'chat_send',
  'excited_celebration',
];

// envelope + oscillator scheduling helper
function scheduleTone(ctx, master, {
  wave = 'sine',
  freq = 440,
  freqRamp = null,   // optional { to, durationSec }
  attack = 0.005, decay = 0.04, sustain = 0.3, release = 0.05,
  volume = 0.2,
  duration = 0.12,
  startOffset = 0,
}) {
  const t0 = ctx.currentTime + startOffset;
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0, t0);
  gain.gain.linearRampToValueAtTime(volume, t0 + attack);
  gain.gain.linearRampToValueAtTime(volume * sustain, t0 + attack + decay);
  gain.gain.linearRampToValueAtTime(0, t0 + duration + release);
  gain.connect(master);

  const osc = ctx.createOscillator();
  osc.type = wave;
  osc.frequency.setValueAtTime(freq, t0);
  if (freqRamp) osc.frequency.linearRampToValueAtTime(freqRamp.to, t0 + freqRamp.durationSec);
  osc.connect(gain);
  osc.start(t0);
  osc.stop(t0 + duration + release + 0.02);
  osc.onended = () => { try { osc.disconnect(); gain.disconnect(); } catch {} };
  return osc;
}

const PRESETS = {
  bubble_pop(ctx, master) {
    const rand = (Math.random() - 0.5) * 160; // +-80 Hz
    scheduleTone(ctx, master, {
      wave: 'sine',
      freq: 800 + rand,
      attack: 0.005, decay: 0.08, sustain: 0.2, release: 0.035,
      volume: 0.15,
      duration: 0.12,
    });
  },
  // other presets added in Task 4
};

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
    this._unlocked = true;
    this._ctx.resume().then(() => { this._unlocked = true; }, () => { /* policy reject, stay locked */ });
  }

  play(presetId) {
    if (!this._enabled || !this._unlocked || !this._ctx || !this._master) return false;
    const fn = PRESETS[presetId];
    if (!fn) {
      if (!PRESET_IDS.includes(presetId)) throw new Error(`Unknown sound preset: ${presetId}`);
      return false; // declared but not yet implemented
    }
    fn(this._ctx, this._master);
    return true;
  }
}

// Singleton factory. Consumers import `sound` and call `sound.unlock()` on first gesture.
let _instance = null;
export function getSound(opts) {
  if (!_instance) _instance = new SoundEngine(opts);
  return _instance;
}

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

const THROTTLE_MS = {
  bubble_pop: 500,
};

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

// white-noise burst through a high-pass filter (for splash/click textures)
function scheduleNoiseBurst(ctx, master, {
  hpFreq = 4000,
  attack = 0.002, decay = 0.06, sustain = 0.15, release = 0.118,
  volume = 0.2,
  duration = 0.18,
}) {
  const t0 = ctx.currentTime;
  // generate white noise buffer (0.2s at current sample rate)
  const bufLen = Math.ceil(ctx.sampleRate * Math.max(0.2, duration + release + 0.02));
  const buf = ctx.createBuffer(1, bufLen, ctx.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < bufLen; i++) data[i] = Math.random() * 2 - 1;

  const src = ctx.createBufferSource();
  src.buffer = buf;

  const filter = ctx.createBiquadFilter();
  filter.type = 'highpass';
  filter.frequency.setValueAtTime(hpFreq, t0);

  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0, t0);
  gain.gain.linearRampToValueAtTime(volume, t0 + attack);
  gain.gain.linearRampToValueAtTime(volume * sustain, t0 + attack + decay);
  gain.gain.linearRampToValueAtTime(0, t0 + duration + release);

  src.connect(filter);
  filter.connect(gain);
  gain.connect(master);
  src.start(t0);
  src.stop(t0 + duration + release + 0.02);
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
  splash_click(ctx, master) {
    scheduleNoiseBurst(ctx, master, {
      hpFreq: 4000,
      attack: 0.002, decay: 0.06, sustain: 0.15, release: 0.118,
      volume: 0.2,
      duration: 0.18,
    });
  },
  nom_nom_eat(ctx, master) {
    const freqs = [200, 180, 160];
    const gap = 0.04; // 40 ms gap between bursts
    const burst = 0.065; // 65 ms per burst (5/40/0.1/20 env totals ~65ms)
    freqs.forEach((f, i) => {
      scheduleTone(ctx, master, {
        wave: 'square',
        freq: f,
        attack: 0.005, decay: 0.04, sustain: 0.1, release: 0.02,
        volume: 0.18,
        duration: burst,
        startOffset: i * (burst + gap),
      });
    });
  },
  forget_glub(ctx, master) {
    scheduleTone(ctx, master, {
      wave: 'triangle',
      freq: 600,
      freqRamp: { to: 300, durationSec: 0.3 },
      attack: 0.03, decay: 0.12, sustain: 0.3, release: 0.15,
      volume: 0.22,
      duration: 0.3,
    });
  },
  chat_send(ctx, master) {
    scheduleTone(ctx, master, {
      wave: 'sine',
      freq: 880, // A5
      attack: 0.002, decay: 0.03, sustain: 0.4, release: 0.068,
      volume: 0.18,
      duration: 0.1,
    });
  },
  excited_celebration(ctx, master) {
    // C5-E5-G5 arpeggio
    const notes = [523.25, 659.25, 783.99];
    const per = 0.15; // 150ms slot
    const gap = 0.02;
    notes.forEach((f, i) => {
      scheduleTone(ctx, master, {
        wave: 'triangle',
        freq: f,
        attack: 0.01, decay: 0.06, sustain: 0.3, release: 0.08,
        volume: 0.25,
        duration: per - gap,
        startOffset: i * per,
      });
    });
  },
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
    const throttle = THROTTLE_MS[presetId];
    if (throttle) {
      const last = this._lastPlayAt.get(presetId) ?? 0;
      const now = Date.now();
      if (now - last < throttle) return false;
      this._lastPlayAt.set(presetId, now);
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

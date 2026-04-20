# GlubLM Cluster B - Engagement Layer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

> **Spec:** [`../specs/2026-04-20-cluster-b-engagement-design.md`](../specs/2026-04-20-cluster-b-engagement-design.md)

**Goal:** Add audio feedback (6 procedural chiptune presets via Web Audio API), haptic feedback (5 presets via `navigator.vibrate`), and an extended onboarding tutorial (pulsing cue + scripted demo + replay) to the Desk Pet PWA.

**Architecture:** Two new feature-isolated modules (`engine/sound.js`, `engine/haptic.js`), extend `engine/onboarding.js`, wire call-sites in `app.js` + `bubbles.js` + `speech.js`, extend settings UI in `index.html`/`style.css`, bump SW cache version. All changes scoped to `desk-pet/` directory. Mirror existing `engine/*.js` pattern (one module, one purpose, direct call-site). No event bus, no god-module.

**Tech Stack:** Vanilla ES modules, Web Audio API, `navigator.vibrate`, Node.js 20+ built-in test runner (`node --test`), no new runtime dependencies.

---

## File structure

**NEW files (6):**

| Path | Responsibility |
|---|---|
| `desk-pet/engine/sound.js` | SoundEngine class, 6 oscillator presets, AudioContext lifecycle, throttling |
| `desk-pet/engine/haptic.js` | HapticEngine class, 5 vibrate presets, feature detect, reduced-motion |
| `desk-pet/engine/test-stubs.js` | Shared test utility: stubs for AudioContext, navigator.vibrate, matchMedia, localStorage |
| `desk-pet/engine/sound.test.js` | Unit tests for SoundEngine |
| `desk-pet/engine/haptic.test.js` | Unit tests for HapticEngine |
| `desk-pet/engine/onboarding.test.js` | Unit tests for onboarding migration + HINTS + replay |

**MODIFIED files (7):**

| Path | Changes |
|---|---|
| `desk-pet/engine/onboarding.js` | Replace 50 lines -> ~150 lines: v1->v2 migration, HINTS with targets+demos, pulsing cue positioning, AbortController, showTutorial replay API |
| `desk-pet/engine/bubbles.js` | Add `sound.play('bubble_pop')` on spawn |
| `desk-pet/engine/speech.js` | Add `sound.play('forget_glub')` on fadeOut entry |
| `desk-pet/index.html` | +2 checkbox (audio, haptic) + replay button inside settings panel; +`<div id="onboarding-cue">` inside onboarding-overlay |
| `desk-pet/style.css` | +`.onboarding-cue` + `@keyframes onboardingPulse` + `body[data-no-audio]` hide + `prefers-reduced-motion` overrides |
| `desk-pet/app.js` | Import sound/haptic, extend SETTINGS + setupSettings, wire call-sites (fish tap/long-press/double-click/water/chat), FSM onStateChange listener, first-gesture unlock |
| `desk-pet/sw.js` | CACHE_VERSION `glub-v6` -> `glub-v7`, add sound.js + haptic.js to STATIC_ASSETS |

**Note on test location:** Spec mentioned `desk-pet/tests/` directory. Existing codebase pattern (see `desk-pet/inference/tokenizer.test.js` colocated with `tokenizer.js`) is sibling-colocated test files. This plan follows the existing pattern for consistency.

---

## Task 1: Test stub infrastructure

**Goal:** Create the shared test-stubs module that stubs browser-only APIs (AudioContext, navigator.vibrate, matchMedia, localStorage) for Node.js unit tests. Verify `node --test` works on this codebase.

**Files:**
- Create: `desk-pet/engine/test-stubs.js`

- [ ] **Step 1: Create the stubs module**

Create `desk-pet/engine/test-stubs.js`:

```javascript
// Test stubs for browser-only APIs so modules can be unit-tested in Node.
// Install before importing the module under test. Reset between tests.

class MockGainNode {
  constructor() {
    this.gain = { value: 1, setValueAtTime: () => {}, linearRampToValueAtTime: () => {}, exponentialRampToValueAtTime: () => {} };
    this._connectedTo = null;
    this._disconnected = false;
  }
  connect(dst) { this._connectedTo = dst; return dst; }
  disconnect() { this._disconnected = true; this._connectedTo = null; }
}

class MockOscillator {
  constructor() {
    this.frequency = { value: 440, setValueAtTime: () => {}, linearRampToValueAtTime: () => {} };
    this.type = 'sine';
    this.started = false;
    this.stopped = false;
    this._onended = null;
  }
  connect(dst) { return dst; }
  disconnect() {}
  start() { this.started = true; }
  stop() { this.stopped = true; if (this._onended) this._onended(); }
  set onended(fn) { this._onended = fn; }
  get onended() { return this._onended; }
}

class MockBufferSource {
  constructor() { this.buffer = null; this.started = false; }
  connect(dst) { return dst; }
  disconnect() {}
  start() { this.started = true; }
  stop() {}
}

class MockBuffer {
  constructor(channels, length, rate) {
    this.numberOfChannels = channels;
    this.length = length;
    this.sampleRate = rate;
    this._data = Array.from({ length: channels }, () => new Float32Array(length));
  }
  getChannelData(ch) { return this._data[ch]; }
}

class MockFilter {
  constructor() {
    this.type = 'lowpass';
    this.frequency = { value: 350, setValueAtTime: () => {} };
    this.Q = { value: 1 };
  }
  connect(dst) { return dst; }
  disconnect() {}
}

export class MockAudioContext {
  constructor() {
    this.state = 'suspended';
    this.currentTime = 0;
    this.sampleRate = 44100;
    this.destination = { _isDestination: true };
    this._resumeCalls = 0;
    this._oscillators = [];
  }
  resume() { this._resumeCalls++; this.state = 'running'; return Promise.resolve(); }
  createOscillator() { const o = new MockOscillator(); this._oscillators.push(o); return o; }
  createGain() { return new MockGainNode(); }
  createBiquadFilter() { return new MockFilter(); }
  createBufferSource() { return new MockBufferSource(); }
  createBuffer(channels, length, rate) { return new MockBuffer(channels, length, rate); }
  close() { this.state = 'closed'; return Promise.resolve(); }
}

// --- stubbing API ---

const _originals = {};

export function installAudioStub() {
  const registry = { count: 0, last: null };
  _originals.AudioContext = globalThis.AudioContext;
  _originals.webkitAudioContext = globalThis.webkitAudioContext;
  globalThis.AudioContext = class extends MockAudioContext {
    constructor() {
      super();
      registry.count++;
      registry.last = this;
    }
  };
  return registry;
}

export function uninstallAudioStub() {
  if ('AudioContext' in _originals) globalThis.AudioContext = _originals.AudioContext;
  if ('webkitAudioContext' in _originals) globalThis.webkitAudioContext = _originals.webkitAudioContext;
}

export function removeAudioStub() {
  _originals.AudioContext = globalThis.AudioContext;
  delete globalThis.AudioContext;
  delete globalThis.webkitAudioContext;
}

export function installHapticStub() {
  const registry = { calls: [] };
  _originals.navigator = globalThis.navigator;
  globalThis.navigator = {
    ...(globalThis.navigator ?? {}),
    vibrate(pattern) { registry.calls.push(pattern); return true; },
  };
  return registry;
}

export function removeHapticStub() {
  _originals.navigator = globalThis.navigator;
  globalThis.navigator = { ...(globalThis.navigator ?? {}) };
  delete globalThis.navigator.vibrate;
}

export function uninstallHapticStub() {
  if ('navigator' in _originals) globalThis.navigator = _originals.navigator;
}

export function installMatchMediaStub({ reducedMotion = false } = {}) {
  const listeners = [];
  const mql = {
    matches: reducedMotion,
    addEventListener(_, fn) { listeners.push(fn); },
    removeEventListener(_, fn) {
      const i = listeners.indexOf(fn);
      if (i >= 0) listeners.splice(i, 1);
    },
  };
  _originals.matchMedia = globalThis.matchMedia;
  globalThis.matchMedia = () => mql;
  return {
    setReducedMotion(v) {
      mql.matches = v;
      listeners.forEach(fn => fn({ matches: v }));
    },
  };
}

export function uninstallMatchMediaStub() {
  if ('matchMedia' in _originals) globalThis.matchMedia = _originals.matchMedia;
}

export function installLocalStorageStub(initial = {}) {
  const store = { ...initial };
  _originals.localStorage = globalThis.localStorage;
  globalThis.localStorage = {
    getItem(k) { return k in store ? store[k] : null; },
    setItem(k, v) { store[k] = String(v); },
    removeItem(k) { delete store[k]; },
    clear() { for (const k of Object.keys(store)) delete store[k]; },
  };
  return store;
}

export function uninstallLocalStorageStub() {
  if ('localStorage' in _originals) globalThis.localStorage = _originals.localStorage;
}

export function resetAllStubs() {
  uninstallAudioStub();
  uninstallHapticStub();
  uninstallMatchMediaStub();
  uninstallLocalStorageStub();
  for (const k of Object.keys(_originals)) delete _originals[k];
}
```

- [ ] **Step 2: Smoke test that node --test works**

Run from repo root: `node --test desk-pet/inference/tokenizer.test.js`

Expected: 2 tests pass (existing BPE parity oracle).

- [ ] **Step 3: Commit**

```bash
cd L:/Dennis/Projects/glublm
git add desk-pet/engine/test-stubs.js
git commit -m "test(desk-pet): add shared browser-API stub utility for unit tests"
```

---

## Task 2: SoundEngine skeleton + lifecycle

**Goal:** Create `engine/sound.js` with the SoundEngine class skeleton, feature detection, enabled state, and AudioContext lifecycle (`unlock()`, `isUnlocked`). No presets yet.

**Files:**
- Create: `desk-pet/engine/sound.js`
- Create: `desk-pet/engine/sound.test.js`

- [ ] **Step 1: Write failing tests for skeleton**

Create `desk-pet/engine/sound.test.js`:

```javascript
// Unit tests for SoundEngine. Run: node --test desk-pet/engine/sound.test.js

import { test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';

import {
  installAudioStub,
  removeAudioStub,
  resetAllStubs,
} from './test-stubs.js';

let SoundEngineModule;

async function loadModule() {
  // Cache-bust the module import so each test gets a fresh module instance
  // (ES module cache by URL; append a unique query).
  SoundEngineModule = await import('./sound.js?t=' + Math.random());
  return SoundEngineModule;
}

beforeEach(() => {
  resetAllStubs();
});

afterEach(() => {
  resetAllStubs();
});

test('SoundEngine: hasAudio true when AudioContext stub installed', async () => {
  installAudioStub();
  const { SoundEngine } = await loadModule();
  const s = new SoundEngine({ enabled: true });
  assert.equal(s.hasAudio, true);
});

test('SoundEngine: hasAudio false when no AudioContext global', async () => {
  removeAudioStub();
  const { SoundEngine } = await loadModule();
  const s = new SoundEngine({ enabled: true });
  assert.equal(s.hasAudio, false);
});

test('SoundEngine: constructor does not instantiate AudioContext', async () => {
  const registry = installAudioStub();
  const { SoundEngine } = await loadModule();
  new SoundEngine({ enabled: true });
  assert.equal(registry.count, 0);
});

test('SoundEngine: unlock() instantiates AudioContext and calls resume', async () => {
  const registry = installAudioStub();
  const { SoundEngine } = await loadModule();
  const s = new SoundEngine({ enabled: true });
  s.unlock();
  assert.equal(registry.count, 1);
  assert.equal(registry.last._resumeCalls, 1);
});

test('SoundEngine: unlock() is idempotent (second call no-op)', async () => {
  const registry = installAudioStub();
  const { SoundEngine } = await loadModule();
  const s = new SoundEngine({ enabled: true });
  s.unlock();
  s.unlock();
  assert.equal(registry.count, 1);
});

test('SoundEngine: setEnabled toggles enabled state', async () => {
  installAudioStub();
  const { SoundEngine } = await loadModule();
  const s = new SoundEngine({ enabled: true });
  assert.equal(s.enabled, true);
  s.setEnabled(false);
  assert.equal(s.enabled, false);
  s.setEnabled(true);
  assert.equal(s.enabled, true);
});
```

- [ ] **Step 2: Run tests, verify they fail**

Run: `node --test desk-pet/engine/sound.test.js`

Expected: all 6 tests FAIL with `Cannot find module './sound.js'` or similar.

- [ ] **Step 3: Implement minimal SoundEngine skeleton**

Create `desk-pet/engine/sound.js`:

```javascript
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
```

- [ ] **Step 4: Run tests, verify they pass**

Run: `node --test desk-pet/engine/sound.test.js`

Expected: 6 passed, 0 failed.

- [ ] **Step 5: Commit**

```bash
cd L:/Dennis/Projects/glublm
git add desk-pet/engine/sound.js desk-pet/engine/sound.test.js
git commit -m "feat(sound): SoundEngine skeleton + AudioContext lifecycle + unit tests"
```

---

## Task 3: SoundEngine preset registry + first preset `bubble_pop`

**Goal:** Wire the 6-preset registry and implement the first preset (`bubble_pop` - sine 800Hz ±80Hz random, 120ms) end-to-end via Web Audio API. Establish the envelope+oscillator pattern that the other 5 presets will reuse.

**Files:**
- Modify: `desk-pet/engine/sound.js`
- Modify: `desk-pet/engine/sound.test.js`

- [ ] **Step 1: Add failing tests for preset registry + bubble_pop**

Append to `desk-pet/engine/sound.test.js`:

```javascript
test('SoundEngine: preset registry includes 6 known presets', async () => {
  installAudioStub();
  const { SoundEngine, PRESET_IDS } = await loadModule();
  const expected = ['bubble_pop', 'splash_click', 'nom_nom_eat', 'forget_glub', 'chat_send', 'excited_celebration'];
  for (const id of expected) {
    assert.ok(PRESET_IDS.includes(id), `missing preset ${id}`);
  }
  assert.equal(PRESET_IDS.length, 6);
});

test('SoundEngine: play(invalid) throws with preset name', async () => {
  installAudioStub();
  const { SoundEngine } = await loadModule();
  const s = new SoundEngine({ enabled: true });
  s.unlock();
  assert.throws(() => s.play('does_not_exist'), /Unknown sound preset: does_not_exist/);
});

test('SoundEngine: play() pre-unlock is silent no-op', async () => {
  const registry = installAudioStub();
  const { SoundEngine } = await loadModule();
  const s = new SoundEngine({ enabled: true });
  const result = s.play('bubble_pop');
  assert.equal(result, false);
  assert.equal(registry.count, 0);
});

test('SoundEngine: play(bubble_pop) when enabled + unlocked creates oscillator', async () => {
  const registry = installAudioStub();
  const { SoundEngine } = await loadModule();
  const s = new SoundEngine({ enabled: true });
  s.unlock();
  const result = s.play('bubble_pop');
  assert.equal(result, true);
  assert.equal(registry.last._oscillators.length, 1);
  assert.equal(registry.last._oscillators[0].started, true);
});

test('SoundEngine: play() when disabled is silent no-op', async () => {
  const registry = installAudioStub();
  const { SoundEngine } = await loadModule();
  const s = new SoundEngine({ enabled: true });
  s.unlock();
  s.setEnabled(false);
  const result = s.play('bubble_pop');
  assert.equal(result, false);
  assert.equal(registry.last._oscillators.length, 0);
});
```

- [ ] **Step 2: Run tests, verify they fail**

Run: `node --test desk-pet/engine/sound.test.js`

Expected: new tests FAIL (PRESET_IDS not exported, play returns false for valid ids).

- [ ] **Step 3: Implement preset registry + bubble_pop**

Edit `desk-pet/engine/sound.js`. Replace the `play(_presetId)` stub and add preset definitions. Complete file after edit:

```javascript
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

// append to class SoundEngine body
export class SoundEngine {
  // ... existing constructor + enabled + hasAudio + unlock + setEnabled unchanged

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
```

**Note**: write the full `sound.js` file with both `PRESET_IDS` + helpers at module top + the SoundEngine class extended. The existing constructor/getters/setEnabled/unlock stay unchanged.

- [ ] **Step 4: Run tests, verify they pass**

Run: `node --test desk-pet/engine/sound.test.js`

Expected: 11 passed (6 original + 5 new), 0 failed.

- [ ] **Step 5: Commit**

```bash
git add desk-pet/engine/sound.js desk-pet/engine/sound.test.js
git commit -m "feat(sound): preset registry + bubble_pop with ADSR envelope"
```

---

## Task 4: SoundEngine remaining 5 presets

**Goal:** Implement the remaining 5 audio presets: `splash_click` (white-noise hi-pass), `nom_nom_eat` (3 square bursts), `forget_glub` (triangle fade ramp), `chat_send` (sine 880 Hz), `excited_celebration` (3-note triangle arpeggio).

**Files:**
- Modify: `desk-pet/engine/sound.js`
- Modify: `desk-pet/engine/sound.test.js`

- [ ] **Step 1: Add failing tests for all 5 presets**

Append to `desk-pet/engine/sound.test.js`:

```javascript
test('SoundEngine: all 6 presets callable without throw', async () => {
  const registry = installAudioStub();
  const { SoundEngine, PRESET_IDS } = await loadModule();
  const s = new SoundEngine({ enabled: true });
  s.unlock();
  for (const id of PRESET_IDS) {
    const result = s.play(id);
    assert.equal(result, true, `preset ${id} did not play`);
  }
});

test('SoundEngine: excited_celebration schedules 3 oscillators (arpeggio)', async () => {
  const registry = installAudioStub();
  const { SoundEngine } = await loadModule();
  const s = new SoundEngine({ enabled: true });
  s.unlock();
  const before = registry.last._oscillators.length;
  s.play('excited_celebration');
  // 3-note arpeggio => 3 oscillators scheduled
  assert.equal(registry.last._oscillators.length, before + 3);
});

test('SoundEngine: nom_nom_eat schedules 3 oscillators (3 bursts)', async () => {
  const registry = installAudioStub();
  const { SoundEngine } = await loadModule();
  const s = new SoundEngine({ enabled: true });
  s.unlock();
  const before = registry.last._oscillators.length;
  s.play('nom_nom_eat');
  assert.equal(registry.last._oscillators.length, before + 3);
});
```

- [ ] **Step 2: Run tests, verify they fail**

Run: `node --test desk-pet/engine/sound.test.js`

Expected: 3 new tests FAIL (presets not yet implemented).

- [ ] **Step 3: Implement remaining presets**

In `desk-pet/engine/sound.js`, extend the `PRESETS` object. Add a noise-burst helper for splash_click:

```javascript
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

// Extend PRESETS:
Object.assign(PRESETS, {
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
});
```

- [ ] **Step 4: Run tests, verify all pass**

Run: `node --test desk-pet/engine/sound.test.js`

Expected: 14 passed, 0 failed.

- [ ] **Step 5: Commit**

```bash
git add desk-pet/engine/sound.js desk-pet/engine/sound.test.js
git commit -m "feat(sound): 5 remaining presets (splash, nom_nom, forget, chat, excited)"
```

---

## Task 5: SoundEngine throttling for `bubble_pop`

**Goal:** Prevent audio cacophony when `bubbles.js` spawns multiple bubbles in a burst. Throttle `bubble_pop` to max 1 call per 500 ms window (silent drop, no queue). Other presets are user-gesture-bound and naturally rate-limited.

**Files:**
- Modify: `desk-pet/engine/sound.js`
- Modify: `desk-pet/engine/sound.test.js`

- [ ] **Step 1: Add failing test**

Append to `desk-pet/engine/sound.test.js`:

```javascript
test('SoundEngine: bubble_pop throttled to max 1 per 500ms', async () => {
  const registry = installAudioStub();
  const { SoundEngine } = await loadModule();
  const s = new SoundEngine({ enabled: true });
  s.unlock();

  // Fake clock via monkey-patch Date.now used internally
  let now = 1000;
  const origNow = Date.now;
  Date.now = () => now;

  try {
    // 3 rapid spawns in 100ms
    const r1 = s.play('bubble_pop'); now += 100;
    const r2 = s.play('bubble_pop'); now += 100;
    const r3 = s.play('bubble_pop');

    // First allowed, second + third throttled
    assert.equal(r1, true);
    assert.equal(r2, false);
    assert.equal(r3, false);

    // After 500ms window, allowed again
    now += 400; // total 600ms since first
    const r4 = s.play('bubble_pop');
    assert.equal(r4, true);
  } finally {
    Date.now = origNow;
  }
});

test('SoundEngine: other presets NOT throttled', async () => {
  const registry = installAudioStub();
  const { SoundEngine } = await loadModule();
  const s = new SoundEngine({ enabled: true });
  s.unlock();

  // 3 rapid chat_send in same tick should all succeed
  assert.equal(s.play('chat_send'), true);
  assert.equal(s.play('chat_send'), true);
  assert.equal(s.play('chat_send'), true);
});
```

- [ ] **Step 2: Run tests, verify new test fails**

Run: `node --test desk-pet/engine/sound.test.js`

Expected: throttle test FAILS (all 3 calls return true, no throttling logic).

- [ ] **Step 3: Implement throttling in play()**

In `desk-pet/engine/sound.js`, update the `play()` method:

```javascript
// At module top (near PRESETS):
const THROTTLE_MS = {
  bubble_pop: 500,
};

// In SoundEngine class:
play(presetId) {
  if (!this._enabled || !this._unlocked || !this._ctx || !this._master) return false;
  const fn = PRESETS[presetId];
  if (!fn) {
    if (!PRESET_IDS.includes(presetId)) throw new Error(`Unknown sound preset: ${presetId}`);
    return false;
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
```

- [ ] **Step 4: Run tests, verify pass**

Run: `node --test desk-pet/engine/sound.test.js`

Expected: 16 passed, 0 failed.

- [ ] **Step 5: Commit**

```bash
git add desk-pet/engine/sound.js desk-pet/engine/sound.test.js
git commit -m "feat(sound): throttle bubble_pop to 1/500ms to prevent cacophony on spawn bursts"
```

---

## Task 6: HapticEngine complete

**Goal:** Create `engine/haptic.js` with HapticEngine class, 5 vibrate presets, feature detection, and reduced-motion integration. Full implementation in one task (simpler module).

**Files:**
- Create: `desk-pet/engine/haptic.js`
- Create: `desk-pet/engine/haptic.test.js`

- [ ] **Step 1: Write failing tests**

Create `desk-pet/engine/haptic.test.js`:

```javascript
import { test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  installHapticStub,
  removeHapticStub,
  installMatchMediaStub,
  resetAllStubs,
} from './test-stubs.js';

async function loadModule() {
  return await import('./haptic.js?t=' + Math.random());
}

beforeEach(() => { resetAllStubs(); });
afterEach(() => { resetAllStubs(); });

test('HapticEngine: hasHaptic true when navigator.vibrate exists', async () => {
  installHapticStub();
  installMatchMediaStub();
  const { HapticEngine } = await loadModule();
  const h = new HapticEngine({ enabled: true });
  assert.equal(h.hasHaptic, true);
});

test('HapticEngine: hasHaptic false when navigator.vibrate missing', async () => {
  removeHapticStub();
  installMatchMediaStub();
  const { HapticEngine } = await loadModule();
  const h = new HapticEngine({ enabled: true });
  assert.equal(h.hasHaptic, false);
});

test('HapticEngine: preset registry includes 5 presets', async () => {
  installHapticStub();
  installMatchMediaStub();
  const { PRESET_IDS } = await loadModule();
  const expected = ['tap_fish', 'long_press_happy', 'double_excited', 'splash_click', 'chat_send'];
  for (const id of expected) assert.ok(PRESET_IDS.includes(id), `missing ${id}`);
  assert.equal(PRESET_IDS.length, 5);
});

test('HapticEngine: pulse(tap_fish) invokes navigator.vibrate([10])', async () => {
  const registry = installHapticStub();
  installMatchMediaStub();
  const { HapticEngine } = await loadModule();
  const h = new HapticEngine({ enabled: true });
  h.pulse('tap_fish');
  assert.deepEqual(registry.calls[0], [10]);
});

test('HapticEngine: pulse(double_excited) invokes pattern [40,30,40]', async () => {
  const registry = installHapticStub();
  installMatchMediaStub();
  const { HapticEngine } = await loadModule();
  const h = new HapticEngine({ enabled: true });
  h.pulse('double_excited');
  assert.deepEqual(registry.calls[0], [40, 30, 40]);
});

test('HapticEngine: disabled is silent no-op', async () => {
  const registry = installHapticStub();
  installMatchMediaStub();
  const { HapticEngine } = await loadModule();
  const h = new HapticEngine({ enabled: false });
  h.pulse('tap_fish');
  assert.equal(registry.calls.length, 0);
});

test('HapticEngine: no haptic support = silent no-op', async () => {
  removeHapticStub();
  installMatchMediaStub();
  const { HapticEngine } = await loadModule();
  const h = new HapticEngine({ enabled: true });
  h.pulse('tap_fish'); // should not throw
});

test('HapticEngine: prefers-reduced-motion silences pulse', async () => {
  const registry = installHapticStub();
  const mm = installMatchMediaStub({ reducedMotion: true });
  const { HapticEngine } = await loadModule();
  const h = new HapticEngine({ enabled: true });
  h.pulse('tap_fish');
  assert.equal(registry.calls.length, 0);
});

test('HapticEngine: reduced-motion live update via matchMedia listener', async () => {
  const registry = installHapticStub();
  const mm = installMatchMediaStub({ reducedMotion: false });
  const { HapticEngine } = await loadModule();
  const h = new HapticEngine({ enabled: true });
  h.pulse('tap_fish');
  assert.equal(registry.calls.length, 1);
  mm.setReducedMotion(true);
  h.pulse('tap_fish');
  assert.equal(registry.calls.length, 1); // no new call
});

test('HapticEngine: pulse(invalid) throws with preset name', async () => {
  installHapticStub();
  installMatchMediaStub();
  const { HapticEngine } = await loadModule();
  const h = new HapticEngine({ enabled: true });
  assert.throws(() => h.pulse('unknown'), /Unknown haptic preset: unknown/);
});
```

- [ ] **Step 2: Run tests, verify all fail**

Run: `node --test desk-pet/engine/haptic.test.js`

Expected: 10 FAIL (module does not exist).

- [ ] **Step 3: Implement HapticEngine**

Create `desk-pet/engine/haptic.js`:

```javascript
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
```

- [ ] **Step 4: Run tests, verify all pass**

Run: `node --test desk-pet/engine/haptic.test.js`

Expected: 10 passed, 0 failed.

- [ ] **Step 5: Commit**

```bash
git add desk-pet/engine/haptic.js desk-pet/engine/haptic.test.js
git commit -m "feat(haptic): HapticEngine with 5 presets + reduced-motion awareness"
```

---

## Task 7: Onboarding v2 migration + new HINTS structure

**Goal:** Refactor `engine/onboarding.js` with the v1 -> v2 flag migration logic and new HINTS data structure (with targets and demos). This task is structure-only - scripted demos and pulsing cue come next.

**Files:**
- Modify: `desk-pet/engine/onboarding.js`
- Create: `desk-pet/engine/onboarding.test.js`

- [ ] **Step 1: Read current onboarding.js to preserve semantics**

Run to inspect: `cat desk-pet/engine/onboarding.js` (or use Read tool).

Document the 3 existing behaviors that must be preserved:
- `shouldShowOnboarding()` - reads localStorage flag
- `runOnboarding()` - shows overlay, cycles text hints, sets flag on complete
- Skip via button + document `pointerdown` early-dismiss

- [ ] **Step 2: Write failing tests for v2 migration + HINTS shape**

Create `desk-pet/engine/onboarding.test.js`:

```javascript
import { test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  installLocalStorageStub,
  installMatchMediaStub,
  resetAllStubs,
} from './test-stubs.js';

async function loadModule() {
  // reset DOM-related globals; onboarding uses document directly, so install a minimal stub
  globalThis.document = {
    getElementById: () => null,
    querySelector: () => null,
    addEventListener: () => {},
    removeEventListener: () => {},
  };
  return await import('./onboarding.js?t=' + Math.random());
}

beforeEach(() => { resetAllStubs(); });
afterEach(() => { resetAllStubs(); });

test('onboarding: shouldShowOnboarding true when no flag set', async () => {
  installLocalStorageStub({});
  installMatchMediaStub();
  const { shouldShowOnboarding } = await loadModule();
  assert.equal(shouldShowOnboarding(), true);
});

test('onboarding: shouldShowOnboarding false when v2 flag set', async () => {
  installLocalStorageStub({ glub_onboarded_v2: '1' });
  installMatchMediaStub();
  const { shouldShowOnboarding } = await loadModule();
  assert.equal(shouldShowOnboarding(), false);
});

test('onboarding: shouldShowOnboarding true for v1 user (migration)', async () => {
  installLocalStorageStub({ glub_onboarded_v1: '1' });
  installMatchMediaStub();
  const { shouldShowOnboarding } = await loadModule();
  // v1 user sees new tutorial once -> should show
  assert.equal(shouldShowOnboarding(), true);
});

test('onboarding: HINTS array has 3 entries with id + text + target + demo', async () => {
  installLocalStorageStub({});
  installMatchMediaStub();
  const { HINTS } = await loadModule();
  assert.equal(HINTS.length, 3);
  const ids = HINTS.map(h => h.id);
  assert.deepEqual(ids, ['tap', 'hold', 'type']);
  for (const h of HINTS) {
    assert.ok(typeof h.text === 'string');
    assert.ok(typeof h.duration === 'number');
    assert.ok(typeof h.target === 'function');
    assert.ok(typeof h.demo === 'function');
  }
});
```

- [ ] **Step 3: Run tests, verify fail**

Run: `node --test desk-pet/engine/onboarding.test.js`

Expected: most tests FAIL (`HINTS` not exported, logic unchanged).

- [ ] **Step 4: Replace onboarding.js with new structure**

Replace `desk-pet/engine/onboarding.js` entirely with:

```javascript
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
```

- [ ] **Step 5: Run tests, verify all pass**

Run: `node --test desk-pet/engine/onboarding.test.js`

Expected: 4 passed, 0 failed.

- [ ] **Step 6: Commit**

```bash
git add desk-pet/engine/onboarding.js desk-pet/engine/onboarding.test.js
git commit -m "feat(onboarding): v1->v2 migration + HINTS structure with target+demo"
```

---

## Task 8: Onboarding scripted demo + pulsing cue runtime

**Goal:** Implement the runtime loop - render hint overlay, position pulsing cue over target, run scripted demo async, advance hints, early-dismiss via pointerdown. AbortController cancels in-flight demos.

**Files:**
- Modify: `desk-pet/engine/onboarding.js`
- Modify: `desk-pet/engine/onboarding.test.js`

- [ ] **Step 1: Add failing test for AbortController-driven skip**

Append to `desk-pet/engine/onboarding.test.js`:

```javascript
// Minimal DOM stub factory for onboarding loop tests.
function installDomStub() {
  const elements = new Map();
  const createEl = () => ({
    classList: { add: () => {}, remove: () => {}, toggle: () => {} },
    style: {},
    textContent: '',
    setAttribute: () => {},
    getAttribute: () => null,
    addEventListener: () => {},
    removeEventListener: () => {},
    appendChild: () => {},
    removeChild: () => {},
    focus: () => {},
    getBoundingClientRect: () => ({ left: 0, top: 0, width: 100, height: 100 }),
  });
  globalThis.document = {
    getElementById: (id) => elements.get(id) ?? null,
    querySelector: (sel) => elements.get(sel) ?? null,
    createElement: () => createEl(),
    addEventListener: () => {},
    removeEventListener: () => {},
    body: createEl(),
  };
  const register = (key, el = createEl()) => { elements.set(key, el); return el; };
  return { register };
}

test('onboarding: runOnboarding aborts on abortSignal and marks v2 flag', async () => {
  const ls = installLocalStorageStub({});
  installMatchMediaStub();
  const dom = installDomStub();
  dom.register('onboarding-overlay');
  dom.register('onboarding-cue');
  dom.register('.onboarding-text');
  const { runOnboarding, setDeps } = await loadModule();
  setDeps({
    haptic: { pulse: () => {} },
    sound: { play: () => {} },
    speech: { show: () => {} },
    fsm: { transition: () => true },
    STATES: { HAPPY: 'HAPPY', EXCITED: 'EXCITED' },
    getFishRect: () => ({ left: 0, top: 0, width: 16, height: 16 }),
  });

  const ac = new AbortController();
  const p = runOnboarding({ signal: ac.signal });
  ac.abort(); // early dismiss immediately
  await p;

  assert.equal(ls.glub_onboarded_v2, '1');
});
```

- [ ] **Step 2: Run tests, verify fail**

Run: `node --test desk-pet/engine/onboarding.test.js`

Expected: abort test FAILS (runOnboarding is stub, does not accept signal).

- [ ] **Step 3: Implement runtime loop with AbortController**

In `desk-pet/engine/onboarding.js`, replace the stub `runOnboarding()` and related:

```javascript
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
```

- [ ] **Step 4: Run tests, verify pass**

Run: `node --test desk-pet/engine/onboarding.test.js`

Expected: 5 passed, 0 failed.

- [ ] **Step 5: Commit**

```bash
git add desk-pet/engine/onboarding.js desk-pet/engine/onboarding.test.js
git commit -m "feat(onboarding): scripted demo runtime + pulsing cue + AbortController"
```

---

## Task 9: Onboarding replay API (showTutorial)

**Goal:** Export `showTutorial({ force })` that the settings "show tutorial again" button will call. When `force=true`, bypass the `shouldShowOnboarding` flag check.

**Files:**
- Modify: `desk-pet/engine/onboarding.js`
- Modify: `desk-pet/engine/onboarding.test.js`

- [ ] **Step 1: Add failing test**

Append to `desk-pet/engine/onboarding.test.js`:

```javascript
test('onboarding: showTutorial({force:true}) runs even if v2 flag set', async () => {
  const ls = installLocalStorageStub({ glub_onboarded_v2: '1' });
  installMatchMediaStub();
  const dom = installDomStub();
  dom.register('onboarding-overlay');
  dom.register('onboarding-cue');
  dom.register('.onboarding-text');
  const { showTutorial, setDeps } = await loadModule();
  setDeps({
    haptic: { pulse: () => {} },
    speech: { show: () => {} },
    fsm: { transition: () => true },
    STATES: {},
    getFishRect: () => ({ left: 0, top: 0, width: 16, height: 16 }),
  });

  const ac = new AbortController();
  const p = showTutorial({ force: true, signal: ac.signal });
  ac.abort();
  await p;

  // flag still set (does not reset)
  assert.equal(ls.glub_onboarded_v2, '1');
});

test('onboarding: showTutorial({force:false}) skips if flag set', async () => {
  installLocalStorageStub({ glub_onboarded_v2: '1' });
  installMatchMediaStub();
  installDomStub();
  const { showTutorial, setDeps } = await loadModule();
  setDeps({ haptic: {pulse:()=>{}}, getFishRect: () => null });

  let ran = false;
  const overlay = globalThis.document.getElementById('onboarding-overlay');
  if (overlay) overlay.classList.add = () => { ran = true; };

  await showTutorial({ force: false });
  assert.equal(ran, false);
});
```

- [ ] **Step 2: Run tests, verify fail**

Run: `node --test desk-pet/engine/onboarding.test.js`

Expected: both showTutorial tests FAIL.

- [ ] **Step 3: Replace showTutorial stub**

In `desk-pet/engine/onboarding.js`, replace `showTutorial`:

```javascript
export function showTutorial({ force = true, signal } = {}) {
  if (!force && !shouldShowOnboarding()) return Promise.resolve();
  return runOnboarding({ signal });
}
```

- [ ] **Step 4: Run tests, verify pass**

Run: `node --test desk-pet/engine/onboarding.test.js`

Expected: 7 passed, 0 failed.

- [ ] **Step 5: Commit**

```bash
git add desk-pet/engine/onboarding.js desk-pet/engine/onboarding.test.js
git commit -m "feat(onboarding): replay API showTutorial({force}) for settings button"
```

---

## Task 10: HTML + CSS additions

**Goal:** Add the settings checkbox + replay button + pulsing cue DOM element. Add pulsing keyframes CSS + reduced-motion overrides + feature-unavailable hide. No JS wire-up yet.

**Files:**
- Modify: `desk-pet/index.html`
- Modify: `desk-pet/style.css`

- [ ] **Step 1: Locate the settings panel + onboarding overlay in index.html**

Read `desk-pet/index.html` and identify:
- `<div id="settings-panel">` or `<dialog id="settings-panel">` block (around the fish-name input)
- `<div id="onboarding-overlay">` block

- [ ] **Step 2: Add settings rows + replay button**

Inside the settings panel, AFTER the existing fish-name row, add:

```html
<label class="settings-row">
  <span>sounds</span>
  <input type="checkbox" id="audio-enabled" checked>
</label>
<label class="settings-row">
  <span>haptic (mobile)</span>
  <input type="checkbox" id="haptic-enabled" checked>
</label>
<button type="button" id="replay-tutorial" class="settings-action">show tutorial again</button>
```

- [ ] **Step 3: Add onboarding cue element inside the overlay**

Inside `<div id="onboarding-overlay">`, AFTER the existing text + skip button, add:

```html
<div id="onboarding-cue" class="onboarding-cue hidden" aria-hidden="true"></div>
```

- [ ] **Step 4: Add CSS - pulsing cue + keyframes + overrides**

Append to `desk-pet/style.css`:

```css
/* --- Cluster B: onboarding pulsing cue --- */
.onboarding-cue {
  position: absolute;
  pointer-events: none;
  border: 3px solid #ff8b3d;
  border-radius: 50%;
  box-sizing: border-box;
  left: 0; top: 0;
  width: 48px; height: 48px;
  animation: onboardingPulse 1.2s ease-out infinite;
  z-index: 1001;
}
.onboarding-cue.hidden { display: none; }

@keyframes onboardingPulse {
  0%   { transform: scale(1);    opacity: 0.9; }
  100% { transform: scale(1.8);  opacity: 0; }
}

/* --- settings: replay button + feature-unavailable hide --- */
.settings-action {
  display: block;
  margin-top: 12px;
  padding: 8px 12px;
  background: #ff8b3d;
  color: #fff;
  border: none;
  border-radius: 4px;
  cursor: pointer;
  font: inherit;
}
.settings-action:hover { background: #e67a2f; }

body[data-no-audio]  .settings-row:has(#audio-enabled)  { display: none; }
body[data-no-haptic] .settings-row:has(#haptic-enabled) { display: none; }

/* --- a11y: prefers-reduced-motion disables onboarding cue animation --- */
@media (prefers-reduced-motion: reduce) {
  .onboarding-cue { animation: none; display: none; }
}
```

- [ ] **Step 5: Manual browser smoke test**

Serve: `python -m http.server 8000 --directory desk-pet`

Open `http://localhost:8000/` in a browser. Check:
- Settings dialog opens (existing behavior)
- Inside settings, 2 new checkboxes "sounds" / "haptic (mobile)" + "show tutorial again" button visible
- Buttons currently do nothing (no JS wiring yet; that is Task 12)
- Onboarding overlay (first-visit or after clearing `glub_onboarded_v2`) shows no cue yet because overlay JS not wired

- [ ] **Step 6: Commit**

```bash
git add desk-pet/index.html desk-pet/style.css
git commit -m "feat(ui): settings controls + pulsing cue DOM/CSS for Cluster B"
```

---

## Task 11: SW cache bump v6 -> v7

**Goal:** Bump `CACHE_VERSION` to `glub-v7`, add new files (`sound.js`, `haptic.js`) to the STATIC_ASSETS list. Small task, commit early to isolate blast radius.

**Files:**
- Modify: `desk-pet/sw.js`

- [ ] **Step 1: Read sw.js to locate CACHE_VERSION + STATIC_ASSETS list**

Read `desk-pet/sw.js`, find:
- `const CACHE_VERSION = 'glub-v6';`
- `const STATIC_ASSETS = [ ... ];` (array of asset paths)

- [ ] **Step 2: Update both**

Change `CACHE_VERSION` from `'glub-v6'` to `'glub-v7'`.

Add these entries to STATIC_ASSETS (alongside other engine/*.js entries):

```javascript
  'engine/sound.js',
  'engine/haptic.js',
```

- [ ] **Step 3: Smoke test SW doesn't crash**

Serve: `python -m http.server 8000 --directory desk-pet`. Open page, check Chrome DevTools > Application > Service Workers: SW should activate v7, old v6 cache pruned.

- [ ] **Step 4: Commit**

```bash
git add desk-pet/sw.js
git commit -m "chore(sw): cache bump v6->v7 with sound.js + haptic.js"
```

---

## Task 12: app.js - settings integration + first-gesture unlock

**Goal:** Wire up sound/haptic modules into app.js: import, init from SETTINGS, extend SETTINGS with audio/haptic flags, wire settings checkbox handlers, wire replay button, mount global first-pointerdown unlock listener, flag `data-no-audio`/`data-no-haptic` if unsupported.

**Files:**
- Modify: `desk-pet/app.js`

- [ ] **Step 1: Add imports at top**

Near other engine imports in `desk-pet/app.js`, add:

```javascript
import { getSound } from './engine/sound.js';
import { getHaptic } from './engine/haptic.js';
import { runOnboarding, showTutorial, shouldShowOnboarding, setDeps as setOnboardingDeps } from './engine/onboarding.js';
```

If `onboarding.js` was previously imported with a different name, replace with the line above (preserving the `shouldShowOnboarding` / `runOnboarding` used elsewhere).

- [ ] **Step 2: Extend SETTINGS object**

Find the existing SETTINGS initialization (search for `glub_notif_freq`). Add 2 new keys:

```javascript
const SETTINGS = {
  notifFreq: +(localStorage.getItem('glub_notif_freq') ?? 4),
  fishName: localStorage.getItem('glub_fish_name') ?? 'glub',
  audioEnabled: localStorage.getItem('glub_audio_enabled') !== '0',
  hapticEnabled: localStorage.getItem('glub_haptic_enabled') !== '0',
};
```

- [ ] **Step 3: Instantiate sound + haptic singletons after SETTINGS**

After the SETTINGS block, add:

```javascript
const sound = getSound({ enabled: SETTINGS.audioEnabled });
const haptic = getHaptic({ enabled: SETTINGS.hapticEnabled });

// mark body for CSS feature-unavailable hide
if (!sound.hasAudio)   document.body.dataset.noAudio   = '1';
if (!haptic.hasHaptic) document.body.dataset.noHaptic  = '1';
```

- [ ] **Step 4: Wire the first-gesture unlock listener**

Once, early in init (after DOMContentLoaded, before bringing up the FSM):

```javascript
document.addEventListener('pointerdown', () => { sound.unlock(); }, { once: true, capture: true });
```

- [ ] **Step 5: Extend setupSettings to handle new controls**

Find the `setupSettings()` function (or equivalent). After the existing notif-freq + fish-name wire-up, add:

```javascript
const audioCb = document.getElementById('audio-enabled');
if (audioCb) {
  audioCb.checked = SETTINGS.audioEnabled;
  audioCb.addEventListener('change', (e) => {
    SETTINGS.audioEnabled = e.target.checked;
    localStorage.setItem('glub_audio_enabled', e.target.checked ? '1' : '0');
    sound.setEnabled(e.target.checked);
  });
}

const hapticCb = document.getElementById('haptic-enabled');
if (hapticCb) {
  hapticCb.checked = SETTINGS.hapticEnabled;
  hapticCb.addEventListener('change', (e) => {
    SETTINGS.hapticEnabled = e.target.checked;
    localStorage.setItem('glub_haptic_enabled', e.target.checked ? '1' : '0');
    haptic.setEnabled(e.target.checked);
  });
}

const replayBtn = document.getElementById('replay-tutorial');
if (replayBtn) {
  replayBtn.addEventListener('click', () => {
    // close settings dialog if applicable
    const dialog = document.getElementById('settings-panel');
    if (dialog && typeof dialog.close === 'function') dialog.close();
    showTutorial({ force: true });
  });
}
```

- [ ] **Step 6: Wire onboarding dependencies**

After the FSM + speech are constructed, and before the existing `runOnboarding` call, add `setOnboardingDeps`:

```javascript
setOnboardingDeps({
  haptic,
  sound,
  speech,              // existing speech bubble instance
  fsm,                 // existing FSM instance
  STATES,              // imported from state-machine.js
  getFishRect: () => {
    // Return a DOMRect-shaped object for the fish in screen coordinates.
    // Use canvas.getBoundingClientRect() + internal fish coords scaled.
    const canvas = document.getElementById('bowl');
    const crect = canvas.getBoundingClientRect();
    // Approximate: use fish position if exposed, else center of canvas
    const fx = (typeof fish?.x === 'number') ? fish.x : crect.width / 2;
    const fy = (typeof fish?.y === 'number') ? fish.y : crect.height / 2;
    return {
      left: crect.left + fx - 20,
      top:  crect.top  + fy - 20,
      width: 40, height: 40,
    };
  },
});
```

Note: adjust the `fish?.x` / `fish?.y` reference based on the actual FSM/movement API. If the fish position is scaled to a different internal resolution, multiply by the canvas CSS-to-buffer ratio.

- [ ] **Step 7: Manual smoke test**

Serve: `python -m http.server 8000 --directory desk-pet`. Open DevTools > Application > Local Storage, clear all `glub_*` keys, reload.

Expected:
- Tutorial fires
- Fish auto-transitions (visible as EXCITED / HAPPY states)
- After tutorial, click fish once -> audible bubble_pop or no-sound-yet (call-sites come in Task 13)
- Open settings -> 2 checkboxes + replay button visible
- Toggle checkboxes -> values persist in localStorage after reload
- Click "show tutorial again" -> tutorial replays

Note: full audio plays only after Task 13 wires call-sites; user-click unlock already happens at Step 4.

- [ ] **Step 8: Commit**

```bash
git add desk-pet/app.js
git commit -m "feat(app): wire sound/haptic/onboarding deps + settings handlers + unlock"
```

---

## Task 13: app.js user-gesture call-sites + FSM state-driven audio

**Goal:** Fire `haptic.pulse()` and `sound.play()` at all 5 user-gesture handlers. Add FSM onStateChange listener that plays audio on EAT + EXCITED transitions. Make bubble spawn + speech fadeOut fire their audio.

**Files:**
- Modify: `desk-pet/app.js`
- Modify: `desk-pet/engine/bubbles.js`
- Modify: `desk-pet/engine/speech.js`

- [ ] **Step 1: Locate the 5 user-gesture handlers in app.js**

Search for existing handlers:
- `pointerdown` on fish / canvas for single-click -> spiral swim
- Long-press handler -> HAPPY transition
- Double-click handler -> EXCITED transition
- Water click handler -> splash particles
- Chat form submit handler

- [ ] **Step 2: Add haptic + audio calls at each handler**

In each handler, BEFORE the existing transition/action, add one of these (matching the gesture):

```javascript
// single-click fish -> spiral swim
haptic.pulse('tap_fish');

// long-press -> HAPPY
haptic.pulse('long_press_happy');

// double-click -> EXCITED
haptic.pulse('double_excited');

// click on water -> splash
haptic.pulse('splash_click');
sound.play('splash_click');

// chat submit
haptic.pulse('chat_send');
sound.play('chat_send');
```

Note: `tap_fish` + `long_press_happy` are haptic-only by spec design (audio would feel intrusive for trivial taps). `double_excited` audio is fired indirectly via the FSM onStateChange listener (Step 3).

- [ ] **Step 3: Register FSM onStateChange listener**

After the FSM is constructed in app.js, add:

```javascript
import { STATES } from './engine/state-machine.js'; // ensure STATES is imported

fsm.onStateChange((newState, oldState) => {
  if (newState === STATES.EAT) sound.play('nom_nom_eat');
  if (newState === STATES.EXCITED) sound.play('excited_celebration');
});
```

If `STATES` is already imported, skip the import line.

- [ ] **Step 4: Wire bubble_pop in bubbles.js**

Read `desk-pet/engine/bubbles.js`. Find the `spawn()` method on BubbleSystem.

Add import near the top:

```javascript
import { getSound } from './sound.js';
```

In `spawn()`, after the bubble is pushed to the internal array, add:

```javascript
getSound().play('bubble_pop');
```

The throttling is internal to SoundEngine; even if bubbles.js spawns 3/sec, only 1 sound plays per 500ms.

- [ ] **Step 5: Wire forget_glub in speech.js**

Read `desk-pet/engine/speech.js`. Find where the fadeOut phase starts (search for `fadeOut` or the transition from `visible` to `fading_out`).

Add import near the top:

```javascript
import { getSound } from './sound.js';
```

At the start of the fadeOut phase (only once per speech bubble, not per tick), add:

```javascript
getSound().play('forget_glub');
```

- [ ] **Step 6: Manual browser validation**

Serve: `python -m http.server 8000 --directory desk-pet`. Clear localStorage, reload.

After tutorial dismisses, with audio unlocked from first pointerdown:

- [ ] Single-click fish -> subtle vibrate on mobile (no audio) + visual spiral
- [ ] Long-press fish -> vibrate + visual HAPPY (no audio per spec)
- [ ] Double-click fish -> vibrate pattern + EXCITED audio fanfare C5-E5-G5
- [ ] Click on water -> vibrate + splash audio (white-noise hi-pass)
- [ ] Type message + Enter -> vibrate + chat_send beep 880 Hz + speech bubble
- [ ] Wait for idle bubble spawn -> sporadic bubble_pop (throttled, not cacophony)
- [ ] Wait for speech bubble fadeOut -> forget_glub chime
- [ ] Random EAT transition -> nom_nom_eat 3 bursts

Toggle audio off in settings -> above sounds stop firing.
Toggle haptic off -> haptic stops.
Hit replay tutorial -> tutorial fires again + fish demos.

- [ ] **Step 7: Commit**

```bash
git add desk-pet/app.js desk-pet/engine/bubbles.js desk-pet/engine/speech.js
git commit -m "feat(cluster-b): wire call-sites - 5 user-gesture + FSM + bubbles + speech"
```

---

## Task 14: Manual a11y + regression validation + final commit

**Goal:** Run axe-core on the deployed localhost version to ensure no new a11y violations. Validate the `prefers-reduced-motion` path. Spot-check mobile Safari (iOS) to confirm haptic silently no-ops. Update the in-progress status in the project memory file.

**Files:** none (validation only), unless fixes emerge.

- [ ] **Step 1: Run node --test on all engine tests**

```bash
cd L:/Dennis/Projects/glublm
node --test desk-pet/engine/sound.test.js desk-pet/engine/haptic.test.js desk-pet/engine/onboarding.test.js desk-pet/inference/tokenizer.test.js
```

Expected: all pass (unit tests + existing tokenizer BPE parity).

- [ ] **Step 2: Run existing pytest to confirm no regression**

```bash
"C:/Users/Dennis/.venv-glublm/Scripts/python.exe" -m pytest -q
```

Expected: 78/78 passed (unchanged from master baseline).

- [ ] **Step 3: axe-core live validation**

Serve: `python -m http.server 8000 --directory desk-pet`.

Open `http://localhost:8000/` in Chrome. Open DevTools > Console, paste the axe-core inline bootstrap:

```javascript
const s = document.createElement('script');
s.src = 'https://cdnjs.cloudflare.com/ajax/libs/axe-core/4.10.0/axe.min.js';
s.onload = () => axe.run().then(r => console.log('violations:', r.violations.length, r.violations));
document.head.appendChild(s);
```

Expected: `violations: 0`. If > 0, triage each violation (focus-trap escape, aria-hidden on cue, etc.) and fix inline.

- [ ] **Step 4: prefers-reduced-motion path**

Chrome DevTools > Rendering panel > Emulate CSS media feature prefers-reduced-motion > `reduce`.

Clear localStorage `glub_onboarded_v2`, reload. Expected:
- Tutorial shows text hints only (no pulsing ring, no scripted demo transitions)
- Each hint advances after 2000 ms
- Tutorial completes cleanly, flag set

- [ ] **Step 5: Mobile Safari spot-check (optional if physical device available)**

Open `http://<machine-ip>:8000/` on an iPhone (same LAN). Expected:
- No haptic (iOS Safari has no navigator.vibrate)
- No crash
- Audio unlocks after first tap
- Tutorial runs with scripted demo
- Haptic checkbox in settings hidden via `data-no-haptic` CSS

- [ ] **Step 6: Bubble_pop throttle audible check**

Watch 5 seconds of idle (multiple bubbles should spawn). Expected: sporadic pop sound, not every bubble audible (throttle drops the rest).

- [ ] **Step 7: If all validations pass, update project memory**

Edit `C:/Users/Dennis/.claude/projects/C--Users-Dennis/memory/personal_glublm.md` to add a "Cluster B Engagement" section with:
- New files list
- Event taxonomy 6 audio + 5 haptic
- localStorage keys added
- Flag migration v1 -> v2

This is not a commit to the git repo; it is a memory update for future sessions (living doc pattern).

- [ ] **Step 8: Final commit if any late fixes**

If Step 3/4/5 surfaced a fix:

```bash
git add <changed files>
git commit -m "fix(cluster-b): <brief description>"
```

- [ ] **Step 9: Push to origin/master**

```bash
git push origin master
```

GH Pages auto-deploys. Verify live at `https://den-sec.github.io/glublm/desk-pet/` after ~1 min.

---

## Summary

| Task | Component | Effort |
|---:|---|---:|
| 1 | Test stub infrastructure | 15 min |
| 2 | SoundEngine skeleton + lifecycle | 30 min |
| 3 | SoundEngine preset registry + bubble_pop | 45 min |
| 4 | Remaining 5 sound presets | 60 min |
| 5 | bubble_pop throttling | 15 min |
| 6 | HapticEngine complete | 45 min |
| 7 | Onboarding v2 migration + HINTS structure | 30 min |
| 8 | Onboarding scripted demo + pulsing cue | 60 min |
| 9 | Onboarding replay API | 15 min |
| 10 | HTML + CSS additions | 30 min |
| 11 | SW cache bump v6 -> v7 | 10 min |
| 12 | app.js settings integration + unlock | 45 min |
| 13 | app.js call-sites + FSM + bubbles + speech | 60 min |
| 14 | Validation + a11y + push | 60 min |
| **Total** | | **~8 h** |

## Rollback

If anything in Task 13 breaks production behavior (browser validation shows regression), rollback is one command:

```bash
git revert <commit-sha>
git push
```

Or, because all tasks are atomic commits, you can selectively revert a subset. The SW cache bump in Task 11 is particularly safe: reverting it rolls users back to v6 (previous assets), which are still in their cache.

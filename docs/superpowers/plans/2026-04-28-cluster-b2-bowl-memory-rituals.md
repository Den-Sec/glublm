# Cluster B.2 Bowl Memory + Day/Night Rituals Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement cross-session retention layer for the Desk Pet PWA: persisted mood-state object (`bowl-memory.js`) + one-shot daily dawn/sunset greetings (`rituals.js`), with mood + hour bias in `idle.js` and full integration in `app.js`.

**Architecture:** Two new feature-isolated singleton modules under `desk-pet/engine/` mirror the S1 pattern (`sound.js`, `haptic.js`). `bowl-memory.js` owns persisted timestamps/counters/streak with computed-on-read mood_score; `rituals.js` polls hour every 30s in the render loop and fires once-per-UTC-day greetings. `idle.js` gains a weighted-random `_selectPhrase` with mood + hour category multipliers (backward-compatible: no providers wired = no bias). `app.js` orchestrates: load bowl memory on init, wire rituals + idle providers, record events at chat/excited/EATING call-sites, listen on `visibilitychange` + `pagehide`, run `rituals.update(dt)` in the render loop.

**Tech Stack:** vanilla JS ES modules, Node 20+ `node:test` for unit tests, existing `desk-pet/engine/test-stubs.js` (extended with speech/fsm/STATES mocks), localStorage persistence, browser `setTimeout` debounce. No new runtime dependencies. Repo: `L:\Dennis\Projects\glublm`. Spec reference: `docs/superpowers/specs/2026-04-28-cluster-b2-bowl-memory-rituals-design.md`.

---

## File Structure

| File | Status | Purpose |
|---|---|---|
| `desk-pet/engine/bowl-memory.js` | NEW | `MoodMemory` class + reactivation + persisted state |
| `desk-pet/engine/bowl-memory.test.js` | NEW | 12 unit test (load/save, mood, streak, reactivation) |
| `desk-pet/engine/rituals.js` | NEW | `RitualScheduler` class + dawn/sunset polling |
| `desk-pet/engine/rituals.test.js` | NEW | 8 unit test (timer, dawn, sunset, conflict skip) |
| `desk-pet/engine/test-stubs.js` | EXTEND | `installTimeStub` + `installSpeechFsmStub` helpers |
| `desk-pet/engine/idle.js` | EXTEND | `setMoodProvider`, `setHourProvider`, weighted `_selectPhrase` |
| `desk-pet/app.js` | EXTEND | Imports + init wiring + event recording + listeners + rituals.update |
| `desk-pet/sw.js` | EXTEND | `CACHE_VERSION` v7->v8 + add new files to STATIC_ASSETS |

Note: state name is `STATES.BLOWING_BUBBLES` (verified `desk-pet/engine/state-machine.js:24`); the spec earlier said `BUBBLE_BLOW` and has been corrected. Use `BLOWING_BUBBLES` everywhere.

The existing FSM `onStateChange` listener (added in S1, `app.js:649-651`) handles audio playback. We extend its body in Task 12 to also call `bowlMemory.recordEvent('feed')` on `STATES.EATING`.

---

## Task 1: Extend test-stubs.js with time + speech/fsm/STATES helpers

**Files:**
- Modify: `desk-pet/engine/test-stubs.js` (append new exports at the end, before `resetAllStubs`)

- [ ] **Step 1: Read current `resetAllStubs()` to know what to add**

Read `desk-pet/engine/test-stubs.js:198-204`. Note that `resetAllStubs` calls 4 uninstall functions and clears `_originals`.

- [ ] **Step 2: Add stub install helpers**

Append (just before `export function resetAllStubs()` line) the following block:

```js
// --- Speech / FSM / STATES mocks for bowl-memory + rituals tests ---

export function makeSpeechMock() {
  const calls = [];
  return {
    isVisible: false,
    show(text, opts) { calls.push({ text, opts }); this.isVisible = true; },
    _calls: calls,
  };
}

export function makeFsmMock(initialState = 'IDLE') {
  const calls = [];
  let state = initialState;
  return {
    get currentState() { return state; },
    setState(s) { state = s; },
    transition(s, opts) { calls.push({ state: s, opts }); state = s; return true; },
    _calls: calls,
  };
}

export const STATES_MOCK = Object.freeze({
  IDLE: 'IDLE',
  SLEEPING: 'SLEEPING',
  EATING: 'EATING',
  HAPPY: 'HAPPY',
  EXCITED: 'EXCITED',
  BLOWING_BUBBLES: 'BLOWING_BUBBLES',
  TALKING: 'TALKING',
  FORGETTING: 'FORGETTING',
  BUMPING: 'BUMPING',
  TURNING: 'TURNING',
  WIGGLING: 'WIGGLING',
  SAD: 'SAD',
});
```

These helpers are pure factories with no global state, so `resetAllStubs()` does NOT need to track them.

- [ ] **Step 3: Verify existing tests still pass**

Run: `cd L:/Dennis/Projects/glublm && node --test desk-pet/engine/sound.test.js desk-pet/engine/haptic.test.js desk-pet/engine/onboarding.test.js`
Expected: all green (33/33).

- [ ] **Step 4: Commit**

```bash
git add desk-pet/engine/test-stubs.js
git commit -m "test(desk-pet): add speech/fsm/STATES mocks to test-stubs for B.2"
```

---

## Task 2: bowl-memory.js skeleton + load/save with localStorage

**Files:**
- Create: `desk-pet/engine/bowl-memory.test.js`
- Create: `desk-pet/engine/bowl-memory.js`

- [ ] **Step 1: Write failing test for skeleton + defaults**

Create `desk-pet/engine/bowl-memory.test.js`:

```js
import { test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { installLocalStorageStub, resetAllStubs } from './test-stubs.js';

async function loadModule() {
  return await import('./bowl-memory.js?t=' + Math.random());
}

beforeEach(() => { resetAllStubs(); });
afterEach(() => { resetAllStubs(); });

test('bowl-memory: load with no localStorage entry -> safe defaults', async () => {
  installLocalStorageStub({});
  const { MoodMemory } = await loadModule();
  const m = new MoodMemory();
  m.load();
  const s = m.state;
  assert.equal(s.last_feed_at, 0);
  assert.equal(s.last_chat_at, 0);
  assert.equal(s.last_excited_at, 0);
  assert.equal(s.last_seen_at, 0);
  assert.equal(s.total_feeds, 0);
  assert.equal(s.total_chats, 0);
  assert.equal(s.total_excited, 0);
  assert.equal(s.streak_days, 0);
  assert.equal(s.last_interaction_day_utc, null);
});

test('bowl-memory: load with malformed JSON -> reset to defaults', async () => {
  installLocalStorageStub({ glub_bowl_memory: 'not json{' });
  const { MoodMemory } = await loadModule();
  const m = new MoodMemory();
  m.load();
  assert.equal(m.state.streak_days, 0);
});

test('bowl-memory: load with valid persisted state -> deserializes', async () => {
  installLocalStorageStub({
    glub_bowl_memory: JSON.stringify({
      version: 1,
      last_feed_at: 1000, last_chat_at: 2000, last_excited_at: 3000,
      last_seen_at: 4000,
      total_feeds: 5, total_chats: 10, total_excited: 2,
      streak_days: 3, last_interaction_day_utc: '2026-04-26',
    }),
  });
  const { MoodMemory } = await loadModule();
  const m = new MoodMemory();
  m.load();
  assert.equal(m.state.last_feed_at, 1000);
  assert.equal(m.state.total_chats, 10);
  assert.equal(m.state.streak_days, 3);
  assert.equal(m.state.last_interaction_day_utc, '2026-04-26');
});

test('bowl-memory: save({flush:true}) writes JSON immediately', async () => {
  const ls = installLocalStorageStub({});
  const { MoodMemory } = await loadModule();
  const m = new MoodMemory();
  m.load();
  m.recordSeen({ now: 5000 });
  m.save({ flush: true });
  const persisted = JSON.parse(ls.glub_bowl_memory);
  assert.equal(persisted.last_seen_at, 5000);
  assert.equal(persisted.version, 1);
});

test('bowl-memory: recordSeen updates last_seen_at', async () => {
  installLocalStorageStub({});
  const { MoodMemory } = await loadModule();
  const m = new MoodMemory({ now: () => 12345 });
  m.load();
  m.recordSeen();
  assert.equal(m.state.last_seen_at, 12345);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd L:/Dennis/Projects/glublm && node --test desk-pet/engine/bowl-memory.test.js`
Expected: FAIL with `Cannot find module './bowl-memory.js'`.

- [ ] **Step 3: Create minimal `bowl-memory.js`**

Create `desk-pet/engine/bowl-memory.js`:

```js
/**
 * Persisted mood-state for the Desk Pet across sessions.
 * Stores timestamps, counters, streak in a single localStorage JSON key.
 * mood_score is computed on-demand (stateless, recency-based).
 */

const STORAGE_KEY = 'glub_bowl_memory';
const SAVE_DEBOUNCE_MS = 500;

const DEFAULT_STATE = {
  version: 1,
  last_feed_at: 0,
  last_chat_at: 0,
  last_excited_at: 0,
  last_seen_at: 0,
  total_feeds: 0,
  total_chats: 0,
  total_excited: 0,
  streak_days: 0,
  last_interaction_day_utc: null,
};

function utcDateStr(ts = Date.now()) {
  const d = new Date(ts);
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function utcDaysBetween(a, b) {
  const ta = Date.UTC(...a.split('-').map((v, i) => i === 1 ? Number(v) - 1 : Number(v)));
  const tb = Date.UTC(...b.split('-').map((v, i) => i === 1 ? Number(v) - 1 : Number(v)));
  return Math.round((tb - ta) / 86_400_000);
}

export class MoodMemory {
  constructor({ now = () => Date.now(), today = () => utcDateStr() } = {}) {
    this._now = now;
    this._today = today;
    this._s = { ...DEFAULT_STATE };
    this._reactivationFired = false;
    this._saveTimer = null;
    this._warned = false;
  }

  load() {
    try {
      const raw = globalThis.localStorage?.getItem(STORAGE_KEY);
      if (!raw) { this._s = { ...DEFAULT_STATE }; return; }
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === 'object' && parsed.version === 1) {
        this._s = { ...DEFAULT_STATE, ...parsed };
      } else {
        this._s = { ...DEFAULT_STATE };
        this.save({ flush: true });
      }
    } catch (e) {
      if (!this._warned) { console.warn('bowl-memory: malformed localStorage, reset to defaults', e); this._warned = true; }
      this._s = { ...DEFAULT_STATE };
      this.save({ flush: true });
    }
  }

  save({ flush = false } = {}) {
    if (flush) {
      if (this._saveTimer) { clearTimeout(this._saveTimer); this._saveTimer = null; }
      this._writeNow();
      return;
    }
    this._scheduleSave();
  }

  _scheduleSave() {
    if (this._saveTimer) clearTimeout(this._saveTimer);
    this._saveTimer = setTimeout(() => { this._saveTimer = null; this._writeNow(); }, SAVE_DEBOUNCE_MS);
  }

  _writeNow() {
    try {
      globalThis.localStorage?.setItem(STORAGE_KEY, JSON.stringify(this._s));
    } catch (e) {
      if (!this._warned) { console.warn('bowl-memory: localStorage unavailable, in-memory only', e); this._warned = true; }
    }
  }

  recordSeen({ now } = {}) {
    this._s.last_seen_at = now ?? this._now();
    this._scheduleSave();
  }

  get state() { return { ...this._s, mood_score: this.getMoodScore() }; }

  getMoodScore() { return 0; /* placeholder, Task 3 */ }

  recordEvent(_type) { /* placeholder, Task 4 */ }

  getReactivation() { return null; /* placeholder, Task 5 */ }

  reset() {
    this._s = { ...DEFAULT_STATE };
    this._reactivationFired = false;
    try { globalThis.localStorage?.removeItem(STORAGE_KEY); } catch {}
  }

  get isReactivationFired() { return this._reactivationFired; }
}

export const bowlMemory = new MoodMemory();
```

- [ ] **Step 4: Run tests to verify pass**

Run: `cd L:/Dennis/Projects/glublm && node --test desk-pet/engine/bowl-memory.test.js`
Expected: 5/5 pass.

- [ ] **Step 5: Commit**

```bash
git add desk-pet/engine/bowl-memory.js desk-pet/engine/bowl-memory.test.js
git commit -m "feat(bowl-memory): MoodMemory skeleton + load/save with localStorage"
```

---

## Task 3: bowl-memory.js mood_score (recency-based discrete 0-3)

**Files:**
- Modify: `desk-pet/engine/bowl-memory.test.js` (append)
- Modify: `desk-pet/engine/bowl-memory.js` (replace `getMoodScore` placeholder)

- [ ] **Step 1: Write failing tests for mood_score**

Append to `desk-pet/engine/bowl-memory.test.js`:

```js
test('bowl-memory: mood_score = 0 when never interacted', async () => {
  installLocalStorageStub({});
  const { MoodMemory } = await loadModule();
  const m = new MoodMemory({ now: () => 1_000_000 });
  m.load();
  assert.equal(m.getMoodScore(), 0);
});

test('bowl-memory: mood_score 3=joyful <2h, 2=ok <8h, 1=lonely <24h, 0=neglected >=24h', async () => {
  installLocalStorageStub({});
  const { MoodMemory } = await loadModule();
  const NOW = 1_000_000_000;
  let now = NOW;
  const m = new MoodMemory({ now: () => now });
  m.load();

  // Inject last_chat_at via direct state for testing pure mood logic
  m._s.last_chat_at = NOW;
  now = NOW + 1 * 3_600_000;       assert.equal(m.getMoodScore(), 3, '1h -> joyful');
  now = NOW + 3 * 3_600_000;       assert.equal(m.getMoodScore(), 2, '3h -> ok');
  now = NOW + 12 * 3_600_000;      assert.equal(m.getMoodScore(), 1, '12h -> lonely');
  now = NOW + 30 * 3_600_000;      assert.equal(m.getMoodScore(), 0, '30h -> neglected');
});

test('bowl-memory: mood_score uses most recent of feed/chat/excited', async () => {
  installLocalStorageStub({});
  const { MoodMemory } = await loadModule();
  const NOW = 1_000_000_000;
  const m = new MoodMemory({ now: () => NOW + 60 * 60_000 }); // 1h after NOW
  m.load();
  m._s.last_chat_at = NOW - 100 * 3_600_000;     // 100h ago (very old)
  m._s.last_feed_at = NOW;                       // 1h ago (joyful range)
  m._s.last_excited_at = 0;
  assert.equal(m.getMoodScore(), 3);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd L:/Dennis/Projects/glublm && node --test desk-pet/engine/bowl-memory.test.js`
Expected: 3 tests FAIL (mood always 0).

- [ ] **Step 3: Replace `getMoodScore` placeholder with real impl**

In `desk-pet/engine/bowl-memory.js`, replace the line `getMoodScore() { return 0; /* placeholder, Task 3 */ }` with:

```js
  getMoodScore() {
    const mostRecent = Math.max(
      this._s.last_chat_at || 0,
      this._s.last_feed_at || 0,
      this._s.last_excited_at || 0,
    );
    if (mostRecent === 0) return 0;
    const ageH = (this._now() - mostRecent) / 3_600_000;
    if (ageH < 2)  return 3;
    if (ageH < 8)  return 2;
    if (ageH < 24) return 1;
    return 0;
  }
```

- [ ] **Step 4: Run tests to verify pass**

Run: `cd L:/Dennis/Projects/glublm && node --test desk-pet/engine/bowl-memory.test.js`
Expected: 8/8 pass.

- [ ] **Step 5: Commit**

```bash
git add desk-pet/engine/bowl-memory.js desk-pet/engine/bowl-memory.test.js
git commit -m "feat(bowl-memory): mood_score recency-based discrete 0-3"
```

---

## Task 4: bowl-memory.js recordEvent + streak (UTC date + 24h grace)

**Files:**
- Modify: `desk-pet/engine/bowl-memory.test.js` (append)
- Modify: `desk-pet/engine/bowl-memory.js` (replace `recordEvent` placeholder)

- [ ] **Step 1: Write failing tests for recordEvent + streak**

Append to `desk-pet/engine/bowl-memory.test.js`:

```js
test('bowl-memory: recordEvent("chat") updates last_chat_at + total_chats + day', async () => {
  installLocalStorageStub({});
  const { MoodMemory } = await loadModule();
  const m = new MoodMemory({ now: () => 5000, today: () => '2026-04-28' });
  m.load();
  m.recordEvent('chat');
  assert.equal(m.state.last_chat_at, 5000);
  assert.equal(m.state.total_chats, 1);
  assert.equal(m.state.last_feed_at, 0);
  assert.equal(m.state.streak_days, 1);
  assert.equal(m.state.last_interaction_day_utc, '2026-04-28');
});

test('bowl-memory: recordEvent("feed") increments total_feeds only', async () => {
  installLocalStorageStub({});
  const { MoodMemory } = await loadModule();
  const m = new MoodMemory({ today: () => '2026-04-28' });
  m.load();
  m.recordEvent('feed');
  m.recordEvent('feed');
  assert.equal(m.state.total_feeds, 2);
  assert.equal(m.state.total_chats, 0);
  assert.equal(m.state.total_excited, 0);
});

test('bowl-memory: streak same UTC day -> no increment', async () => {
  installLocalStorageStub({});
  const { MoodMemory } = await loadModule();
  const m = new MoodMemory({ today: () => '2026-04-28' });
  m.load();
  m.recordEvent('chat');
  m.recordEvent('chat');
  m.recordEvent('feed');
  assert.equal(m.state.streak_days, 1);
});

test('bowl-memory: streak gap 1 UTC day -> +1', async () => {
  installLocalStorageStub({});
  const { MoodMemory } = await loadModule();
  let day = '2026-04-26';
  const m = new MoodMemory({ today: () => day });
  m.load();
  m.recordEvent('chat');                        // streak=1
  day = '2026-04-27';
  m.recordEvent('chat');                        // streak=2 (gap=1)
  assert.equal(m.state.streak_days, 2);
});

test('bowl-memory: streak gap 2 UTC days -> +1 (24h grace)', async () => {
  installLocalStorageStub({});
  const { MoodMemory } = await loadModule();
  let day = '2026-04-26';
  const m = new MoodMemory({ today: () => day });
  m.load();
  m.recordEvent('chat');                        // streak=1
  day = '2026-04-28';
  m.recordEvent('chat');                        // streak=2 (gap=2, grace)
  assert.equal(m.state.streak_days, 2);
});

test('bowl-memory: streak gap 3+ UTC days -> reset to 1', async () => {
  installLocalStorageStub({});
  const { MoodMemory } = await loadModule();
  let day = '2026-04-26';
  const m = new MoodMemory({ today: () => day });
  m.load();
  m.recordEvent('chat');                        // streak=1
  m._s.streak_days = 7;                          // simulate accumulated streak
  day = '2026-04-30';
  m.recordEvent('chat');                        // gap=4 -> reset
  assert.equal(m.state.streak_days, 1);
});

test('bowl-memory: recordEvent unknown type throws', async () => {
  installLocalStorageStub({});
  const { MoodMemory } = await loadModule();
  const m = new MoodMemory();
  m.load();
  assert.throws(() => m.recordEvent('bogus'), /Unknown event type/);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd L:/Dennis/Projects/glublm && node --test desk-pet/engine/bowl-memory.test.js`
Expected: 7 new tests FAIL.

- [ ] **Step 3: Replace `recordEvent` placeholder**

In `desk-pet/engine/bowl-memory.js`, replace the line `recordEvent(_type) { /* placeholder, Task 4 */ }` with:

```js
  recordEvent(type) {
    if (type !== 'chat' && type !== 'feed' && type !== 'excited') {
      throw new Error(`Unknown event type: ${type}`);
    }
    const now = this._now();
    const today = this._today();
    const last = this._s.last_interaction_day_utc;

    if (!last) {
      this._s.streak_days = 1;
    } else if (last !== today) {
      const gapDays = utcDaysBetween(last, today);
      if (gapDays >= 1 && gapDays <= 2) this._s.streak_days += 1;
      else if (gapDays > 2)             this._s.streak_days = 1;
      // gapDays < 1 (clock skew backwards) -> leave streak unchanged
    }
    this._s.last_interaction_day_utc = today;

    if (type === 'chat')    { this._s.last_chat_at    = now; this._s.total_chats   += 1; }
    if (type === 'feed')    { this._s.last_feed_at    = now; this._s.total_feeds   += 1; }
    if (type === 'excited') { this._s.last_excited_at = now; this._s.total_excited += 1; }

    this._scheduleSave();
  }
```

- [ ] **Step 4: Run tests to verify pass**

Run: `cd L:/Dennis/Projects/glublm && node --test desk-pet/engine/bowl-memory.test.js`
Expected: 15/15 pass.

- [ ] **Step 5: Commit**

```bash
git add desk-pet/engine/bowl-memory.js desk-pet/engine/bowl-memory.test.js
git commit -m "feat(bowl-memory): recordEvent + UTC streak with 24h grace"
```

---

## Task 5: bowl-memory.js getReactivation + phrase pools

**Files:**
- Modify: `desk-pet/engine/bowl-memory.test.js` (append)
- Modify: `desk-pet/engine/bowl-memory.js` (replace `getReactivation` placeholder + add phrase pools)

- [ ] **Step 1: Write failing tests for reactivation**

Append to `desk-pet/engine/bowl-memory.test.js`:

```js
test('bowl-memory: getReactivation returns null when last_seen_at == 0', async () => {
  installLocalStorageStub({});
  const { MoodMemory } = await loadModule();
  const m = new MoodMemory();
  m.load();
  assert.equal(m.getReactivation(), null);
});

test('bowl-memory: getReactivation null when gap < 30min', async () => {
  installLocalStorageStub({});
  const { MoodMemory } = await loadModule();
  const NOW = 1_000_000_000;
  const m = new MoodMemory({ now: () => NOW });
  m.load();
  m._s.last_seen_at = NOW - 10 * 60_000;     // 10min gap
  assert.equal(m.getReactivation(), null);
});

test('bowl-memory: getReactivation 1h gap -> short variant', async () => {
  installLocalStorageStub({});
  const { MoodMemory, SHORT_REACTIVATIONS } = await loadModule();
  const NOW = 1_000_000_000;
  const m = new MoodMemory({ now: () => NOW });
  m.load();
  m._s.last_seen_at = NOW - 60 * 60_000;     // 60min gap
  const r = m.getReactivation();
  assert.equal(r.variant, 'short');
  assert.ok(SHORT_REACTIVATIONS.includes(r.text));
});

test('bowl-memory: getReactivation 4h gap -> med variant', async () => {
  installLocalStorageStub({});
  const { MoodMemory, MED_REACTIVATIONS } = await loadModule();
  const NOW = 1_000_000_000;
  const m = new MoodMemory({ now: () => NOW });
  m.load();
  m._s.last_seen_at = NOW - 4 * 3_600_000;
  const r = m.getReactivation();
  assert.equal(r.variant, 'med');
  assert.ok(MED_REACTIVATIONS.includes(r.text));
});

test('bowl-memory: getReactivation 12h gap -> long variant', async () => {
  installLocalStorageStub({});
  const { MoodMemory, LONG_REACTIVATIONS } = await loadModule();
  const NOW = 1_000_000_000;
  const m = new MoodMemory({ now: () => NOW });
  m.load();
  m._s.last_seen_at = NOW - 12 * 3_600_000;
  const r = m.getReactivation();
  assert.equal(r.variant, 'long');
  assert.ok(LONG_REACTIVATIONS.includes(r.text));
});

test('bowl-memory: getReactivation second call same instance -> null (one-shot)', async () => {
  installLocalStorageStub({});
  const { MoodMemory } = await loadModule();
  const NOW = 1_000_000_000;
  const m = new MoodMemory({ now: () => NOW });
  m.load();
  m._s.last_seen_at = NOW - 60 * 60_000;
  const r1 = m.getReactivation();
  assert.ok(r1);
  const r2 = m.getReactivation();
  assert.equal(r2, null);
  assert.equal(m.isReactivationFired, true);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd L:/Dennis/Projects/glublm && node --test desk-pet/engine/bowl-memory.test.js`
Expected: 6 new tests FAIL.

- [ ] **Step 3: Add phrase pools + replace `getReactivation` placeholder**

In `desk-pet/engine/bowl-memory.js`:

(a) After the `function utcDaysBetween` definition (and before `export class MoodMemory`), add:

```js
export const SHORT_REACTIVATIONS = [
  'oh, you again!',
  "wait, weren't you just here?",
  'back already? hi!',
];
export const MED_REACTIVATIONS = [
  'where did the light go and come back?',
  'did the bowl get bigger or did i shrink?',
  'you came back. or maybe you never left and i forgot.',
];
export const LONG_REACTIVATIONS = [
  "i think i missed you. i'm not sure what missing means.",
  'the water moved a lot of times without you.',
  "hello again. i don't remember when you went but i'm glad you came.",
];

function pickFrom(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}
```

(b) Replace `getReactivation() { return null; /* placeholder, Task 5 */ }` with:

```js
  getReactivation() {
    if (this._reactivationFired) return null;
    const seen = this._s.last_seen_at;
    if (!seen) return null;
    const gapMs = this._now() - seen;
    if (gapMs < 30 * 60_000) return null;
    const gapH = gapMs / 3_600_000;
    this._reactivationFired = true;
    if (gapH < 2)      return { variant: 'short', text: pickFrom(SHORT_REACTIVATIONS) };
    else if (gapH < 8) return { variant: 'med',   text: pickFrom(MED_REACTIVATIONS) };
    else               return { variant: 'long',  text: pickFrom(LONG_REACTIVATIONS) };
  }
```

- [ ] **Step 4: Run tests to verify pass**

Run: `cd L:/Dennis/Projects/glublm && node --test desk-pet/engine/bowl-memory.test.js`
Expected: 21/21 pass.

- [ ] **Step 5: Commit**

```bash
git add desk-pet/engine/bowl-memory.js desk-pet/engine/bowl-memory.test.js
git commit -m "feat(bowl-memory): getReactivation + 3 variant phrase pools"
```

---

## Task 6: bowl-memory.js debounced save - verify timing

**Files:**
- Modify: `desk-pet/engine/bowl-memory.test.js` (append)

This task verifies behavior already implemented in Task 2. Pure test addition.

- [ ] **Step 1: Write failing test for debounced save**

Append to `desk-pet/engine/bowl-memory.test.js`:

```js
test('bowl-memory: rapid recordEvent debounces to single save after 500ms', async (t) => {
  const ls = installLocalStorageStub({});
  const { MoodMemory } = await loadModule();
  const m = new MoodMemory({ today: () => '2026-04-28' });
  m.load();
  // Allow the implicit save from Task 2 (load no-key -> writes nothing) to settle
  ls.glub_bowl_memory = ''; // clear what load might have written
  m.recordEvent('chat');
  m.recordEvent('chat');
  m.recordEvent('feed');
  // Before debounce window, file is still empty (no write yet)
  assert.equal(ls.glub_bowl_memory ?? '', '');
  await new Promise(r => setTimeout(r, 600));
  const persisted = JSON.parse(ls.glub_bowl_memory);
  assert.equal(persisted.total_chats, 2);
  assert.equal(persisted.total_feeds, 1);
});

test('bowl-memory: save({flush:true}) bypasses debounce', async () => {
  const ls = installLocalStorageStub({});
  const { MoodMemory } = await loadModule();
  const m = new MoodMemory({ today: () => '2026-04-28' });
  m.load();
  ls.glub_bowl_memory = '';
  m.recordEvent('chat');
  m.save({ flush: true });
  const persisted = JSON.parse(ls.glub_bowl_memory);
  assert.equal(persisted.total_chats, 1);
});
```

- [ ] **Step 2: Run tests**

Run: `cd L:/Dennis/Projects/glublm && node --test desk-pet/engine/bowl-memory.test.js`
Expected: 23/23 pass (debounce already implemented in Task 2).

If first test fails because `load()` with `installLocalStorageStub({})` writes via `save({flush:true})` then check Task 2 impl: the `load()` path on no-key should NOT call save; verify `if (!raw) { this._s = { ...DEFAULT_STATE }; return; }`.

- [ ] **Step 3: Commit**

```bash
git add desk-pet/engine/bowl-memory.test.js
git commit -m "test(bowl-memory): verify debounced save timing"
```

---

## Task 7: rituals.js skeleton + 30s timer + setDeps

**Files:**
- Create: `desk-pet/engine/rituals.test.js`
- Create: `desk-pet/engine/rituals.js`

- [ ] **Step 1: Write failing test for skeleton + 30s throttle**

Create `desk-pet/engine/rituals.test.js`:

```js
import { test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  installLocalStorageStub,
  resetAllStubs,
  makeSpeechMock,
  makeFsmMock,
  STATES_MOCK,
} from './test-stubs.js';

async function loadModule() {
  return await import('./rituals.js?t=' + Math.random());
}

beforeEach(() => { resetAllStubs(); });
afterEach(() => { resetAllStubs(); });

test('rituals: update(dt < 30) does not fire any check', async () => {
  installLocalStorageStub({});
  const { RitualScheduler } = await loadModule();
  const speech = makeSpeechMock();
  const fsm = makeFsmMock(STATES_MOCK.IDLE);
  const r = new RitualScheduler({ getHours: () => 6, today: () => '2026-04-28' });
  r.setDeps({ speech, fsm, STATES: STATES_MOCK });
  r.update(10);
  r.update(10);
  r.update(9);
  assert.equal(fsm._calls.length, 0);
  assert.equal(speech._calls.length, 0);
});

test('rituals: update without setDeps -> no crash, no-op', async () => {
  installLocalStorageStub({});
  const { RitualScheduler } = await loadModule();
  const r = new RitualScheduler({ getHours: () => 6, today: () => '2026-04-28' });
  // Note: no setDeps called
  assert.doesNotThrow(() => r.update(60));
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd L:/Dennis/Projects/glublm && node --test desk-pet/engine/rituals.test.js`
Expected: FAIL with `Cannot find module './rituals.js'`.

- [ ] **Step 3: Create minimal `rituals.js`**

Create `desk-pet/engine/rituals.js`:

```js
/**
 * Daily ritual scheduler - one-shot dawn (6-7am) and sunset (18-20) greetings.
 * Polls hour every 30s in the render loop. Persists last-fire UTC date per ritual.
 */

const FLAG_DAWN = 'glub_last_dawn_greeting';
const FLAG_SUNSET = 'glub_last_sunset_greeting';
const POLL_INTERVAL_S = 30;

export const DAWN_PHRASES = [
  'good morning! the light came back!',
  "oh hi sun! you're warm today.",
  'another day. another perfect day.',
];
export const SUNSET_PHRASES = [
  'the light is going away again. weird.',
  'everything is getting orange. nice.',
  'i think the sky is sleepy. me too. soon.',
];

function pickFrom(arr) { return arr[Math.floor(Math.random() * arr.length)]; }

function utcDateStr(ts = Date.now()) {
  const d = new Date(ts);
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export class RitualScheduler {
  constructor({
    now = () => Date.now(),
    getHours = () => new Date().getHours(),
    today = () => utcDateStr(),
  } = {}) {
    this._now = now;
    this._getHours = getHours;
    this._today = today;
    this._checkTimer = 0;
    this._inMemFlags = {};
    this._speech = null;
    this._fsm = null;
    this._STATES = null;
  }

  setDeps({ speech, fsm, STATES }) {
    this._speech = speech;
    this._fsm = fsm;
    this._STATES = STATES;
  }

  update(dt) {
    this._checkTimer += dt;
    if (this._checkTimer < POLL_INTERVAL_S) return;
    this._checkTimer = 0;

    if (!this._speech || !this._fsm || !this._STATES) return;
    if (this._fsm.currentState === this._STATES.SLEEPING) return;
    if (this._speech.isVisible) return;

    const hour = this._getHours();
    const today = this._today();

    // Dawn / sunset logic added in Tasks 8 + 9
  }

  reset() {
    this._inMemFlags = {};
    try {
      globalThis.localStorage?.removeItem(FLAG_DAWN);
      globalThis.localStorage?.removeItem(FLAG_SUNSET);
    } catch {}
  }

  _readFlag(key) {
    try { return globalThis.localStorage?.getItem(key) ?? this._inMemFlags[key] ?? null; }
    catch { return this._inMemFlags[key] ?? null; }
  }

  _writeFlag(key, val) {
    this._inMemFlags[key] = val;
    try { globalThis.localStorage?.setItem(key, val); } catch {}
  }
}

export const rituals = new RitualScheduler();
```

- [ ] **Step 4: Run tests to verify pass**

Run: `cd L:/Dennis/Projects/glublm && node --test desk-pet/engine/rituals.test.js`
Expected: 2/2 pass.

- [ ] **Step 5: Commit**

```bash
git add desk-pet/engine/rituals.js desk-pet/engine/rituals.test.js
git commit -m "feat(rituals): RitualScheduler skeleton + 30s polling"
```

---

## Task 8: rituals.js dawn fire logic

**Files:**
- Modify: `desk-pet/engine/rituals.test.js` (append)
- Modify: `desk-pet/engine/rituals.js` (add dawn block in `update`)

- [ ] **Step 1: Write failing tests for dawn**

Append to `desk-pet/engine/rituals.test.js`:

```js
test('rituals: dawn fires at hour=6 when flag != today', async () => {
  installLocalStorageStub({});
  const { RitualScheduler, DAWN_PHRASES } = await loadModule();
  const speech = makeSpeechMock();
  const fsm = makeFsmMock(STATES_MOCK.IDLE);
  const r = new RitualScheduler({ getHours: () => 6, today: () => '2026-04-28' });
  r.setDeps({ speech, fsm, STATES: STATES_MOCK });
  r.update(31);
  // FSM transition fires synchronously; speech.show fires via setTimeout 500ms
  assert.equal(fsm._calls.length, 1);
  assert.equal(fsm._calls[0].state, STATES_MOCK.HAPPY);
  await new Promise(r => setTimeout(r, 600));
  assert.equal(speech._calls.length, 1);
  assert.ok(DAWN_PHRASES.includes(speech._calls[0].text));
  assert.equal(globalThis.localStorage.getItem('glub_last_dawn_greeting'), '2026-04-28');
});

test('rituals: dawn skipped if flag == today', async () => {
  installLocalStorageStub({ glub_last_dawn_greeting: '2026-04-28' });
  const { RitualScheduler } = await loadModule();
  const speech = makeSpeechMock();
  const fsm = makeFsmMock(STATES_MOCK.IDLE);
  const r = new RitualScheduler({ getHours: () => 6, today: () => '2026-04-28' });
  r.setDeps({ speech, fsm, STATES: STATES_MOCK });
  r.update(31);
  await new Promise(r => setTimeout(r, 600));
  assert.equal(fsm._calls.length, 0);
  assert.equal(speech._calls.length, 0);
});

test('rituals: dawn skipped if fsm.SLEEPING + flag NOT set', async () => {
  const ls = installLocalStorageStub({});
  const { RitualScheduler } = await loadModule();
  const speech = makeSpeechMock();
  const fsm = makeFsmMock(STATES_MOCK.SLEEPING);
  const r = new RitualScheduler({ getHours: () => 6, today: () => '2026-04-28' });
  r.setDeps({ speech, fsm, STATES: STATES_MOCK });
  r.update(31);
  assert.equal(fsm._calls.length, 0);
  assert.equal(ls.glub_last_dawn_greeting, undefined);
});

test('rituals: dawn skipped if speech.isVisible', async () => {
  installLocalStorageStub({});
  const { RitualScheduler } = await loadModule();
  const speech = makeSpeechMock();
  speech.isVisible = true;
  const fsm = makeFsmMock(STATES_MOCK.IDLE);
  const r = new RitualScheduler({ getHours: () => 6, today: () => '2026-04-28' });
  r.setDeps({ speech, fsm, STATES: STATES_MOCK });
  r.update(31);
  assert.equal(fsm._calls.length, 0);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd L:/Dennis/Projects/glublm && node --test desk-pet/engine/rituals.test.js`
Expected: dawn fire test FAILS (dawn block not implemented yet); skip tests pass trivially due to early-return guards already in place.

- [ ] **Step 3: Add dawn block to `update`**

In `desk-pet/engine/rituals.js`, replace the comment `// Dawn / sunset logic added in Tasks 8 + 9` with:

```js
    if (hour >= 6 && hour < 7) {
      if (this._readFlag(FLAG_DAWN) !== today) {
        this._writeFlag(FLAG_DAWN, today);
        this._fsm.transition(this._STATES.HAPPY, { duration: 2, priority: 3 });
        const phrase = pickFrom(DAWN_PHRASES);
        setTimeout(() => this._speech.show(phrase, { type: 'fish', duration: 3 }), 500);
      }
    }
```

- [ ] **Step 4: Run tests to verify pass**

Run: `cd L:/Dennis/Projects/glublm && node --test desk-pet/engine/rituals.test.js`
Expected: 6/6 pass.

- [ ] **Step 5: Commit**

```bash
git add desk-pet/engine/rituals.js desk-pet/engine/rituals.test.js
git commit -m "feat(rituals): dawn greeting one-shot daily at 6-7am"
```

---

## Task 9: rituals.js sunset fire logic

**Files:**
- Modify: `desk-pet/engine/rituals.test.js` (append)
- Modify: `desk-pet/engine/rituals.js` (add sunset block after dawn)

- [ ] **Step 1: Write failing tests for sunset**

Append to `desk-pet/engine/rituals.test.js`:

```js
test('rituals: sunset fires at hour=18 when flag != today', async () => {
  installLocalStorageStub({});
  const { RitualScheduler, SUNSET_PHRASES } = await loadModule();
  const speech = makeSpeechMock();
  const fsm = makeFsmMock(STATES_MOCK.IDLE);
  const r = new RitualScheduler({ getHours: () => 18, today: () => '2026-04-28' });
  r.setDeps({ speech, fsm, STATES: STATES_MOCK });
  r.update(31);
  assert.equal(fsm._calls.length, 1);
  assert.equal(fsm._calls[0].state, STATES_MOCK.BLOWING_BUBBLES);
  await new Promise(r => setTimeout(r, 600));
  assert.equal(speech._calls.length, 1);
  assert.ok(SUNSET_PHRASES.includes(speech._calls[0].text));
  assert.equal(globalThis.localStorage.getItem('glub_last_sunset_greeting'), '2026-04-28');
});

test('rituals: skip both at hour=21', async () => {
  installLocalStorageStub({});
  const { RitualScheduler } = await loadModule();
  const speech = makeSpeechMock();
  const fsm = makeFsmMock(STATES_MOCK.IDLE);
  const r = new RitualScheduler({ getHours: () => 21, today: () => '2026-04-28' });
  r.setDeps({ speech, fsm, STATES: STATES_MOCK });
  r.update(31);
  assert.equal(fsm._calls.length, 0);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd L:/Dennis/Projects/glublm && node --test desk-pet/engine/rituals.test.js`
Expected: sunset fire test FAILS.

- [ ] **Step 3: Add sunset block**

In `desk-pet/engine/rituals.js`, after the `if (hour >= 6 && hour < 7) { ... }` block, add:

```js
    if (hour >= 18 && hour < 20) {
      if (this._readFlag(FLAG_SUNSET) !== today) {
        this._writeFlag(FLAG_SUNSET, today);
        this._fsm.transition(this._STATES.BLOWING_BUBBLES, { duration: 2.5, priority: 2 });
        const phrase = pickFrom(SUNSET_PHRASES);
        setTimeout(() => this._speech.show(phrase, { type: 'fish', duration: 3 }), 500);
      }
    }
```

- [ ] **Step 4: Run tests to verify pass**

Run: `cd L:/Dennis/Projects/glublm && node --test desk-pet/engine/rituals.test.js`
Expected: 8/8 pass.

- [ ] **Step 5: Commit**

```bash
git add desk-pet/engine/rituals.js desk-pet/engine/rituals.test.js
git commit -m "feat(rituals): sunset greeting one-shot daily at 18-20"
```

---

## Task 10: idle.js mood + hour bias in _selectPhrase

**Files:**
- Modify: `desk-pet/engine/idle.js`

No new tests for `idle.js` (existing module had no test file; structural change is small and integration-tested manually in browser). Backward-compat must be preserved: with no providers wired, behavior must equal the current uniform-random pick.

- [ ] **Step 1: Add provider setters and replace `_selectPhrase`**

In `desk-pet/engine/idle.js`:

(a) In the `IdleScheduler` constructor (after `this._enabled = true;` line 45), add:

```js
    this._getMood = null;
    this._getHour = null;
```

(b) After the `setEnabled(v)` method (line 84), add:

```js
  /** Inject mood provider () => 0..3 (joyful=3, neglected=0). */
  setMoodProvider(fn) { this._getMood = fn; }

  /** Inject hour-of-day provider () => 0..23 (local hour). */
  setHourProvider(fn) { this._getHour = fn; }
```

(c) Replace the entire `_selectPhrase()` method (lines 109-127) with:

```js
  _selectPhrase() {
    const candidates = this._phrases.filter(p => !this._recentlyShown.includes(p.text));
    let pool;
    if (candidates.length > 0) {
      pool = candidates;
    } else {
      this._recentlyShown = [];
      pool = this._phrases;
    }

    const mood = this._getMood ? this._getMood() : 2;
    const hour = this._getHour ? this._getHour() : 12;
    const moodCat = mood === 3 ? 'cheerful' : mood === 0 ? 'existential' : null;
    const hourCat = hour >= 6 && hour < 12 ? 'morning'
                  : hour >= 18 && hour < 22 ? 'evening' : null;

    const weighted = pool.map(p => {
      const baseW = p.weight ?? 1;
      const moodMul = (moodCat && p.category === moodCat) ? 2.0 : 1.0;
      const hourMul = (hourCat && p.category === hourCat) ? 1.5 : 1.0;
      return { p, w: baseW * moodMul * hourMul };
    });

    const totalW = weighted.reduce((s, x) => s + x.w, 0);
    if (totalW <= 0) return pool[0];

    let r = Math.random() * totalW;
    let pick = weighted[weighted.length - 1].p;
    for (const { p, w } of weighted) {
      r -= w;
      if (r <= 0) { pick = p; break; }
    }

    this._recentlyShown.push(pick.text);
    if (this._recentlyShown.length > 15) this._recentlyShown.shift();

    return pick;
  }
```

- [ ] **Step 2: Sanity-check by running existing test suite**

Run: `cd L:/Dennis/Projects/glublm && node --test desk-pet/engine/sound.test.js desk-pet/engine/haptic.test.js desk-pet/engine/onboarding.test.js desk-pet/engine/bowl-memory.test.js desk-pet/engine/rituals.test.js`
Expected: all green.

- [ ] **Step 3: Commit**

```bash
git add desk-pet/engine/idle.js
git commit -m "feat(idle): mood + hour weighted bias in _selectPhrase (backward-compat)"
```

---

## Task 11: app.js wiring - imports + init + providers + listeners

**Files:**
- Modify: `desk-pet/app.js`

This task adds the orchestration: import the new modules, wire them after FSM creation, register `visibilitychange` + `pagehide` listeners, expose dev console handle. Event recording call-sites and the FSM listener extension are added in Task 12.

- [ ] **Step 1: Add imports**

In `desk-pet/app.js`, after the existing `import { getHaptic } from './engine/haptic.js';` (around line 27), add:

```js
import { bowlMemory } from './engine/bowl-memory.js';
import { rituals } from './engine/rituals.js';
```

- [ ] **Step 2: Locate init region**

In `desk-pet/app.js`, find where FSM and IdleScheduler are constructed (around line 160-180 in the init function - look for `idle = new IdleScheduler(...)` or similar). Identify the spot AFTER all systems are constructed but BEFORE the render loop starts.

- [ ] **Step 3: Add init wiring after FSM + idle creation**

Insert the following block immediately after `idle = new IdleScheduler(speech, fsm);` (or whatever the existing IdleScheduler instantiation line is):

```js
  // Bowl memory + rituals (Cluster B.2)
  bowlMemory.load();
  bowlMemory.recordSeen();
  rituals.setDeps({ speech, fsm, STATES });
  idle.setMoodProvider(() => bowlMemory.getMoodScore());
  idle.setHourProvider(() => new Date().getHours());

  // Reactivation phrase post-onboarding (delay 2.5s to let onboarding settle)
  const reactivation = bowlMemory.getReactivation();
  if (reactivation) {
    setTimeout(() => {
      if (!speech.isVisible) {
        speech.show(reactivation.text, { type: 'fish', duration: 4 });
      }
    }, 2500);
  }

  // Dev console handle (no UI surface yet)
  if (typeof window !== 'undefined') window.bowlMemory = bowlMemory;
```

- [ ] **Step 4: Add render-loop call to `rituals.update`**

In `desk-pet/app.js`, locate the `function render(dt)` body (around line 492). After `speech.update(dt);` (around line 501) or near `dissolve.update(dt);`, add:

```js
  rituals.update(dt);
```

- [ ] **Step 5: Add visibility + pagehide listeners**

In `desk-pet/app.js`, near other top-level `document.addEventListener(...)` calls (search for an existing `addEventListener('visibilitychange')` or pick an init-time location), add:

```js
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) bowlMemory.recordSeen();
  });
  window.addEventListener('pagehide', () => bowlMemory.save({ flush: true }));
```

If a `visibilitychange` listener already exists in `app.js` (search for `'visibilitychange'`), append the `bowlMemory.recordSeen()` call inside its handler instead of creating a duplicate listener.

- [ ] **Step 6: Manual smoke - load page in DevTools**

There are no Node-level tests for `app.js` integration. Defer browser validation to Task 14. Run instead the static syntax check:

Run: `cd L:/Dennis/Projects/glublm && node --check desk-pet/app.js`
Expected: no syntax errors.

If syntax error: investigate the inserted code and re-check brace balance.

- [ ] **Step 7: Commit**

```bash
git add desk-pet/app.js
git commit -m "feat(app): wire bowl-memory + rituals + idle providers + visibility listeners"
```

---

## Task 12: app.js event recording call-sites + FSM listener extension

**Files:**
- Modify: `desk-pet/app.js`

Three places to add `bowlMemory.recordEvent(...)`:

1. **chat submit** - inside `handleChat(text)` (around line 115-150)
2. **double-click EXCITED** - on the click handler that triggers `STATES.EXCITED` (around line 209 or 386)
3. **EATING via FSM** - extend the existing `fsm.onStateChange` listener (around line 649-651)

- [ ] **Step 1: Record on chat submit**

In `desk-pet/app.js`, locate `async function handleChat(text)` (around line 115). Add `bowlMemory.recordEvent('chat')` at the very top of the function body, right after the `chatBusy = true;` (or equivalent guard) line:

```js
async function handleChat(text) {
  if (chatBusy) return;
  chatBusy = true;
  bowlMemory.recordEvent('chat');
  // ... existing body
```

If `chatBusy = true` is not the first line, place `recordEvent` immediately after wherever the early-exit `if (chatBusy) return;` sits.

- [ ] **Step 2: Record on double-click EXCITED**

In `desk-pet/app.js`, find the call-site that triggers `STATES.EXCITED` from a double-click (around line 209 - search for `fsm.transition(STATES.EXCITED, { duration: 1.5, priority: 3 });`). Look at surrounding context to identify which is the user-initiated double-click (vs random event or post-chat state pick). Add `bowlMemory.recordEvent('excited');` immediately before `fsm.transition(STATES.EXCITED, ...)`.

If multiple call-sites trigger EXCITED, only the user-initiated double-click handler should record - NOT the post-chat random state pick (line 158) and NOT any random-event ticker.

If unsure which call-site is user-initiated, search for nearby strings like `dblclick`, `dblclickListener`, `pointerdown` with click count tracking, or `lastTapTime`.

- [ ] **Step 3: Extend existing FSM onStateChange listener**

In `desk-pet/app.js` around line 649-651, the existing listener is:

```js
  fsm.onStateChange((newState) => {
    if (newState === STATES.EATING) sound.play('nom_nom_eat');
    if (newState === STATES.EXCITED) sound.play('excited_celebration');
  });
```

Extend it to:

```js
  fsm.onStateChange((newState) => {
    if (newState === STATES.EATING) {
      sound.play('nom_nom_eat');
      bowlMemory.recordEvent('feed');
    }
    if (newState === STATES.EXCITED) sound.play('excited_celebration');
  });
```

Note: we record `'feed'` on `EATING` even if random-event-triggered (not user-initiated). Rationale: a `feed` from the user's perspective = "the fish ate something" which corresponds to `EATING`. This includes random-event eats but those are infrequent enough that streak tracking remains user-driven. Alternative (record only user-initiated feeds) would require a separate state tag, not justified for B.2 scope.

- [ ] **Step 4: Static syntax check**

Run: `cd L:/Dennis/Projects/glublm && node --check desk-pet/app.js`
Expected: no syntax errors.

- [ ] **Step 5: Commit**

```bash
git add desk-pet/app.js
git commit -m "feat(app): record bowl-memory events at chat/excited/EATING call-sites"
```

---

## Task 13: sw.js cache bump v7 -> v8

**Files:**
- Modify: `desk-pet/sw.js`

- [ ] **Step 1: Bump CACHE_VERSION**

In `desk-pet/sw.js` line 10, change:

```js
const CACHE_VERSION = 'glub-v7';
```

to:

```js
const CACHE_VERSION = 'glub-v8';
```

- [ ] **Step 2: Add new files to STATIC_ASSETS**

In `desk-pet/sw.js`, in the `STATIC_ASSETS` array (lines 13-35), after `'./engine/haptic.js',` add:

```js
  './engine/bowl-memory.js',
  './engine/rituals.js',
```

- [ ] **Step 3: Static syntax check**

Run: `cd L:/Dennis/Projects/glublm && node --check desk-pet/sw.js`
Expected: no syntax errors.

- [ ] **Step 4: Commit**

```bash
git add desk-pet/sw.js
git commit -m "chore(sw): cache bump v7->v8 with bowl-memory + rituals"
```

---

## Task 14: Final validation + push

**Files:**
- None modified

- [ ] **Step 1: Run all desk-pet tests**

Run: `cd L:/Dennis/Projects/glublm && node --test desk-pet/engine/sound.test.js desk-pet/engine/haptic.test.js desk-pet/engine/onboarding.test.js desk-pet/engine/bowl-memory.test.js desk-pet/engine/rituals.test.js desk-pet/inference/tokenizer.test.js`
Expected: all green. Specifically:
- sound.test.js: 16/16
- haptic.test.js: 10/10
- onboarding.test.js: 7/7
- bowl-memory.test.js: 23/23
- rituals.test.js: 8/8
- tokenizer.test.js: 3/3
- **Total: 67/67**

- [ ] **Step 2: Run pytest backend regression**

Run: `cd L:/Dennis/Projects/glublm && "C:/Users/Dennis/.venv-glublm/Scripts/python.exe" -m pytest -q`
Expected: 78/78 pass (no backend changes, regression check only).

- [ ] **Step 3: Static syntax checks on modified app.js / sw.js**

Run: `cd L:/Dennis/Projects/glublm && node --check desk-pet/app.js && node --check desk-pet/sw.js && node --check desk-pet/engine/idle.js`
Expected: no errors.

- [ ] **Step 4: Push to origin/master**

```bash
cd L:/Dennis/Projects/glublm && git push origin master
```

Wait for GH Pages deploy (auto-deploy on push to master). Verify URL: `https://den-sec.github.io/glublm/desk-pet/`.

- [ ] **Step 5: Document deferred manual browser validation**

Manual checks not part of this plan (operator follow-up):

- First-ever load (cleared localStorage): no reactivation, idle phrases work
- Reload after 1h (DevTools clock shift): short reactivation phrase visible
- Reload after 4h (DevTools): med reactivation
- Reload after 24h+ (DevTools): long reactivation
- DevTools console: `window.bowlMemory.state` shows expected fields
- Manual hour shift to 6:30am (system clock or DevTools): dawn greeting fires within 30s
- Same load, repeat 6:31am: no re-fire (flag set)
- Manual hour shift to 18:30: sunset greeting fires
- axe-core 0 violations
- `prefers-reduced-motion`: greetings still work (speech only, no extra animation)

---

## Self-Review

**Spec coverage:**

- Bowl memory persistence (Tasks 2-6) ✓
- mood_score recency-based (Task 3) ✓
- streak with 24h grace (Task 4) ✓
- Reactivation 30min threshold + variant by gap + one-shot (Task 5) ✓
- Day/night rituals via 30s polling (Tasks 7-9) ✓
- Sleep + speech.isVisible conflict avoidance (Task 8 dawn skip tests) ✓
- idle.js mood + hour bias (Task 10) ✓
- app.js wiring + listeners (Tasks 11-12) ✓
- SW cache bump (Task 13) ✓

**Placeholder scan:**

- No "TBD"/"TODO" in code blocks ✓
- All test code complete with real assertions ✓
- All implementation snippets complete and runnable ✓

**Type consistency:**

- `MoodMemory` constructor signature `{ now, today }` consistent across Tasks 2-6 ✓
- `RitualScheduler` constructor signature `{ now, getHours, today }` consistent in Tasks 7-9 ✓
- `STATES_MOCK.BLOWING_BUBBLES` matches actual `STATES.BLOWING_BUBBLES` from `state-machine.js:24` ✓
- `STATES.EATING` (not `STATES.EAT`) matches state-machine.js:26 ✓
- `bowlMemory.getMoodScore()` returns 0-3 integer; `idle.js` consumes `() => 0..3` ✓
- Phrase pool exports (`SHORT_REACTIVATIONS` etc.) consumed in tests ✓

**Risks / open items:**

- Task 12 Step 2 requires manual identification of the user-initiated double-click EXCITED call-site. If the codebase has both random-event and user-event triggers, the implementer must distinguish them. The fallback (record on FSM listener for EXCITED too) would over-count for `total_excited` but mood/streak are unaffected. If the implementer cannot distinguish in <5min, fall back to recording in the FSM listener and remove the call-site recording.
- Task 11 Step 5 has a defensive branch ("if a visibilitychange listener already exists, append..."). Verify by grep at execution time. The current `app.js` has no visibility listener (verified in this plan-write).

---

Plan complete and saved to `docs/superpowers/plans/2026-04-28-cluster-b2-bowl-memory-rituals.md`.

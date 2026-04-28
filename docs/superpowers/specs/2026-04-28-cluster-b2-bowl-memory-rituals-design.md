# GlubLM Cluster B.2 - Bowl Memory + Day/Night Rituals Design Spec

> Cross-session retention layer for the Desk Pet PWA: persisted mood-state object + dawn/sunset greetings.
>
> Date: 2026-04-28
> Status: Draft
> Scope: `desk-pet/` only - features deferred from 2026-04-20 Cluster B (engagement layer)
> Predecessor: `2026-04-20-cluster-b-engagement-design.md` (audio + haptic + onboarding gestures)

## Overview

Cluster B.2 closes the deferred section of the 2026-04-20 Cluster B spec. It adds two cross-session retention features that complement the first-impression richness already shipped in S1 (sound + haptic + onboarding v2).

**Two features**:

1. **Bowl memory persistence** - the fish remembers timestamps, counters, mood, and streak across sessions; reacts on return with variant-specific phrases.
2. **Day/night rituals** - one-shot daily dawn (6-7am) and sunset (18-20) greetings via speech bubble + soft FSM transition.

The features share the same axis (cross-session retention) but are otherwise independent and live in two separate modules.

## Success criteria

**Primary metric**: cross-session retention - returning visitors feel the fish "remembers" them and has its own daily rhythm.

Operational checks for "success":

- A returning visitor (gap >= 30min from last_seen_at) gets a variant-appropriate reactivation phrase via speech bubble within 2-3s of load
- A user who feeds/chats N consecutive days sees `streak_days` accumulate (UTC date-based, 24h grace)
- The fish's idle phrase selection is biased by mood (joyful/lonely/neglected) and hour-of-day (morning/evening categories)
- Dawn and sunset greetings fire at most once per UTC day, even with the tab open H24
- Greetings respect existing sleep state (no fire while STATES.SLEEPING) and active speech bubble (no override)
- No regressions in a11y (axe-core 0 violations baseline preserved)
- No regressions on Lighthouse (best-practices 74, performance 78 are the floor)

**Out of scope for success**: bowl memory exposure in settings UI (dev-only console reset), companion aquarium memory port, shared memory across desk-pet/companion surfaces.

## Design decisions (already taken)

| # | Decision | Rationale |
|---|---|---|
| 1 | **Bowl memory: rich mood-state object** (8+1 fields) | Dennis preferred richness over minimal 3-field. Counters and streak unlock future features (badges, achievements). Pattern matches "pet that grows" model |
| 2 | **mood_score: discrete 0-3 + recency-based, computed on-read** | Stateless from timestamps (joyful <2h, ok <8h, lonely <24h, neglected >=24h). No decay tick, no setInterval, deterministic |
| 3 | **streak_days: UTC date-based + 24h grace** | Robust to timezone shift / DST. 1 missed day forgiven, 2+ resets. Stores `last_interaction_day_utc` (YYYY-MM-DD) |
| 4 | **Reactivation: on load if gap >= 30min, once per session** | 30min threshold avoids tab-refresh re-fire. Variant by gap (short 30m-2h / med 2-8h / long >=8h). One-shot via in-memory `_reactivationFired` flag |
| 5 | **Day/night detection: polling getHours() in render loop** | Reuses existing pattern (`app.js:556` sleep check). 30s poll cadence (vs 5s sleep) - day/night not time-critical |
| 6 | **Greetings: speech bubble + soft FSM transition** | Mirrors existing wake-up pattern (`app.js:570-573`). Dawn -> HAPPY (2s), sunset -> BLOWING_BUBBLES (2.5s). Speech delayed 500ms post-FSM |
| 7 | **Greeting fire window: one-shot daily + persistent flag** | `glub_last_dawn_greeting` / `glub_last_sunset_greeting` = UTC date string. First-load catch-up handled (flag-vs-today comparison, not transition trigger) |
| 8 | **Architecture: 2 isolated modules** (`bowl-memory.js` + `rituals.js`) | Mirror S1 pattern (`sound.js`, `haptic.js`). SRP: state mgmt vs time scheduling are different concerns. Separate test files |

## Architecture

### Module structure

```
desk-pet/engine/
  bowl-memory.js       (NEW ~120 lines) - MoodMemory class + reactivation logic
  bowl-memory.test.js  (NEW ~150 lines) - 12 unit test
  rituals.js           (NEW ~80  lines) - RitualScheduler class + dawn/sunset detection
  rituals.test.js      (NEW ~100 lines) - 8 unit test
  idle.js              (EXT +20 lines)  - mood + hour bias in _selectPhrase
  test-stubs.js        (EXT)            - mock speech / fsm / clock helpers
desk-pet/
  app.js               (EXT +30 lines)  - wire memory, rituals, listeners
  sw.js                (EXT)            - cache bump v7 -> v8 + new files
```

### Component diagram

```
+----------------+      recordEvent      +----------------+
|    app.js      |---------------------->|  bowl-memory   |
|  (orchestrator)|<----getMoodScore------|   (singleton)  |
|                |     getReactivation   |                |
|                |---->setDeps---------->|    rituals     |
|                |<----update(dt)--------|   (singleton)  |
|                |                       |                |
|                |     setMoodProvider   +----------------+
|                |---->setHourProvider-->|     idle.js    |
+----------------+                       |   (existing)   |
                                         +----------------+
```

## Components

### `engine/bowl-memory.js`

Persisted state manager + reactivation logic. One class, singleton export.

**Public API**:

```js
class MoodMemory {
  constructor({ now = () => Date.now(), today = () => utcDateStr() } = {});

  load();                          // localStorage glub_bowl_memory -> deserialize; reset on malformed
  save({ flush = false } = {});    // serialize to localStorage; flush=true bypasses debounce
  recordEvent(type);               // 'feed' | 'chat' | 'excited'; updates timestamps + counters + streak; debounced save
  recordSeen();                    // updates last_seen_at; called on init + visibilitychange visible
  getMoodScore();                  // 0-3, computed on-demand from timestamps
  getReactivation();               // returns { variant, text } | null; one-shot per instance via _reactivationFired flag
  reset();                         // clear localStorage + reset in-memory state
  get state();                     // readonly snapshot { ...timestamps, counters, mood_score, streak_days }
  get isReactivationFired();       // bool, exposed for tests
}
export const bowlMemory = new MoodMemory();
```

**Persisted shape** (single localStorage key `glub_bowl_memory` = JSON):

```json
{
  "version": 1,
  "last_feed_at": 1714294800000,
  "last_chat_at": 1714294900000,
  "last_excited_at": 1714294700000,
  "last_seen_at": 1714295000000,
  "total_feeds": 17,
  "total_chats": 42,
  "total_excited": 8,
  "streak_days": 5,
  "last_interaction_day_utc": "2026-04-28"
}
```

`mood_score` is computed on-read, not persisted.

`total_excited` is included for symmetry with `total_feeds` / `total_chats` (3 event types -> 3 counters). Adds 9 persisted fields total (deviates from "8 fields" mentioned earlier; symmetry preferred).

**Mood score computation** (stateless, pure):

```js
getMoodScore() {
  const mostRecent = Math.max(
    this._s.last_chat_at || 0,
    this._s.last_feed_at || 0,
    this._s.last_excited_at || 0
  );
  if (mostRecent === 0) return 0;       // never interacted
  const ageH = (this._now() - mostRecent) / 3_600_000;
  if (ageH < 2)  return 3;              // joyful
  if (ageH < 8)  return 2;              // ok
  if (ageH < 24) return 1;              // lonely
  return 0;                             // neglected
}
```

**Reactivation logic**:

```js
getReactivation() {
  if (this._reactivationFired) return null;
  const seen = this._s.last_seen_at;
  if (!seen) return null;                              // first ever load
  const gapMs = this._now() - seen;
  if (gapMs < 30 * 60_000) return null;                // <30min, skip refresh case
  const gapH = gapMs / 3_600_000;
  this._reactivationFired = true;
  let variant, text;
  if (gapH < 2)      { variant = 'short'; text = pickFrom(SHORT_REACTIVATIONS); }
  else if (gapH < 8) { variant = 'med';   text = pickFrom(MED_REACTIVATIONS); }
  else               { variant = 'long';  text = pickFrom(LONG_REACTIVATIONS); }
  return { variant, text };
}
```

**Phrase pools** (hardcoded in module, 3-4 each):

```js
const SHORT_REACTIVATIONS = [
  "oh, you again!",
  "wait, weren't you just here?",
  "back already? hi!"
];
const MED_REACTIVATIONS = [
  "where did the light go and come back?",
  "did the bowl get bigger or did i shrink?",
  "you came back. or maybe you never left and i forgot."
];
const LONG_REACTIVATIONS = [
  "i think i missed you. i'm not sure what missing means.",
  "the water moved a lot of times without you.",
  "hello again. i don't remember when you went but i'm glad you came."
];
```

**Streak update**:

```js
recordEvent(type) {
  const now = this._now();
  const today = this._today();           // 'YYYY-MM-DD' UTC
  const last = this._s.last_interaction_day_utc;

  if (!last) {
    this._s.streak_days = 1;
  } else if (last !== today) {
    const gapDays = utcDaysBetween(last, today);
    if (gapDays <= 2) this._s.streak_days += 1;        // 24h grace (1 missed day forgiven)
    else              this._s.streak_days = 1;         // reset
  }
  this._s.last_interaction_day_utc = today;

  if (type === 'feed')    { this._s.last_feed_at    = now; this._s.total_feeds    += 1; }
  if (type === 'chat')    { this._s.last_chat_at    = now; this._s.total_chats    += 1; }
  if (type === 'excited') { this._s.last_excited_at = now; this._s.total_excited  += 1; }

  this._scheduleSave();
}
```

`utcDaysBetween('2026-04-26', '2026-04-28')` -> 2 (no time-of-day, pure date math).

**Save throttling**: `_scheduleSave()` uses `setTimeout(_save, 500)` debounce. New event during pending save -> resets timer. `pagehide` listener calls `save({ flush: true })` for sync flush.

**Error handling**:

- Malformed JSON in localStorage -> `console.warn` once + reset to defaults + save fresh
- localStorage quota / disabled -> try/catch, silent no-op, in-memory state preserved for session, `console.warn` once
- Unknown event type -> throw `Error('Unknown event type: X')` (dev-only, catches typos)
- Schema version mismatch (future) -> migrate or reset to defaults

### `engine/rituals.js`

Time-based scheduler for daily greetings. One class, singleton export.

**Public API**:

```js
class RitualScheduler {
  constructor({
    now = () => Date.now(),
    getHours = () => new Date().getHours(),
    today = () => utcDateStr()
  } = {});
  setDeps({ speech, fsm, STATES });    // injected by app.js init
  update(dt);                          // called from render loop; internal 30s throttle
  reset();                             // dev/test - clear flags
}
export const rituals = new RitualScheduler();
```

**Logic** (in `update(dt)`):

```js
update(dt) {
  this._checkTimer += dt;
  if (this._checkTimer < 30) return;
  this._checkTimer = 0;

  if (!this._speech || !this._fsm || !this._STATES) return;   // deps not wired yet
  if (this._fsm.currentState === this._STATES.SLEEPING) return;
  if (this._speech.isVisible) return;

  const hour = this._getHours();
  const today = this._today();

  if (hour >= 6 && hour < 7) {
    if (this._readFlag('glub_last_dawn_greeting') !== today) {
      this._writeFlag('glub_last_dawn_greeting', today);
      this._fsm.transition(this._STATES.HAPPY, { duration: 2, priority: 3 });
      setTimeout(() => this._speech.show(pickFrom(DAWN_PHRASES), { type: 'fish', duration: 3 }), 500);
    }
  }

  if (hour >= 18 && hour < 20) {
    if (this._readFlag('glub_last_sunset_greeting') !== today) {
      this._writeFlag('glub_last_sunset_greeting', today);
      this._fsm.transition(this._STATES.BLOWING_BUBBLES, { duration: 2.5, priority: 2 });
      setTimeout(() => this._speech.show(pickFrom(SUNSET_PHRASES), { type: 'fish', duration: 3 }), 500);
    }
  }
}
```

**Conflict avoidance**: skip greeting if SLEEPING or speech bubble already visible. Flag NOT set on skip - retry next 30s. If hour leaves window without fire (e.g., pesce SLEEPING through 6-7am window), skip for today.

**Phrase pools** (hardcoded, 3 each):

```js
const DAWN_PHRASES = [
  "good morning! the light came back!",
  "oh hi sun! you're warm today.",
  "another day. another perfect day."
];
const SUNSET_PHRASES = [
  "the light is going away again. weird.",
  "everything is getting orange. nice.",
  "i think the sky is sleepy. me too. soon."
];
```

**Error handling**:

- localStorage quota / disabled -> in-memory fallback `_inMemoryFlags = {}`, ritual state lost on reload (acceptable for ephemeral feature)

### `engine/idle.js` extension

Adds mood + hour bias to phrase selection. No structural changes; extends `_selectPhrase()`.

**New methods on `IdleScheduler`**:

```js
setMoodProvider(fn) { this._getMood = fn; }   // () => 0-3
setHourProvider(fn) { this._getHour = fn; }   // () => 0-23
```

**Modified `_selectPhrase()`** (weighted-random replaces uniform):

```js
_selectPhrase() {
  const candidates = this._phrases.filter(p => !this._recentlyShown.includes(p.text));
  const pool = candidates.length > 0 ? candidates : (this._recentlyShown = [], this._phrases);

  const mood = this._getMood ? this._getMood() : 2;
  const hour = this._getHour ? this._getHour() : 12;
  const moodCat   = mood === 3 ? 'cheerful'  : mood === 0 ? 'existential' : null;
  const hourCat   = hour >= 6 && hour < 12 ? 'morning'
                  : hour >= 18 && hour < 22 ? 'evening' : null;

  const weighted = pool.map(p => ({
    p,
    w: (p.weight ?? 1)
       * (p.category === moodCat ? 2.0 : 1.0)
       * (p.category === hourCat ? 1.5 : 1.0)
  }));

  const totalW = weighted.reduce((s, x) => s + x.w, 0);
  let r = Math.random() * totalW;
  for (const { p, w } of weighted) { r -= w; if (r <= 0) { /* track + return */ return p; } }
  return weighted[weighted.length - 1].p;
}
```

Backward-compatible: if no providers wired, `mood=2` (ok) and `hour=12` (afternoon) -> no category bias triggers, behaves identical to current uniform-random pick (within the categorization noise).

### `app.js` integration

```js
// Imports (top of file)
import { bowlMemory } from './engine/bowl-memory.js';
import { rituals }    from './engine/rituals.js';

// Init (after FSM creation)
bowlMemory.load();
bowlMemory.recordSeen();
rituals.setDeps({ speech, fsm, STATES });
idleScheduler.setMoodProvider(() => bowlMemory.getMoodScore());
idleScheduler.setHourProvider(() => new Date().getHours());

// Reactivation phrase post-onboarding (delay 2.5s to let onboarding settle)
const reactivation = bowlMemory.getReactivation();
if (reactivation) {
  setTimeout(() => speech.show(reactivation.text, { type: 'fish', duration: 4 }), 2500);
}

// Event recording call-sites
// chat submit handler:                 bowlMemory.recordEvent('chat');
// double-click EXCITED handler:        bowlMemory.recordEvent('excited');
// FSM onStateChange listener -> EATING bowlMemory.recordEvent('feed');

// Render loop (in render(dt) function)
rituals.update(dt);

// Visibility refresh
document.addEventListener('visibilitychange', () => {
  if (!document.hidden) bowlMemory.recordSeen();
});

// Pagehide flush
window.addEventListener('pagehide', () => bowlMemory.save({ flush: true }));

// Dev console handle (no UI surface yet)
if (typeof window !== 'undefined') window.bowlMemory = bowlMemory;
```

### Call-site mapping

| File | Approx line | Addition |
|---|---|---|
| `app.js` imports | ~10-15 | `import { bowlMemory } from './engine/bowl-memory.js';` `import { rituals } from './engine/rituals.js';` |
| `app.js` init (after FSM creation) | ~160-180 | load + recordSeen + setDeps + setProviders + reactivation timeout |
| `app.js` chat submit handler | ~390 | `bowlMemory.recordEvent('chat')` |
| `app.js` double-click excited handler | ~460 | `bowlMemory.recordEvent('excited')` |
| `app.js` FSM `onStateChange` listener (existing from S1) | - | `if (state === STATES.EATING) bowlMemory.recordEvent('feed')` |
| `app.js` render loop | ~492-575 | `rituals.update(dt)` |
| `app.js` global listeners | top | `visibilitychange` + `pagehide` |

## localStorage schema

| Key | Values | Default | Status |
|---|---|---|---|
| `glub_notif_freq` | `0/2/4/8` | `4` | existing |
| `glub_fish_name` | string | `glub` | existing |
| `glub_installed` | `1/null` | `null` | existing |
| `glub_install_dismissed` | `1/null` | `null` | existing |
| `glub_install_show_count` | int | `0` | existing |
| `glub_onboarded_v1` | `1/null` | `null` | existing |
| `glub_onboarded_v2` | `1/null` | `null` | existing (S1) |
| `glub_audio_enabled` | `1/0` | `1` | existing (S1) |
| `glub_haptic_enabled` | `1/0` | `1` | existing (S1) |
| `glub_bowl_memory` | JSON object | `null` | **NEW** (B.2) |
| `glub_last_dawn_greeting` | `YYYY-MM-DD` UTC | `null` | **NEW** (B.2) |
| `glub_last_sunset_greeting` | `YYYY-MM-DD` UTC | `null` | **NEW** (B.2) |

## Edge cases

| # | Scenario | Behavior |
|---|---|---|
| 1 | Tab open H24 | Day N: dawn fires, flag = today UTC. Day N+1 dawn window: `today` shifts to N+1 -> fires |
| 2 | Pesce SLEEPING during dawn (rare - 22-06 + 6-7) | Skip + flag NOT set -> retry every 30s. If pesce wakes pre-7am -> fire. Else skip for today |
| 3 | Page reload at 6:30 after greeting fired | Flag = today -> skip. ✓ |
| 4 | Reactivation + dawn collision | Reactivation has 2.5s delay; dawn polled every 30s. Reactivation fires first; if dawn fires later, normal speech bubble override (existing behavior) |
| 5 | Tab background long absence | `visibilitychange` listener calls `recordSeen()` on return. Reactivation already fired on init - no re-fire mid-session (`_reactivationFired` flag) |
| 6 | localStorage quota / disabled | bowl-memory: try/catch, in-memory only, console.warn. rituals: same pattern, ephemeral flags lost on reload |
| 7 | First-ever load | `getReactivation()` -> null (no last_seen_at). `recordSeen()` sets seen now. Mood = 0 ('never interacted') -> no category bias |
| 8 | Settings reset (UI) | Out of scope B.2: `bowlMemory.reset()` exposed dev-only via `window.bowlMemory.reset()` console |
| 9 | Sleep timing collision with sunset (18-20) | No conflict (sleep window 22-06) |
| 10 | Reduced-motion | rituals respect via fsm.transition (FSM is a11y-compliant). Reactivation = speech only. ✓ |
| 11 | Malformed JSON in localStorage | `load()` -> JSON.parse throws -> `console.warn` + reset to defaults + immediate save (overwrites garbage) |
| 12 | Schema version field for future migrations | `version: 1` persisted; future `load()` checks `parsed.version` and migrates if known, resets if unknown |
| 13 | Streak: gap exactly 24h | `utcDaysBetween` returns 1 -> grace applies, +1 |
| 14 | Streak: gap 48h | `utcDaysBetween` returns 2 -> grace applies, +1 (1 day missed forgiven) |
| 15 | Streak: gap 72h+ | `utcDaysBetween` returns >= 3 -> reset to 1 |

## Testing strategy

### Unit tests (Node 20 `node:test`)

**`bowl-memory.test.js`** (~12 test):

- Constructor with default deps -> defaults safe
- `load()` with no localStorage entry -> safe defaults
- `load()` with malformed JSON -> warn + reset to defaults
- `load()` with valid persisted state -> deserializes correctly
- `recordEvent('chat')` -> timestamps + counter + streak update
- `recordEvent('feed')` updates `total_feeds` not `total_chats`
- Streak: same UTC day -> no increment
- Streak: gap 1 UTC day -> +1
- Streak: gap 2 UTC days -> +1 (grace)
- Streak: gap 3+ UTC days -> reset to 1
- mood_score: never interacted -> 0
- mood_score: <2h ago -> 3, <8h -> 2, <24h -> 1, >=24h -> 0 (4 cases combined)
- `getReactivation()`: <30min gap -> null
- `getReactivation()`: 1h gap -> short variant from SHORT pool
- `getReactivation()`: 4h gap -> med variant
- `getReactivation()`: 12h gap -> long variant
- `getReactivation()`: second call same instance -> null (one-shot)
- `save()` debounce: rapid recordEvent x3 -> single localStorage.setItem after 500ms
- `save({flush: true})` -> immediate setItem

**`rituals.test.js`** (~8 test):

- `update(dt < 30)` repeatedly -> no checks fired (timer accumulator)
- `update(30+)` at hour=6, flag != today -> dawn fire (fsm.transition + speech.show called via setTimeout fastforward)
- `update(30+)` at hour=6, flag == today -> skip
- `update(30+)` at hour=18, flag != today -> sunset fire
- `update(30+)` at hour=21 -> skip both
- `update(30+)` while fsm.SLEEPING -> skip + flag NOT set
- `update(30+)` while speech.isVisible -> skip + flag NOT set
- `update(30+)` deps not wired -> early return, no crash

**Stubs needed in `test-stubs.js`** (extended):

- Mock `speech` object: `{ show(text, opts), isVisible: bool }`
- Mock `fsm` object: `{ transition(state, opts), currentState }`
- Mock `STATES` object: `{ HAPPY, BLOWING_BUBBLES, SLEEPING, EATING, ... }`
- Clock injection via constructor `now` / `getHours` / `today` deps (already in design)
- localStorage stub already present from S1

### Existing regression

- `desk-pet/engine/{sound,haptic,onboarding,tokenizer}.test.js` from S1 -> 36/36 pass
- `pytest` 78/78 pass

### Manual browser validation (Chrome MCP + spot check)

Checklist (manual, after deploy):

- [ ] First-ever load (cleared localStorage): no reactivation, idle phrases work
- [ ] Reload <30min: no reactivation
- [ ] Reload after 1h: short reactivation phrase visible
- [ ] Reload after 4h (manual clock shift via DevTools): med reactivation
- [ ] Reload after 24h+ (manual): long reactivation
- [ ] DevTools console: `window.bowlMemory.state` shows expected fields
- [ ] Chat 3 times consecutive days (manual flag manipulation): streak_days = 3
- [ ] Skip 2 days then chat: streak resets to 1
- [ ] Manual hour shift to 6:30am (via DevTools / system clock): dawn greeting fires within 30s
- [ ] Same load, repeat hour shift to 6:31: no re-fire (flag set)
- [ ] Manual hour shift to 18:30: sunset greeting fires
- [ ] axe-core 0 violations
- [ ] `prefers-reduced-motion`: greetings still work (speech only, no extra animation)

## SW cache bump

`sw.js`: `CACHE_VERSION glub-v7 -> glub-v8`. Add to `STATIC_ASSETS`:

- `engine/bowl-memory.js`
- `engine/rituals.js`

Model cache `glub-model-v3` unchanged. Existing users keep v7 serving until next reload, then SW bump detects v8, new install, old cache auto-pruned. Zero downtime.

## Error handling (cross-cutting)

- All modules: no-op graceful, no crash, no user-facing alerts
- localStorage failures (quota, disabled, malformed): in-memory fallback + `console.warn` once
- Dev-only errors: throw on invalid event types / unknown preset IDs (catches typos early)
- Time clock skew (system clock changed mid-session): `_now()` reflects current Date.now() each call - mood/reactivation re-compute correctly. Streak only updated on `recordEvent`, no re-validation needed.

## Rollout

- No runtime feature flag. Deploy direct to master, GH Pages auto-deploys. Rollback = `git revert`.
- **Backward compat**: users without `glub_bowl_memory` key get safe defaults on first `load()`. Future visits accumulate state.
- HF model pipeline unchanged. Zero impact on ML.

## Effort estimate

| Component | Effort | File delta |
|---|:-:|---|
| `bowl-memory.js` + 12 unit test | ~1.5h | +1 new + 1 test |
| `rituals.js` + 8 unit test | ~1h | +1 new + 1 test |
| `idle.js` extension (mood + hour bias) | ~0.5h | 1 extended |
| `app.js` integration + listeners | ~0.5h | 1 extended |
| SW cache bump + manual smoke test | ~0.5h | 1 extended |
| Test stubs extension (speech/fsm/STATES mock) | ~0.25h | 1 extended |
| **Total** | **~4.25h** | 2 new files + 4 extended + 2 test files |

## Out of scope (deferred)

- **Settings UI for bowl memory reset**: dev-only via `window.bowlMemory.reset()` console for now. UI button can be added later if needed
- **Companion aquarium memory port**: companion server already has `pet-state.json` persistence with broader scope. Not bridged in B.2
- **Cross-device sync**: localStorage is device-local. No CF Worker / API for sync
- **Streak-based achievements / badges**: counters and streak tracked but no UI surface yet
- **Phrase pool from JSON file**: 15 reactivation/dawn/sunset phrases hardcoded in modules for simplicity; can be moved to JSON later

## Open questions

None blocking. Implementation can proceed.

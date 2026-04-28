# GlubLM Cluster B.3 - Companion Port of Bowl Memory + Rituals Design Spec

> Server-side port of Cluster B.2 cross-session retention features to the companion runtime.
>
> Date: 2026-04-28
> Status: Draft
> Scope: `companion/server/` only (no client-side changes; aquarium/controller receive new behavior via existing WS protocol)
> Predecessor: `2026-04-28-cluster-b2-bowl-memory-rituals-design.md` (desk-pet PWA implementation)

## Overview

Cluster B.2 added bowl memory persistence + day/night rituals to the desk-pet PWA. The companion server (`companion/`) is a separate surface with its own runtime (Node + WebSocket clients aquarium + controller) and its own state model (`pet-state.json` with needs-engine, bond, poops, ageDays). Cluster B.3 ports the equivalent UX features to the companion server-side.

The port is NOT verbatim:
- companion runs Node, not browser - no localStorage
- companion has multiple clients (aquarium + controller, possibly multi-tab) - server is single source of truth
- companion has user-initiated CMDs (CMD_FEED, CMD_PLAY, CMD_CHAT) - no random EATING events
- companion has FSM-equivalent broadcast via `MSG.ANIMATION + state string`
- companion already has `lastInteraction`, `lastFeedTime`, `lastPlayTime`, `bondFeedToday`, `bondDayStart` timestamps - additive integration

## Success criteria

**Primary metric**: companion users get the same cross-session retention richness as desk-pet users.

Operational checks:

- WS connect after gap >= 30min triggers a variant-appropriate reactivation phrase via `MSG.SPEECH` (delay 2.5s)
- 3 user-initiated CMDs (`CMD_CHAT`, `CMD_FEED`, `CMD_PLAY`) increment streak (UTC date-based, 24h grace)
- mood_score 0-3 (computed on-read) is exposed via `pet.snapshot()` and biases phrase selection
- Dawn (6-7am) and sunset (18-20) broadcast `MSG.ANIMATION + MSG.SPEECH` once per UTC day across all connected clients
- Phrase selector biases morning/evening/night categories by hour-of-day x1.5
- Backward-compat: existing `pet-state.json` without new fields deserializes with defaults
- All existing 54 companion tests still pass

**Out of scope**: cleanliness/water_change as streak events, bond decay per missed day, settings UI for mute rituals, reactivation from JSON file (hardcoded OK).

## Design decisions (already taken)

| # | Decision | Rationale |
|---|---|---|
| 1 | **Additive in PetState** | Single SSOT (pet-state.json), backward-compat via Object.hasOwn deserialize, no migration. PetState grows from 14 to 23 fields |
| 2 | **Reactivation: direct WS push on connect** | Bypass phrase-selector. 9 hardcoded phrases (3 short / 3 med / 3 long) reused verbatim from desk-pet bowl-memory.js |
| 3 | **Rituals: server-side polling + broadcast** | New `companion/server/rituals.js` mirrors desk-pet pattern; tick loop calls `update(dt)`; broadcasts `MSG.ANIMATION` + delayed `MSG.SPEECH` to all clients |
| 4 | **Streak events: feed + play + chat** | Mirror desk-pet semantics; `excited` (desk-pet) maps to `play` (companion); cleanliness/water_change excluded as care-not-engagement |

## Architecture

### File structure

```
companion/server/
  pet-state.js          (EXT) - 9 new fields + 4 new methods + 3 phrase pool exports
  pet-state.test.js     (EXT) - +12 unit tests (total ~24 from current 12)
  rituals.js            (NEW ~80 lines) - RitualScheduler + dawn/sunset polling
  rituals.test.js       (NEW ~120 lines) - 8 unit tests (mirror desk-pet pattern)
  phrase-selector.js    (EXT) - +5 lines: hour bias multiplier in _buildWeighted
  phrase-selector.test.js (EXT) - +4 unit tests
  index.js              (EXT) - rituals init + tick + WS connect reactivation + 3 CMD recordEvent
companion/data/
  idle-phrases.json     (no change) - existing morning/evening/night categories receive hour bias
companion/shared/
  protocol.js           (no change) - reuse existing MSG.SPEECH + MSG.ANIMATION
```

### Component diagram

```
+----------------+    recordEvent      +----------------+
|    index.js    |-------------------->|   PetState     |
|     (orch)     |<----getReactivation-|  (extended)    |
|                |     getMoodScore    |                |
|                |---->setDeps-------->|    rituals     |
|                |<----update(dt)------|   (new)        |
|                |                     +----------------+
|                |     hour state field  |
|                |---->snapshot()------->|
|                |                       v
|                |              +----------------+
|                |              | PhraseSelector |
|                |              |  (extended)    |
+----------------+              +----------------+
       |
       | WS broadcast/send
       v
+----------------+
|    WsServer    |  ---> aquarium (multiple clients)
|   (existing)   |  ---> controller
+----------------+
```

## Components

### `pet-state.js` extension

#### New persisted fields (9)

```js
// Append to constructor (after fishName):
this.last_chat_at = 0;
this.last_excited_at = 0;        // Reused as 'play' in companion
this.last_seen_at = 0;
this.total_chats = 0;
this.total_excited = 0;          // Reused as total_plays
this.streak_days = 0;
this.last_interaction_day_utc = null;
this.last_dawn_greeting = null;
this.last_sunset_greeting = null;
```

Note: existing `lastFeedTime` (camelCase) stays - field renames cause migration drama. The new fields use snake_case to match desk-pet bowl-memory pattern; alias getter resolves both names if needed.

#### Non-persisted state

```js
this._reactivationFired = false;  // process-lifetime flag, NOT in serialize()
```

#### New module-level constants (exported)

```js
export const SHORT_REACTIVATIONS = [...3 phrases verbatim from bowl-memory.js...];
export const MED_REACTIVATIONS   = [...3 phrases verbatim...];
export const LONG_REACTIVATIONS  = [...3 phrases verbatim...];

function pickFrom(arr) { return arr[Math.floor(Math.random() * arr.length)]; }
function utcDateStr(ts = Date.now()) { /* YYYY-MM-DD UTC */ }
function utcDaysBetween(a, b) { /* Math.round((tb - ta) / 86_400_000) */ }
```

#### New methods (4)

```js
recordEvent(type) {
  if (type !== 'chat' && type !== 'feed' && type !== 'play') {
    throw new Error(`Unknown event type: ${type}`);
  }
  const now = Date.now();
  const today = utcDateStr(now);
  const last = this.last_interaction_day_utc;

  if (!last) {
    this.streak_days = 1;
  } else if (last !== today) {
    const gapDays = utcDaysBetween(last, today);
    if (gapDays >= 1 && gapDays <= 2) this.streak_days += 1;
    else if (gapDays > 2)             this.streak_days = 1;
  }
  this.last_interaction_day_utc = today;

  if (type === 'chat') { this.last_chat_at    = now; this.total_chats   += 1; }
  if (type === 'feed') { this.lastFeedTime    = now; /* total_feeds via existing feedCountInWindow logic */ }
  if (type === 'play') { this.last_excited_at = now; this.total_excited += 1; this.lastPlayTime = now; }
}

recordSeen() {
  this.last_seen_at = Date.now();
}

getMoodScore() {
  const mostRecent = Math.max(
    this.last_chat_at || 0,
    this.lastFeedTime || 0,
    this.last_excited_at || 0,
  );
  if (mostRecent === 0) return 0;
  const ageH = (Date.now() - mostRecent) / 3_600_000;
  if (ageH < 2)  return 3;
  if (ageH < 8)  return 2;
  if (ageH < 24) return 1;
  return 0;
}

getReactivation() {
  if (this._reactivationFired) return null;
  if (!this.last_seen_at) return null;
  const gapMs = Date.now() - this.last_seen_at;
  if (gapMs < 30 * 60_000) return null;
  const gapH = gapMs / 3_600_000;
  this._reactivationFired = true;
  if (gapH < 2)      return { variant: 'short', text: pickFrom(SHORT_REACTIVATIONS) };
  else if (gapH < 8) return { variant: 'med',   text: pickFrom(MED_REACTIVATIONS) };
  else               return { variant: 'long',  text: pickFrom(LONG_REACTIVATIONS) };
}
```

#### Serialize/deserialize updates

`serialize()`: add the 9 new fields to the JSON object.

`deserialize()`: existing `Object.hasOwn(pet, key)` loop already handles new fields gracefully (default values from constructor preserve when JSON lacks them). NO code change needed in deserialize - just verify behavior in tests.

#### Snapshot extension

`snapshot()` already returns `bondLevel`, `minsSinceInteraction`. Add 2 fields:

```js
snapshot() {
  return {
    // ... existing 11 fields ...
    mood_score: this.getMoodScore(),
    streak_days: this.streak_days,
    hour: new Date().getHours(),
  };
}
```

`hour` exposed for phrase-selector consumption.

### `rituals.js` (new)

Mirror desk-pet pattern with companion-specific deps.

```js
const POLL_INTERVAL_S = 30;

export const DAWN_PHRASES = [...3 phrases verbatim from desk-pet/engine/rituals.js...];
export const SUNSET_PHRASES = [...3 phrases verbatim...];

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
    this._ws = null;
    this._pet = null;
  }

  setDeps({ ws, pet }) {
    this._ws = ws;
    this._pet = pet;
  }

  update(dt) {
    this._checkTimer += dt;
    if (this._checkTimer < POLL_INTERVAL_S) return;
    this._checkTimer = 0;

    if (!this._ws || !this._pet) return;
    if (this._pet.isBellyUp) return;     // companion conflict guard

    const hour = this._getHours();
    const today = this._today();

    if (hour >= 6 && hour < 7) {
      if (this._pet.last_dawn_greeting !== today) {
        this._pet.last_dawn_greeting = today;
        this._ws.broadcast('animation', { state: 'happy', duration: 2 });
        const phrase = pickFrom(DAWN_PHRASES);
        setTimeout(() => this._ws.broadcast('speech', { text: phrase, speaker: 'fish', duration: 3 }), 500);
      }
    }

    if (hour >= 18 && hour < 20) {
      if (this._pet.last_sunset_greeting !== today) {
        this._pet.last_sunset_greeting = today;
        this._ws.broadcast('animation', { state: 'bubble_blow', duration: 2.5 });
        const phrase = pickFrom(SUNSET_PHRASES);
        setTimeout(() => this._ws.broadcast('speech', { text: phrase, speaker: 'fish', duration: 3 }), 500);
      }
    }
  }
}

export const rituals = new RitualScheduler();
```

Note differences from desk-pet `rituals.js`:
- No `_inMemFlags` / localStorage - flags live on `pet` (persisted via existing pet-state.json save cycle)
- `MSG.ANIMATION` strings are companion-side state names: `'happy'`, `'bubble_blow'` (verified vs `desk-pet/engine/state-machine.js`)
- Conflict guard: `pet.isBellyUp` (companion equivalent of unwell state) - SLEEPING does not exist as explicit state in companion FSM, sleep handling is implicit via inactivity
- `_speech.isVisible` check NOT applicable server-side (no speech state on server) - server fires-and-forgets, client handles overlap

### `phrase-selector.js` extension

5-line addition in `_buildWeighted`:

```js
_buildWeighted(condition, bondIdx, recent, hour) {   // <-- new hour param
  const weighted = [];
  for (const phrase of this._phrases) {
    if (recent.includes(phrase.text)) continue;

    const cfg = WEIGHTS[phrase.category] || WEIGHTS._default;
    const w = cfg[condition] ?? cfg.base;
    if (w <= 0) continue;

    if (cfg.bondMin && bondIdx < BOND_ORDER.indexOf(cfg.bondMin)) continue;
    if (cfg.bondMax && bondIdx > BOND_ORDER.indexOf(cfg.bondMax)) continue;

    // NEW: hour-of-day bias
    const hourCat = hour == null ? null
                  : hour >= 6 && hour < 12 ? 'morning'
                  : hour >= 18 && hour < 22 ? 'evening'
                  : (hour >= 22 || hour < 6) ? 'night' : null;
    const hourMul = (hourCat && phrase.category === hourCat) ? 1.5 : 1.0;

    weighted.push({ phrase, weight: w * hourMul });   // <-- hourMul applied
  }
  return weighted;
}

pick(state) {
  const condition = this._getCondition(state);
  const bondIdx = BOND_ORDER.indexOf(state.bondLevel);
  const hour = state.hour ?? new Date().getHours();   // <-- new

  const fullPool = this._buildWeighted(condition, bondIdx, [], hour);
  // ... existing rest, pass hour through buildWeighted calls
}
```

Backward-compat: `state.hour` undefined -> falls to `new Date().getHours()` -> hour bias active by default; tests can override by setting `state.hour` explicitly.

### `index.js` integration

```js
import { RitualScheduler } from './rituals.js';

// After existing initialization (after PhraseSelector creation, around line 41+)
const rituals = new RitualScheduler();
rituals.setDeps({ ws: wsServer, pet });

// WS message handler - extend the existing handler
wsServer.onMessage((msg, ws) => {
  if (msg.type === '_connect') {
    pet.recordSeen();
    const reactivation = pet.getReactivation();
    if (reactivation) {
      setTimeout(() => {
        wsServer.send(ws, MSG.SPEECH, { text: reactivation.text, speaker: 'fish', duration: 4 });
      }, 2500);
    }
    // Existing _connect handler stays (e.g., FULL_STATE send)
  }

  if (msg.type === MSG.CMD_CHAT) {
    pet.recordEvent('chat');
    // ... existing handler
  }

  if (msg.type === MSG.CMD_FEED) {
    pet.recordEvent('feed');
    // ... existing handler
  }

  if (msg.type === MSG.CMD_PLAY) {
    pet.recordEvent('play');
    // ... existing handler
  }
});

// Tick loop (existing setInterval at TICK_INTERVAL_MS)
function tick() {
  engine.update(TICK_INTERVAL_MS / 1000);
  rituals.update(TICK_INTERVAL_MS / 1000);
  // ... existing tick body
}
```

## Edge cases

| # | Scenario | Behavior |
|---|---|---|
| 1 | Server H24, multi-day | Tick loop fires dawn each new UTC day (flag shifts) |
| 2 | Multi-client (2 aquarium tabs) | `ws.broadcast` reaches both, single fire (flag set once on pet) |
| 3 | Pet bellyUp during dawn | Skip + flag NOT set, retry next 30s |
| 4 | Server restart at 6:30 | Flag persisted via pet-state.json save - if = today skip; else fire |
| 5 | Reactivation + dawn collision on same connect | Reactivation sent at 2.5s delay (via WS send to specific client), dawn polls every 30s. Reactivation arrives first |
| 6 | First connect ever (last_seen_at = 0) | `getReactivation` returns null. `recordSeen` sets seen now |
| 7 | Reconnect within 30min | gap < 30min -> null |
| 8 | Streak: feed at 23:50 + play at 00:10 (UTC) | Different UTC days -> +1; same day -> no increment. Local time vs UTC discrepancy intentional |
| 9 | `recordSeen` on every CMD | NO: only on `_connect`. CMDs use `recordEvent` |
| 10 | Old pet-state.json without new fields | `Object.hasOwn` check in deserialize falls through; defaults from constructor used |
| 11 | `total_excited` counter on play | YES, via `recordEvent('play')` -> increments `total_excited`. Slight semantic mismatch (counter named after desk-pet event) but acceptable for cross-surface consistency |
| 12 | Dawn fires while inference busy | Independent code paths. inference.generate is async, rituals broadcast is sync - no contention |
| 13 | Ritual fires but no clients connected | broadcast no-op (clientCount=0), flag still set -> no re-fire on next connect within same UTC day |
| 14 | mood_score with `lastFeedTime` mixing | `getMoodScore` reads existing `lastFeedTime` field (not new `last_feed_at`) - keep singular source |

## Testing strategy

### Unit tests

**`pet-state.test.js` extension** (~12 new tests):

- recordEvent('chat') / 'feed' / 'play' update timestamps + counters + streak (3 tests)
- Streak: same UTC day -> no increment
- Streak: gap 1 day -> +1
- Streak: gap 2 days -> +1 (grace)
- Streak: gap 3+ days -> reset to 1
- mood_score: never interacted -> 0
- mood_score: 1h/3h/12h/30h -> 3/2/1/0
- getReactivation: <30min null
- getReactivation: 1h short variant
- getReactivation: 4h med variant
- getReactivation: 12h long variant
- getReactivation: second call -> null
- recordEvent('bogus') throws
- serialize includes all 9 new fields
- deserialize old JSON without new fields uses defaults

**`rituals.test.js`** (NEW, 8 tests):

- update(dt < 30) -> no broadcast (timer accumulator)
- update(31) at hour=6, flag != today -> dawn broadcast (animation + speech via setTimeout 500ms) + flag set on pet
- update(31) at hour=6, flag == today -> skip
- update(31) at hour=18, flag != today -> sunset broadcast + flag set
- update(31) at hour=21 -> skip both
- pet.isBellyUp + dawn -> skip + flag NOT set
- update without setDeps -> no crash

Mock ws via `{ broadcast: (type, data) => calls.push(...), send: () => {} }`. Mock pet via plain object `{ last_dawn_greeting: null, last_sunset_greeting: null, isBellyUp: false }`.

**`phrase-selector.test.js` extension** (~4 tests):

- pick at state.hour=8 with 'morning' phrase in pool -> selected at higher rate (statistical)
- pick at state.hour=19 with 'evening' phrase in pool -> selected at higher rate
- pick at state.hour=14 (afternoon) -> no category bias triggered
- pick without state.hour -> uses Date.getHours() fallback (verify by mock or accept implicit)

Statistical assertions: pick 1000 times with seeded fixed phrase pool, expect morning > 25% if morning phrase is 1 of 4 categories.

### Existing regression

- All 54 existing companion tests still pass: `cd companion && npm test`
- `pytest 78/78` (no backend changes - regression check only)

### Manual smoke

- `cd companion && npm start` -> server up at localhost:3210
- Open aquarium in browser, observe `_connect` -> if last_seen_at recent enough, no reactivation; if cleared (delete `pet-state.json`), no reactivation either
- Manual time shift via system clock to 6:30am -> wait 30s -> dawn animation + phrase visible in aquarium
- Same time shift to 18:30 -> sunset animation + phrase
- Console log `pet-state.json` contents - verify 9 new fields present after first feed/play/chat
- Disconnect aquarium for 1h (close tab, wait 1h via clock manipulation), reopen -> reactivation phrase via WS

## Rollout

- No runtime feature flag. Direct merge to master.
- **Backward compat**: existing pet-state.json files (without new fields) deserialize via existing Object.hasOwn loop -> defaults preserved.
- HF model unchanged. Zero impact on inference.
- Clients (aquarium, controller) unchanged - no client-side code modification needed; they consume existing MSG types.

## Effort estimate

| Component | Effort | File delta |
|---|:-:|---|
| pet-state.js: 9 fields + 4 methods + phrase pool exports + serialize/snapshot | ~1.5h | 1 extended |
| pet-state.test.js: 12 new tests | ~1h | 1 extended |
| rituals.js + rituals.test.js | ~1h | 2 new |
| phrase-selector.js extension + 4 tests | ~0.5h | 2 extended |
| index.js: rituals init, tick, WS connect, 3 CMD handlers | ~0.5h | 1 extended |
| Manual smoke (npm start + WS test) | ~0.5h | - |
| **Total** | **~5h** | 2 new + 4 extended |

## Out of scope (deferred)

- Cleanliness/water_change as streak event (care, not engagement)
- Bond decay per missed streak day
- Achievement/badge UI (would need controller HTML changes)
- Reactivation phrase pool from JSON file (hardcoded acceptable for v1)
- Companion settings UI for mute rituals (analog of audio-enabled checkbox in desk-pet)
- Dawn/sunset phrase variants from idle-phrases.json category (3 hardcoded each suffices)
- Sleep state in companion FSM (currently absent; if added later, ritual conflict guard updates trivially)

## Open questions

None blocking. Implementation can proceed.

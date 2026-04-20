# GlubLM Cluster B - Engagement Layer Design Spec

> Audio + haptic feedback + extended onboarding for the Desk Pet PWA.
>
> Date: 2026-04-20
> Status: Draft
> Scope: `desk-pet/` only (companion/ out of scope, bowl memory + day/night rituals deferred)

## Overview

Cluster B adds an engagement layer to the Desk Pet that makes the first 60 seconds of user experience feel rich and tactile. The existing demo is visually polished but silent, untethered from physical feedback, and has a minimal text-only onboarding. Cluster B lifts that floor.

The scope is deliberately narrow: **2 features, not 4**. Bowl memory persistence and day/night rituals were considered and explicitly deferred to a later session - they improve cross-session retention, which is a different metric than first-impression richness.

## Success criteria

**Primary metric**: first-impression richness - the feel of the first 60 seconds for a visitor who opens the demo cold.

Operational checks for "success":

- A first-time visitor sees the scripted onboarding demo, which shows (not tells) how to interact
- Every user-gesture (click, double-click, long-press, splash, chat send) produces tactile/auditory feedback on the first interaction: single-click + long-press are haptic-only (audio would feel intrusive for trivial taps), splash + chat-send + double-click-excited have both audio + haptic
- Returning visitors who already saw the v1 tutorial get the v2 tutorial once (migration); from then on, the product is silent about tutorials unless they replay from settings
- No regressions in a11y (axe-core 0 violations baseline preserved)
- No regressions on Lighthouse (best-practices 74, performance 78 are the floor for desk-pet)

**Out of scope for success**: cross-session retention metrics, bowl memory continuity, day/night ritual depth, companion aquarium haptic/audio (separate surface, separate spec).

## Design decisions

| # | Decision | Alternatives rejected | Rationale |
|---|---|---|---|
| 1 | Focus 2 features (onboarding + audio/haptic); defer bowl memory + day/night | 4 features in priority order; MVP all 4; onboarding-only | Success metric is first-impression (primi 60s), which maps 1:1 to gestures + audio/haptic. Bowl memory and day/night are retention features, a different axis |
| 2 | Onboarding UX: Medium = pulsing hint + scripted demo + replay | Light (hint only); Rich (+ audio cue synergy); Minimal (extend hints list) | Medium is the balance: the fish auto-executes each gesture during the hint ("show, don't tell"), which is the first-impression punch. Rich adds audio-unlock synergy but costs +1h for marginal return |
| 3 | Audio: procedural Web Audio API, 6 events | CC0 files, 6 events; procedural minimal 3; hybrid procedural + 1 file | Chiptune/bleep-bloop is on-brand with the GBA pixel-art aesthetic. Zero asset pipeline, zero SW cache bandwidth, 2KB total. File-based would be more "rich" but off-brand and costs asset licensing/hosting |
| 4 | Haptic: ON mobile by default, 5 desk-pet-specific events | Both OFF default opt-in; audio OFF + haptic ON; minimal 2 events | First-impression intent requires feedback from first click. Browser autoplay policy forces audio unlock on first user gesture anyway (silent until then); haptic on mobile is subtle by nature. Users can mute from settings |
| 5 | Architecture: feature-isolated modules | Event bus; single god-module | Mirrors existing `engine/*.js` pattern (bubbles, speech, movement, state-machine are all feature-isolated). Direct call-site is fine for 10 call sites total; event bus would be unjustified indirection |

## Architecture

### Module structure

```
desk-pet/
  engine/
    sound.js         (NEW  ~200 lines) - Web Audio API + 6 oscillator presets
    haptic.js        (NEW  ~80  lines) - navigator.vibrate wrapper + 5 presets
    onboarding.js    (EXT  ~150 lines, +100 vs current 50)
  index.html         (EXT) - 2 checkbox + replay button + pulsing overlay element
  style.css          (EXT) - pulsing cue keyframes + reduced-motion override
  app.js             (EXT) - wire call-sites, init sound/haptic, settings persistence
  sw.js              (EXT) - cache bump v6 -> v7 + new files
  tests/             (NEW directory)
    sound.test.js    (NEW) - unit tests Node 20 node:test
    haptic.test.js   (NEW)
    onboarding.test.js (NEW)
```

### Event taxonomy

| Event ID | Audio | Haptic | Trigger | Initiator |
|---|:-:|:-:|---|:-:|
| `tap_fish` | - | `[10]` | single-click fish -> spiral swim | user |
| `long_press_happy` | - | `[20]` | long-press -> HAPPY state | user |
| `double_excited` | `excited_celebration` 3-note fanfare C5-E5-G5 | `[40, 30, 40]` | double-click -> EXCITED | user |
| `splash_click` | `splash_click` white-noise hi-pass | `[10]` | click water | user |
| `chat_send` | `chat_send` sine beep A5 | `[10]` | user submits chat | user |
| `nom_nom_eat` | `nom_nom_eat` square 3 descending bursts | - | state-machine EAT transition | auto |
| `bubble_pop` | `bubble_pop` sine blip random pitch | - | bubbles.js spawn (throttled 1/500ms) | auto |
| `forget_glub` | `forget_glub` triangle fade chime | - | speech.js fadeOut dissolve | auto |

**Synergy note**: the first 3 haptic events (`tap_fish`, `long_press_happy`, `double_excited` + `chat_send`) map 1:1 with the onboarding gesture hints. During the scripted demo, the haptic confirms the gesture that the fish is demonstrating. This is the "feel" payoff of Medium onboarding.

## Components

### `engine/sound.js`

Procedural Web Audio API synthesizer. One class, singleton export.

**Public API**:

```js
class SoundEngine {
  constructor({ enabled = true });
  play(presetId);    // no-op if !enabled or pre-unlock
  setEnabled(bool);  // live toggle from settings
  unlock();          // AudioContext.resume(); call from first user gesture
  get isUnlocked();
  get hasAudio();    // feature-detect on construct
}
export const sound = new SoundEngine({ enabled: SETTINGS.audioEnabled });
```

**6 oscillator presets** (procedural chiptune, on-brand GBA):

| Preset | Wave | Frequency | Envelope ADSR (ms) | Duration | Volume |
|---|---|---|---|---|---|
| `bubble_pop` | sine | 800 Hz +-80 Hz random | 5/80/0.2/35 | 120 ms | 0.15 |
| `splash_click` | white-noise + HP 4 kHz | - | 2/60/0.15/118 | 180 ms | 0.20 |
| `nom_nom_eat` | square | 200->180->160 Hz, 3 burst, 40 ms gap | 5/40/0.1/20 per burst | 250 ms | 0.18 |
| `forget_glub` | triangle | 600->300 Hz linear ramp | 30/120/0.3/150 | 300 ms | 0.22 |
| `chat_send` | sine | 880 Hz (A5) | 2/30/0.4/68 | 100 ms | 0.18 |
| `excited_celebration` | triangle | C5-E5-G5 arpeggio, 20 ms gap | 10/60/0.3/80 per note | 450 ms | 0.25 |

**Audio graph**: OscillatorNode -> EnvelopeGain -> MasterGain (0.7) -> destination. Per-preset volume in the table is envelope sustain; output reale after master = ~0.1-0.17, below irritation threshold.

**Throttling**: `bubble_pop` max 1 per 500 ms window (bubbles.js can spawn 3/sec in burst; silent drop, no queue). Other presets unthrottled (user-gesture-bound, naturally rate-limited).

**AudioContext lifecycle**:

1. `constructor`: feature-detect (`typeof AudioContext !== 'undefined' || webkit variant`). Do NOT create AudioContext here.
2. `unlock()` from first user-gesture listener in `app.js`. Creates AudioContext, calls `.resume()`, sets `isUnlocked = true`. Idempotent.
3. `play()` pre-unlock = silent no-op. Post-unlock = schedules audio graph.
4. Chrome tab background: AudioContext auto-suspends. Play becomes no-op until tab returns + user gesture triggers implicit resume (or `unlock()` called again, idempotent).

**Mute toggle live**: `setEnabled(false)` disconnects master gain (stops in-flight oscillators). `setEnabled(true)` reconnects. AudioContext is not re-unlocked.

**Error handling**:

- `!hasAudio` -> `play()` no-op + `console.info` once. Settings toggle hidden via `body[data-no-audio]` CSS
- AudioContext.resume() rejected (Safari < 14.1 private mode) -> `isUnlocked` stays false, play() silently skipped, no retry loop
- `play('invalid-preset')` -> throw `Error('Unknown sound preset: X')` (dev-only, catches typos early)

### `engine/haptic.js`

navigator.vibrate wrapper. One class, singleton export.

**Public API**:

```js
class HapticEngine {
  constructor({ enabled = true });
  pulse(presetId);
  setEnabled(bool);
  get hasHaptic();   // feature-detect: typeof navigator.vibrate === 'function'
}
export const haptic = new HapticEngine({ enabled: SETTINGS.hapticEnabled });
```

**5 presets**:

| Preset | Pattern (ms) | Trigger |
|---|---|---|
| `tap_fish` | `[10]` | single-click fish |
| `long_press_happy` | `[20]` | long-press -> HAPPY |
| `double_excited` | `[40, 30, 40]` | double-click -> EXCITED |
| `splash_click` | `[10]` | click water |
| `chat_send` | `[10]` | chat submit |

**Graceful no-op stack** (order):

1. `!hasHaptic` (desktop browser, iOS Safari) -> silent no-op
2. `!enabled` (user muted via settings) -> silent no-op
3. `prefersReducedMotion.matches` -> silent no-op (matchMedia live listener updates status)
4. `pulse('invalid')` -> throw (dev-only)

iOS Safari has `navigator.vibrate === undefined`; silently skipped. No user-facing error.

### `engine/onboarding.js` extension

Extends the existing 50-line module to ~150 lines. New concepts: pulsing cue element, scripted demo, replay API, v1->v2 migration.

**New HINTS structure**:

```js
const HINTS = [
  {
    id: 'tap',
    text: 'tap the fish',
    duration: 3000,
    target: () => getFishScreenPos(),
    demo: async () => {
      haptic.pulse('tap_fish');
      await fish.spiralSwim(0.6);
    }
  },
  {
    id: 'hold',
    text: 'hold for happy',
    duration: 3000,
    target: () => getFishScreenPos(),
    demo: async () => {
      haptic.pulse('long_press_happy');
      fsm.transition(STATES.HAPPY, { duration: 2, priority: 3 });
    }
  },
  {
    id: 'type',
    text: 'type to chat',
    duration: 3500,
    target: () => document.querySelector('#chat-input').getBoundingClientRect(),
    demo: async () => {
      haptic.pulse('chat_send');
      speech.show("hi there! i'm glub.", { type: 'fish', duration: 3 });
    }
  }
];
```

**Pulsing cue implementation**:

- `#onboarding-cue` element in `index.html`: `<div class="onboarding-cue" aria-hidden="true"></div>`
- CSS keyframe `@keyframes onboardingPulse { 0% { transform: scale(1); opacity: 0.9; } 100% { transform: scale(1.8); opacity: 0; } }` running 1.2s infinite
- Ring visuals: 48 x 48 px circle, 3 px solid border `#ff8b3d` (brand orange), `border-radius: 50%`, `pointer-events: none`, position absolute
- JS polls `target()` every 100 ms to reposition (non-rAF; pesce moves slowly enough)

**Flow**:

1. `runOnboarding()` checks `shouldShowOnboarding()` against `glub_onboarded_v2`
2. Sequential HINTS loop: render text in overlay (aria-live update), position cue over target, start pulse animation, await `demo()` (parallel), await `duration`, advance
3. Post-loop: set `glub_onboarded_v2 = '1'`, fade out overlay, hide cue
4. Skip button + document `pointerdown` early-dismiss preserved; in-flight `demo()` aborted via AbortController

**Replay API**:

```js
export function showTutorial({ force = true } = {}) {
  if (!force && !shouldShowOnboarding()) return;
  runOnboarding();
}
```

Called from "show tutorial again" button in settings.

**Migration v1 -> v2**: if `glub_onboarded_v1 === '1'` AND `glub_onboarded_v2 !== '1'` -> `runOnboarding()` auto on load. After dismiss, `v2 = '1'` set. Existing v1 users see v2 tutorial exactly once.

**a11y**:

- `prefersReducedMotion.matches` -> skip pulsing animation + skip `demo()` (keep text hints only), fast-forward duration to 2000 ms per hint
- Focus trap: `tabindex` + focusin listener cycling between Skip button and overlay body (`tabindex="-1"`)
- ESC key -> skip
- `aria-live="polite"` on `.onboarding-text` for screen reader announcement

## Data flow

### Call-site mapping

| File | Approx line | Addition |
|---|---|---|
| `app.js` init (after FSM creation) | ~160 | `import { sound } from './engine/sound.js'; import { haptic } from './engine/haptic.js';` |
| `app.js` single-click fish handler | ~420 | `haptic.pulse('tap_fish')` |
| `app.js` long-press handler | ~445 | `haptic.pulse('long_press_happy')` |
| `app.js` double-click handler | ~460 | `haptic.pulse('double_excited')` |
| `app.js` water splash click | ~480 | `haptic.pulse('splash_click'); sound.play('splash_click');` |
| `app.js` chat submit | ~390 | `haptic.pulse('chat_send'); sound.play('chat_send');` |
| `app.js` FSM `onStateChange` (NEW listener) | - | `if (state === STATES.EAT) sound.play('nom_nom_eat'); if (state === STATES.EXCITED) sound.play('excited_celebration');` |
| `engine/bubbles.js` `spawn()` | - | `sound.play('bubble_pop')` (throttled internally) |
| `engine/speech.js` `fadeOut()` entry | - | `sound.play('forget_glub')` |
| `app.js` first user gesture handler | - | `sound.unlock()` once (idempotent) |
| `app.js` `setupSettings()` | 254-305 | audio/haptic/replay extensions |

**Unlock timing**: a single global listener `document.addEventListener('pointerdown', sound.unlock, { once: true })` wired on init. First user pointerdown anywhere (tutorial skip button, early-dismiss click during tutorial, settings button, fish/water click post-tutorial) unlocks the AudioContext. Idempotent.

The tutorial itself runs auto-scripted demos (no user gestures required); audio during the tutorial stays silent by design (`haptic.pulse()` during demo still fires since haptic does not need unlock). Audio-capable interactions begin the moment the user first clicks anything - which for most first-visit flows is the early-dismiss tap right after watching the scripted demo.

## localStorage schema

| Key | Values | Default | Status |
|---|---|---|---|
| `glub_notif_freq` | `0/2/4/8` | `4` | existing |
| `glub_fish_name` | string | `glub` | existing |
| `glub_installed` | `1/null` | `null` | existing |
| `glub_install_dismissed` | `1/null` | `null` | existing |
| `glub_install_show_count` | int | `0` | existing |
| `glub_onboarded_v1` | `1/null` | `null` | existing (migration source) |
| `glub_onboarded_v2` | `1/null` | `null` | **NEW** (Cluster B) |
| `glub_audio_enabled` | `1/0` | `1` (ON) | **NEW** |
| `glub_haptic_enabled` | `1/0` | `1` (ON) | **NEW** |

## Settings UI

### HTML additions (inside `#settings-panel`, after fish-name)

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

### `app.js` wiring (pattern identical to existing notif-freq + fish-name)

```js
const SETTINGS = {
  // ... existing
  audioEnabled: localStorage.getItem('glub_audio_enabled') !== '0',
  hapticEnabled: localStorage.getItem('glub_haptic_enabled') !== '0',
};

// setupSettings() extended
document.getElementById('audio-enabled').checked = SETTINGS.audioEnabled;
document.getElementById('audio-enabled').addEventListener('change', (e) => {
  SETTINGS.audioEnabled = e.target.checked;
  localStorage.setItem('glub_audio_enabled', e.target.checked ? '1' : '0');
  sound.setEnabled(e.target.checked);
});
// identical pattern for haptic-enabled
document.getElementById('replay-tutorial').addEventListener('click', () => {
  settingsDialog.close();
  showTutorial({ force: true });
});
```

### Feature-unavailable hide

```css
body[data-no-audio]  .settings-row:has(#audio-enabled)  { display: none; }
body[data-no-haptic] .settings-row:has(#haptic-enabled) { display: none; }
```

`app.js` init: `if (!sound.hasAudio) document.body.dataset.noAudio = '1';` (same for haptic).

## SW cache bump

`sw.js` `CACHE_VERSION` `glub-v6` -> `glub-v7`. Add to STATIC_ASSETS: `engine/sound.js`, `engine/haptic.js`. Model cache `glub-model-v3` unchanged. Deploy: existing users keep v6 serving until next reload, then SW bump detects v7, new install, old cache auto-pruned. Zero downtime.

## Error handling (cross-cutting)

- All modules: no-op graceful, no crash, no user-facing alerts
- Dev-only errors: throw on invalid preset IDs (catches typos early)
- `console.info` once per feature-not-available (iOS Safari: haptic unavailable, old browser: audio unavailable)
- AudioContext suspended (background tab) -> `play()` no-op until next user gesture implicit-resumes

## Testing strategy

### Unit tests (headless, Node 20 `node:test`)

New directory `desk-pet/tests/`:

| File | Coverage |
|---|---|
| `sound.test.js` | Construct with `enabled=false` must not instantiate AudioContext (stub); `unlock()` is idempotent (second call no-op); 6 preset registry complete; `play('invalid')` throws; `setEnabled(false)` disconnects master gain (stub verify); `play()` pre-unlock is silent no-op |
| `haptic.test.js` | Feature-detect `navigator.vibrate` (stub); disabled is silent no-op; `prefersReducedMotion.matches=true` is silent no-op (matchMedia stub); 5 preset registry complete; invalid preset throws |
| `onboarding.test.js` | Flag v1 -> v2 migration triggers `runOnboarding()` once; HINTS advance order; skip early-dismiss aborts in-flight `demo()` via AbortController; `showTutorial({force:true})` bypasses flag check |

Stubs for `AudioContext`, `navigator.vibrate`, `matchMedia` are simple factory functions in `tests/stubs.js`.

### Existing regression

`desk-pet/tests/bpe_parity.test.js` (3 tests) - unchanged, 3/3 pass.

### Manual browser validation (Chrome MCP + mobile Safari spot check)

Checklist:

- [ ] First-visit: tutorial fires, pulsing ring positioned over fish, scripted demo (spiral -> HAPPY -> speech) visible, haptic felt on mobile
- [ ] Returning visit v1 -> v2: tutorial fires once, dismiss sets flag v2
- [ ] Settings: 2 checkboxes + replay button visible; live toggle works (next interaction audible/silent as toggled)
- [ ] Audio unlock: first fish click triggers bubble_pop audible, subsequent unthrottled
- [ ] iOS Safari: no haptic (silent), no crash, tutorial works a11y-wise
- [ ] `prefers-reduced-motion`: tutorial skips pulse + demo (text hints only), fast-forward 2s per hint
- [ ] axe-core 0 violations (baseline preserved)
- [ ] bubble_pop throttling: burst 3 spawns -> max 1 audible in 500 ms window

## Rollout

- No runtime feature flag. Deploy direct to master, GH Pages auto-deploys. Rollback = `git revert`.
- **Backward compat**: user who does not reload keeps SW cache v6 serving; next reload, SW bump detects v7, installs new cache. Zero downtime.
- HF model pipeline unchanged. Zero impact on ML.

## Effort estimate

| Component | Effort | File delta |
|---|:-:|---|
| `sound.js` (procedural synth) | ~2.5h | +1 new + 1 unit test |
| `haptic.js` | ~1h | +1 new + 1 unit test |
| Onboarding extension | ~2h | 1 extended + 1 unit test |
| Settings UI + wire-up | ~1h | 3 extended (index.html, app.js, style.css) |
| SW cache + integration | ~0.5h | 1 extended (sw.js) |
| Manual browser validation + a11y re-check | ~1h | checklist |
| **Total** | **~8h** | 2 new files + 5 extended + 3 test files |

## Out of scope (deferred)

These features were considered and explicitly moved to a future session:

- **Bowl memory persistence**: fish remembers last feed / chat / celebration across sessions via localStorage. This is a cross-session retention feature, orthogonal to first-impression richness. Would require a new `engine/bowl-memory.js` module + hooks into FSM + speech.js for reactivation on load. Deferred to Cluster B.2 or later.
- **Day/night rituals**: auto-greeting at dawn (~6-7am) and sunset (~18-20), integrated with existing palette cycle. `idle.js` currently is not time-aware (only timer-based), so this needs a time-category phrase filter plus FSM auto-transition triggers. Deferred; palette cycle already visually marks day/night without verbal rituals.
- **Companion aquarium/controller audio+haptic**: the companion surface has its own set of user gestures (feed button, play toss, water change) and would need its own event taxonomy. Separate spec; this one is desk-pet only.

## Open questions

None blocking. Implementation can proceed once Dennis approves this spec.

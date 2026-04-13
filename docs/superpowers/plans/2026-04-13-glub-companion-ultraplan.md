# GlubLM Companion - Ultraplan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a virtual pet companion system where a goldfish lives on a server with biological needs, personality growth, and multi-device viewing/control via WebSocket.

**Architecture:** Node.js server manages pet state (needs, mood, bond, poop) and ONNX inference. Thin browser clients connect via WebSocket - an aquarium viewer (reuses desk-pet/engine/) for display and a controller for care actions. State persists to JSON on disk.

**Tech Stack:** Node.js (no framework), ONNX Runtime Node, `ws` library, vanilla JS ES modules, Canvas 2D. Node built-in `node:test` for server tests.

**Spec:** `docs/superpowers/specs/2026-04-13-glub-companion-design.md`

---

## Phase Overview

| Phase | Tasks | What it builds |
|-------|-------|---------------|
| **1: Server Foundation** | 1-8 | Scaffolding, shared protocol, pet state, needs decay, actions, poop cycle, persistence, HTTP+WS server |
| **2: AI + Personality** | 9-13 | ONNX inference, prompt builder, phrase selector, mood+bond system, new phrases |
| **3: Aquarium Viewer** | 14-19 | WebSocket client viewer, poop sprites, dirty water, food flakes, belly-up, bond behavior |
| **4: Controller UI** | 20-25 | GBA-themed controller, status bars, dynamic actions, chat, mini preview, full-stack test |

---

## Phase 1: Server Foundation

### Task 1: Scaffolding

**Files:**
- Create: `companion/package.json`
- Create: `companion/.gitignore`

- [ ] **Step 1: Create package.json**

```json
{
  "name": "glublm-companion",
  "version": "0.1.0",
  "description": "GlubLM virtual pet companion server",
  "type": "module",
  "main": "server/index.js",
  "scripts": {
    "start": "node server/index.js",
    "test": "node --test server/**/*.test.js"
  },
  "dependencies": {
    "onnxruntime-node": "^1.19.0",
    "ws": "^8.16.0"
  },
  "license": "AGPL-3.0-or-later"
}
```

- [ ] **Step 2: Create .gitignore**

```
node_modules/
pet-state.json
```

- [ ] **Step 3: Install dependencies**

Run: `cd L:/Dennis/Projects/glublm/companion && npm install`
Expected: `node_modules/` created, `package-lock.json` generated

- [ ] **Step 4: Verify test runner works**

Create a smoke file `companion/server/smoke.test.js`:
```js
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

describe('smoke', () => {
  it('runs', () => {
    assert.equal(1 + 1, 2);
  });
});
```

Run: `cd L:/Dennis/Projects/glublm/companion && npm test`
Expected: 1 test passed

- [ ] **Step 5: Commit**

```bash
cd L:/Dennis/Projects/glublm
git add companion/package.json companion/package-lock.json companion/.gitignore companion/server/smoke.test.js
git commit -m "feat(companion): scaffolding - package.json, test runner"
```

---

### Task 2: Shared Constants + Protocol

**Files:**
- Create: `companion/shared/constants.js`
- Create: `companion/shared/protocol.js`
- Create: `companion/shared/constants.test.js`

- [ ] **Step 1: Write constants**

```js
// companion/shared/constants.js

// Needs decay rates (per hour)
export const HUNGER_DECAY_PER_HOUR = 4.17;       // 100 -> 0 in ~24h
export const CLEANLINESS_DECAY_PER_HOUR = 1.2;    // 100 -> 0 in ~83h (~3.5 days)
export const POOP_DECAY_MODIFIER_PER_HOUR = 0.3;  // each poop adds this to cleanliness decay
export const DIRTY_WATER_HUNGER_MULTIPLIER = 1.2;  // 20% faster hunger when water <30%
export const DIRTY_WATER_THRESHOLD = 30;

// Health recovery/damage rates (per hour)
export const HEALTH_RECOVERY_PER_HOUR = 2;
export const HEALTH_DAMAGE_PER_HOUR = 3;
export const HEALTH_CRITICAL_DAMAGE_PER_HOUR = 6;
export const HEALTH_RECOVERY_HUNGER_MIN = 40;
export const HEALTH_RECOVERY_CLEAN_MIN = 30;
export const HEALTH_DAMAGE_HUNGER_MAX = 15;
export const HEALTH_DAMAGE_CLEAN_MAX = 15;

// Interaction bonus
export const INTERACTION_BONUS_DECAY_PER_HOUR = 50; // decays over ~2h

// Happiness formula weights
export const HAPPY_WEIGHT_HUNGER = 0.35;
export const HAPPY_WEIGHT_CLEAN = 0.25;
export const HAPPY_WEIGHT_INTERACT = 0.25;
export const HAPPY_WEIGHT_HEALTH = 0.15;

// Action values
export const FEED_AMOUNT = 40;
export const FEED_COOLDOWN_MS = 30 * 60 * 1000;         // 30 min
export const FEED_OVERCOUNT = 3;                          // 3 feeds in window = bloated
export const FEED_OVERWINDOW_MS = 4 * 60 * 60 * 1000;    // 4 hour window
export const FEED_BLOAT_HAPPINESS_PENALTY = 15;
export const FEED_BLOAT_RECOVERY_MS = 2 * 60 * 60 * 1000; // 2h recovery

export const WATER_CHANGE_COOLDOWN_MS = 4 * 60 * 60 * 1000; // 4h
export const PLAY_BONUS = 20;
export const PLAY_COOLDOWN_MS = 5 * 60 * 1000; // 5 min

export const POOP_DELAY_MIN_MS = 2 * 60 * 60 * 1000; // 2h after feeding
export const POOP_DELAY_MAX_MS = 4 * 60 * 60 * 1000; // 4h after feeding

// Bond rates (per event)
export const BOND_FEED = 0.5;
export const BOND_FEED_DAILY_CAP = 2.0;
export const BOND_CLEAN = 0.3;
export const BOND_CHAT = 0.2;
export const BOND_DAILY_CARE_BONUS = 1.0;
export const BOND_NEGLECT_PER_DAY = -0.5;
export const BOND_CRITICAL_PENALTY = -2.0;
export const BOND_ABSENCE_PER_DAY = -0.1;
export const BOND_ABSENCE_THRESHOLD_MS = 48 * 60 * 60 * 1000; // 48h

// Thresholds
export const THRESHOLD_STARVING = 15;
export const THRESHOLD_FILTHY = 20;
export const THRESHOLD_DEPRESSED = 25;
export const THRESHOLD_CRITICAL = 10;
export const THRESHOLD_BELLY_UP_RECOVERY = 15;

// Tick interval
export const TICK_INTERVAL_MS = 1000;
export const SAVE_INTERVAL_MS = 60 * 1000; // auto-save every 60s

// Server
export const DEFAULT_PORT = 3210;
```

- [ ] **Step 2: Write protocol**

```js
// companion/shared/protocol.js

// Server -> Client message types
export const MSG = {
  // Full state sync (sent on connect)
  FULL_STATE: 'full_state',

  // Delta updates
  NEEDS_UPDATE: 'needs_update',       // { hunger, cleanliness, happiness, health, bond }
  SPEECH: 'speech',                   // { text, speaker: 'fish'|'user', mood }
  ANIMATION: 'animation',            // { state, duration }
  FEED: 'feed',                      // { flakes }
  POOP: 'poop',                      // { action: 'add'|'remove'|'clear', id?, position? }
  WATER_QUALITY: 'water_quality',    // { level: 0-1 }
  WATER_CHANGE: 'water_change',      // {} (triggers drain+refill animation)
  PLAY: 'play',                      // { toy: 'bubble_wand'|'light' }
  BLOAT: 'bloat',                    // { active: true|false }
  BELLY_UP: 'belly_up',             // { active: true|false }
  BOND_BEHAVIOR: 'bond_behavior',   // { level: 'stranger'|'familiar'|'comfortable'|'bonded' }

  // Client -> Server commands
  CMD_FEED: 'cmd_feed',
  CMD_CLEAN_POOP: 'cmd_clean_poop', // { id } - remove specific poop
  CMD_CHANGE_WATER: 'cmd_change_water',
  CMD_PLAY: 'cmd_play',
  CMD_CHAT: 'cmd_chat',             // { text }
  CMD_CLICK_FISH: 'cmd_click_fish',
  CMD_CURSOR: 'cmd_cursor',         // { x, y } (internal coords)
};

export function pack(type, data = {}) {
  return JSON.stringify({ type, ...data, ts: Date.now() });
}

export function unpack(raw) {
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}
```

- [ ] **Step 3: Write test for constants sanity**

```js
// companion/shared/constants.test.js
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import * as C from './constants.js';

describe('constants', () => {
  it('hunger drains in ~24h', () => {
    const hours = 100 / C.HUNGER_DECAY_PER_HOUR;
    assert.ok(hours > 20 && hours < 28, `Expected ~24h, got ${hours}h`);
  });

  it('cleanliness drains in 72-96h', () => {
    const hours = 100 / C.CLEANLINESS_DECAY_PER_HOUR;
    assert.ok(hours > 70 && hours < 100, `Expected 72-96h, got ${hours}h`);
  });

  it('feed amount under 50 (so 3 feeds can overfeed)', () => {
    assert.ok(C.FEED_AMOUNT < 50);
    assert.ok(C.FEED_AMOUNT * C.FEED_OVERCOUNT > 100);
  });

  it('all thresholds are 0-100 range', () => {
    for (const k of ['THRESHOLD_STARVING', 'THRESHOLD_FILTHY', 'THRESHOLD_DEPRESSED', 'THRESHOLD_CRITICAL']) {
      assert.ok(C[k] >= 0 && C[k] <= 100, `${k} = ${C[k]}`);
    }
  });
});
```

- [ ] **Step 4: Run tests**

Run: `cd L:/Dennis/Projects/glublm/companion && node --test shared/constants.test.js`
Expected: 4 tests passed

- [ ] **Step 5: Commit**

```bash
git add companion/shared/
git commit -m "feat(companion): shared constants + WebSocket protocol"
```

---

### Task 3: Pet State Object

**Files:**
- Create: `companion/server/pet-state.js`
- Create: `companion/server/pet-state.test.js`

- [ ] **Step 1: Write failing test**

```js
// companion/server/pet-state.test.js
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { PetState } from './pet-state.js';

describe('PetState', () => {
  it('creates with default values', () => {
    const pet = new PetState();
    assert.equal(pet.hunger, 100);
    assert.equal(pet.cleanliness, 100);
    assert.equal(pet.health, 100);
    assert.equal(pet.bond, 10);
    assert.equal(pet.poops.length, 0);
    assert.equal(pet.isBloated, false);
    assert.equal(pet.isBellyUp, false);
    assert.ok(pet.createdAt > 0);
  });

  it('serializes and deserializes', () => {
    const pet = new PetState();
    pet.hunger = 50;
    pet.bond = 42;
    pet.poops.push({ id: 'p1', x: 0.3, y: 0.85, createdAt: Date.now() });
    const json = pet.serialize();
    const restored = PetState.deserialize(json);
    assert.equal(restored.hunger, 50);
    assert.equal(restored.bond, 42);
    assert.equal(restored.poops.length, 1);
    assert.equal(restored.poops[0].id, 'p1');
  });

  it('clamps values to 0-100', () => {
    const pet = new PetState();
    pet.hunger = 150;
    assert.equal(pet.hunger, 100);
    pet.hunger = -20;
    assert.equal(pet.hunger, 0);
  });

  it('computes happiness from formula', () => {
    const pet = new PetState();
    pet.hunger = 80;
    pet.cleanliness = 80;
    pet.health = 100;
    pet.interactionBonus = 50;
    const h = pet.happiness;
    // (80*0.35)+(80*0.25)+(50*0.25)+(100*0.15) = 28+20+12.5+15 = 75.5
    assert.ok(Math.abs(h - 75.5) < 0.1, `Expected ~75.5, got ${h}`);
  });

  it('tracks age in days', () => {
    const pet = new PetState();
    pet.createdAt = Date.now() - 3 * 24 * 60 * 60 * 1000;
    assert.equal(pet.ageDays, 3);
  });

  it('computes bond level label', () => {
    const pet = new PetState();
    pet.bond = 5;
    assert.equal(pet.bondLevel, 'stranger');
    pet.bond = 35;
    assert.equal(pet.bondLevel, 'familiar');
    pet.bond = 60;
    assert.equal(pet.bondLevel, 'comfortable');
    pet.bond = 85;
    assert.equal(pet.bondLevel, 'bonded');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd L:/Dennis/Projects/glublm/companion && node --test server/pet-state.test.js`
Expected: FAIL - module not found

- [ ] **Step 3: Implement PetState**

```js
// companion/server/pet-state.js
import {
  HAPPY_WEIGHT_HUNGER, HAPPY_WEIGHT_CLEAN,
  HAPPY_WEIGHT_INTERACT, HAPPY_WEIGHT_HEALTH,
} from '../shared/constants.js';

function clamp(v) { return Math.max(0, Math.min(100, v)); }

let _poopIdCounter = 0;
export function nextPoopId() { return `p${++_poopIdCounter}`; }

export class PetState {
  constructor() {
    this._hunger = 100;
    this._cleanliness = 100;
    this._health = 100;
    this._bond = 10;
    this.interactionBonus = 0;
    this.poops = [];
    this.isBloated = false;
    this.isBellyUp = false;
    this.createdAt = Date.now();
    this.lastInteraction = Date.now();
    this.lastFeedTime = 0;
    this.feedCountInWindow = 0;
    this.feedWindowStart = 0;
    this.lastWaterChangeTime = 0;
    this.lastPlayTime = 0;
    this.pendingPoopTimers = []; // [{scheduledAt}]
    this.bondFeedToday = 0;
    this.bondDayStart = this._dayStart();
    this.fishName = 'glub';
  }

  get hunger() { return this._hunger; }
  set hunger(v) { this._hunger = clamp(v); }

  get cleanliness() { return this._cleanliness; }
  set cleanliness(v) { this._cleanliness = clamp(v); }

  get health() { return this._health; }
  set health(v) { this._health = clamp(v); }

  get bond() { return this._bond; }
  set bond(v) { this._bond = clamp(v); }

  get happiness() {
    return clamp(
      this._hunger * HAPPY_WEIGHT_HUNGER +
      this._cleanliness * HAPPY_WEIGHT_CLEAN +
      this.interactionBonus * HAPPY_WEIGHT_INTERACT +
      this._health * HAPPY_WEIGHT_HEALTH
    );
  }

  get ageDays() {
    return Math.floor((Date.now() - this.createdAt) / (24 * 60 * 60 * 1000));
  }

  get bondLevel() {
    if (this._bond < 20) return 'stranger';
    if (this._bond < 50) return 'familiar';
    if (this._bond < 75) return 'comfortable';
    return 'bonded';
  }

  _dayStart() {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d.getTime();
  }

  serialize() {
    return JSON.stringify({
      hunger: this._hunger,
      cleanliness: this._cleanliness,
      health: this._health,
      bond: this._bond,
      interactionBonus: this.interactionBonus,
      poops: this.poops,
      isBloated: this.isBloated,
      isBellyUp: this.isBellyUp,
      createdAt: this.createdAt,
      lastInteraction: this.lastInteraction,
      lastFeedTime: this.lastFeedTime,
      feedCountInWindow: this.feedCountInWindow,
      feedWindowStart: this.feedWindowStart,
      lastWaterChangeTime: this.lastWaterChangeTime,
      lastPlayTime: this.lastPlayTime,
      pendingPoopTimers: this.pendingPoopTimers,
      bondFeedToday: this.bondFeedToday,
      bondDayStart: this.bondDayStart,
      fishName: this.fishName,
    }, null, 2);
  }

  static deserialize(json) {
    const data = typeof json === 'string' ? JSON.parse(json) : json;
    const pet = new PetState();
    for (const key of Object.keys(data)) {
      if (key === 'hunger') pet._hunger = clamp(data.hunger);
      else if (key === 'cleanliness') pet._cleanliness = clamp(data.cleanliness);
      else if (key === 'health') pet._health = clamp(data.health);
      else if (key === 'bond') pet._bond = clamp(data.bond);
      else if (key in pet) pet[key] = data[key];
    }
    return pet;
  }

  snapshot() {
    return {
      hunger: this._hunger,
      cleanliness: this._cleanliness,
      happiness: this.happiness,
      health: this._health,
      bond: this._bond,
      bondLevel: this.bondLevel,
      poops: this.poops,
      isBloated: this.isBloated,
      isBellyUp: this.isBellyUp,
      ageDays: this.ageDays,
      fishName: this.fishName,
    };
  }
}
```

- [ ] **Step 4: Run tests**

Run: `cd L:/Dennis/Projects/glublm/companion && node --test server/pet-state.test.js`
Expected: 6 tests passed

- [ ] **Step 5: Commit**

```bash
git add companion/server/pet-state.js companion/server/pet-state.test.js
git commit -m "feat(companion): PetState object with serialization + happiness formula"
```

---

### Task 4: Needs Engine - Decay

**Files:**
- Create: `companion/server/needs-engine.js`
- Create: `companion/server/needs-engine.test.js`

- [ ] **Step 1: Write failing tests for decay**

```js
// companion/server/needs-engine.test.js
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { NeedsEngine } from './needs-engine.js';
import { PetState } from './pet-state.js';

describe('NeedsEngine.tick', () => {
  it('decays hunger over 1 hour', () => {
    const pet = new PetState();
    const engine = new NeedsEngine(pet);
    // Simulate 1 hour of ticks (3600 seconds)
    for (let i = 0; i < 3600; i++) engine.tick(1);
    // ~4.17 per hour
    assert.ok(pet.hunger > 94 && pet.hunger < 97, `hunger=${pet.hunger}`);
  });

  it('decays cleanliness over 1 hour', () => {
    const pet = new PetState();
    const engine = new NeedsEngine(pet);
    for (let i = 0; i < 3600; i++) engine.tick(1);
    // ~1.2 per hour
    assert.ok(pet.cleanliness > 97.5 && pet.cleanliness < 99.5, `clean=${pet.cleanliness}`);
  });

  it('hunger decays faster when water is dirty', () => {
    const pet = new PetState();
    pet.cleanliness = 20; // below 30 threshold
    const engine = new NeedsEngine(pet);
    for (let i = 0; i < 3600; i++) engine.tick(1);
    // 4.17 * 1.2 = ~5.0/hr
    const lost = 100 - pet.hunger;
    assert.ok(lost > 4.5 && lost < 5.5, `lost=${lost}`);
  });

  it('poop accelerates cleanliness decay', () => {
    const pet = new PetState();
    pet.poops = [
      { id: 'p1', x: 0.3, y: 0.85, createdAt: Date.now() },
      { id: 'p2', x: 0.5, y: 0.85, createdAt: Date.now() },
    ];
    const engine = new NeedsEngine(pet);
    for (let i = 0; i < 3600; i++) engine.tick(1);
    // base 1.2 + 2*0.3 = 1.8/hr
    const lost = 100 - pet.cleanliness;
    assert.ok(lost > 1.5 && lost < 2.1, `lost=${lost}`);
  });

  it('health recovers when fed and clean', () => {
    const pet = new PetState();
    pet.health = 50;
    pet.hunger = 80;
    pet.cleanliness = 80;
    const engine = new NeedsEngine(pet);
    for (let i = 0; i < 3600; i++) engine.tick(1);
    // +2/hr recovery
    assert.ok(pet.health > 51 && pet.health < 53, `health=${pet.health}`);
  });

  it('health drops when starving', () => {
    const pet = new PetState();
    pet.hunger = 10; // below 15
    pet.cleanliness = 50;
    const engine = new NeedsEngine(pet);
    for (let i = 0; i < 3600; i++) engine.tick(1);
    // -3/hr
    assert.ok(pet.health > 96 && pet.health < 98, `health=${pet.health}`);
  });

  it('health drops fast when both starving and filthy', () => {
    const pet = new PetState();
    pet.hunger = 5;
    pet.cleanliness = 5;
    const engine = new NeedsEngine(pet);
    for (let i = 0; i < 3600; i++) engine.tick(1);
    // -6/hr
    assert.ok(pet.health > 93 && pet.health < 95, `health=${pet.health}`);
  });

  it('belly-up triggers at health <10', () => {
    const pet = new PetState();
    pet.health = 10.5;
    pet.hunger = 5;
    pet.cleanliness = 5;
    const engine = new NeedsEngine(pet);
    const events = [];
    engine.on('belly_up', () => events.push('belly_up'));
    // Tick until health drops below 10
    for (let i = 0; i < 400; i++) engine.tick(1);
    assert.ok(pet.isBellyUp, 'Expected belly-up');
    assert.ok(events.length > 0, 'Expected belly_up event');
  });

  it('interaction bonus decays', () => {
    const pet = new PetState();
    pet.interactionBonus = 50;
    const engine = new NeedsEngine(pet);
    for (let i = 0; i < 3600; i++) engine.tick(1);
    // 50/hr decay -> should be ~0
    assert.ok(pet.interactionBonus < 2, `bonus=${pet.interactionBonus}`);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd L:/Dennis/Projects/glublm/companion && node --test server/needs-engine.test.js`
Expected: FAIL - module not found

- [ ] **Step 3: Implement NeedsEngine (decay only)**

```js
// companion/server/needs-engine.js
import {
  HUNGER_DECAY_PER_HOUR, CLEANLINESS_DECAY_PER_HOUR,
  POOP_DECAY_MODIFIER_PER_HOUR, DIRTY_WATER_HUNGER_MULTIPLIER,
  DIRTY_WATER_THRESHOLD, HEALTH_RECOVERY_PER_HOUR,
  HEALTH_DAMAGE_PER_HOUR, HEALTH_CRITICAL_DAMAGE_PER_HOUR,
  HEALTH_RECOVERY_HUNGER_MIN, HEALTH_RECOVERY_CLEAN_MIN,
  HEALTH_DAMAGE_HUNGER_MAX, HEALTH_DAMAGE_CLEAN_MAX,
  INTERACTION_BONUS_DECAY_PER_HOUR, THRESHOLD_CRITICAL,
} from '../shared/constants.js';

export class NeedsEngine {
  constructor(petState) {
    this._pet = petState;
    this._listeners = {};
  }

  on(event, fn) {
    (this._listeners[event] ||= []).push(fn);
  }

  _emit(event, data) {
    for (const fn of this._listeners[event] || []) fn(data);
  }

  /**
   * Advance simulation by `dtSec` seconds.
   * Called once per tick (~1 second).
   */
  tick(dtSec) {
    const dtHour = dtSec / 3600;
    const pet = this._pet;

    // --- Hunger decay ---
    let hungerRate = HUNGER_DECAY_PER_HOUR;
    if (pet.cleanliness < DIRTY_WATER_THRESHOLD) {
      hungerRate *= DIRTY_WATER_HUNGER_MULTIPLIER;
    }
    pet.hunger -= hungerRate * dtHour;

    // --- Cleanliness decay ---
    let cleanRate = CLEANLINESS_DECAY_PER_HOUR;
    cleanRate += pet.poops.length * POOP_DECAY_MODIFIER_PER_HOUR;
    pet.cleanliness -= cleanRate * dtHour;

    // --- Interaction bonus decay ---
    if (pet.interactionBonus > 0) {
      pet.interactionBonus = Math.max(0,
        pet.interactionBonus - INTERACTION_BONUS_DECAY_PER_HOUR * dtHour
      );
    }

    // --- Health ---
    const hungerOk = pet.hunger > HEALTH_RECOVERY_HUNGER_MIN;
    const cleanOk = pet.cleanliness > HEALTH_RECOVERY_CLEAN_MIN;
    const hungerBad = pet.hunger < HEALTH_DAMAGE_HUNGER_MAX;
    const cleanBad = pet.cleanliness < HEALTH_DAMAGE_CLEAN_MAX;

    if (hungerOk && cleanOk) {
      pet.health += HEALTH_RECOVERY_PER_HOUR * dtHour;
    } else if (hungerBad && cleanBad) {
      pet.health -= HEALTH_CRITICAL_DAMAGE_PER_HOUR * dtHour;
    } else if (hungerBad || cleanBad) {
      pet.health -= HEALTH_DAMAGE_PER_HOUR * dtHour;
    }
    // else: neutral zone, no change

    // --- Belly-up check ---
    if (!pet.isBellyUp && pet.health < THRESHOLD_CRITICAL) {
      pet.isBellyUp = true;
      this._emit('belly_up', {});
    }

    // --- Recovery from belly-up ---
    if (pet.isBellyUp && pet.health >= THRESHOLD_CRITICAL + 5) {
      pet.isBellyUp = false;
      this._emit('recovery', {});
    }

    // --- Poop timers ---
    const now = Date.now();
    const readyPoops = pet.pendingPoopTimers.filter(t => now >= t.scheduledAt);
    for (const timer of readyPoops) {
      this._spawnPoop();
    }
    pet.pendingPoopTimers = pet.pendingPoopTimers.filter(t => now < t.scheduledAt);
  }

  _spawnPoop() {
    const { nextPoopId } = await import('./pet-state.js');
    // Random position on gravel (bottom 15% of bowl, spread horizontally)
    const x = 0.2 + Math.random() * 0.6;
    const y = 0.82 + Math.random() * 0.06;
    const poop = { id: nextPoopId(), x, y, createdAt: Date.now() };
    this._pet.poops.push(poop);
    this._emit('poop_add', poop);
  }
}
```

Wait - the `_spawnPoop` method uses a top-level `await import()` inside a non-async method. Fix:

```js
// Replace the _spawnPoop method with:
  _spawnPoop() {
    const id = `p${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`;
    const x = 0.2 + Math.random() * 0.6;
    const y = 0.82 + Math.random() * 0.06;
    const poop = { id, x, y, createdAt: Date.now() };
    this._pet.poops.push(poop);
    this._emit('poop_add', poop);
  }
```

- [ ] **Step 4: Run tests**

Run: `cd L:/Dennis/Projects/glublm/companion && node --test server/needs-engine.test.js`
Expected: 9 tests passed

- [ ] **Step 5: Commit**

```bash
git add companion/server/needs-engine.js companion/server/needs-engine.test.js
git commit -m "feat(companion): NeedsEngine - hunger/cleanliness/health decay + belly-up"
```

---

### Task 5: Needs Engine - Actions

**Files:**
- Modify: `companion/server/needs-engine.js`
- Create: `companion/server/needs-actions.test.js`

- [ ] **Step 1: Write failing tests for actions**

```js
// companion/server/needs-actions.test.js
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { NeedsEngine } from './needs-engine.js';
import { PetState } from './pet-state.js';

describe('NeedsEngine.feed', () => {
  it('increases hunger by FEED_AMOUNT', () => {
    const pet = new PetState();
    pet.hunger = 50;
    const engine = new NeedsEngine(pet);
    const result = engine.feed();
    assert.ok(result.ok);
    assert.equal(pet.hunger, 90);
  });

  it('caps hunger at 100', () => {
    const pet = new PetState();
    pet.hunger = 80;
    const engine = new NeedsEngine(pet);
    engine.feed();
    assert.equal(pet.hunger, 100);
  });

  it('rejects feed during cooldown', () => {
    const pet = new PetState();
    pet.hunger = 50;
    const engine = new NeedsEngine(pet);
    engine.feed();
    const result = engine.feed();
    assert.ok(!result.ok);
    assert.equal(result.reason, 'cooldown');
  });

  it('triggers bloat on overfeeding', () => {
    const pet = new PetState();
    pet.hunger = 10;
    const engine = new NeedsEngine(pet);
    // Force 3 feeds by resetting cooldown
    engine.feed();
    pet.lastFeedTime = 0; // reset cooldown
    engine.feed();
    pet.lastFeedTime = 0;
    const result = engine.feed();
    assert.ok(result.bloated);
    assert.ok(pet.isBloated);
  });

  it('schedules poop after feeding', () => {
    const pet = new PetState();
    const engine = new NeedsEngine(pet);
    engine.feed();
    assert.equal(pet.pendingPoopTimers.length, 1);
  });
});

describe('NeedsEngine.cleanPoop', () => {
  it('removes specific poop by id', () => {
    const pet = new PetState();
    pet.poops = [
      { id: 'p1', x: 0.3, y: 0.85, createdAt: Date.now() },
      { id: 'p2', x: 0.5, y: 0.85, createdAt: Date.now() },
    ];
    const engine = new NeedsEngine(pet);
    engine.cleanPoop('p1');
    assert.equal(pet.poops.length, 1);
    assert.equal(pet.poops[0].id, 'p2');
  });
});

describe('NeedsEngine.changeWater', () => {
  it('resets cleanliness to 100', () => {
    const pet = new PetState();
    pet.cleanliness = 30;
    const engine = new NeedsEngine(pet);
    const result = engine.changeWater();
    assert.ok(result.ok);
    assert.equal(pet.cleanliness, 100);
  });

  it('rejects during cooldown', () => {
    const pet = new PetState();
    pet.cleanliness = 30;
    const engine = new NeedsEngine(pet);
    engine.changeWater();
    const result = engine.changeWater();
    assert.ok(!result.ok);
    assert.equal(result.reason, 'cooldown');
  });
});

describe('NeedsEngine.play', () => {
  it('adds interaction bonus', () => {
    const pet = new PetState();
    pet.interactionBonus = 0;
    const engine = new NeedsEngine(pet);
    engine.play();
    assert.equal(pet.interactionBonus, 20);
  });

  it('rejects during cooldown', () => {
    const pet = new PetState();
    const engine = new NeedsEngine(pet);
    engine.play();
    const result = engine.play();
    assert.ok(!result.ok);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd L:/Dennis/Projects/glublm/companion && node --test server/needs-actions.test.js`
Expected: FAIL - feed/cleanPoop/changeWater/play not defined

- [ ] **Step 3: Add action methods to NeedsEngine**

Add to `companion/server/needs-engine.js`, inside the class, after the `_spawnPoop` method:

```js
  feed() {
    const pet = this._pet;
    const now = Date.now();

    // Cooldown check
    if (now - pet.lastFeedTime < FEED_COOLDOWN_MS) {
      return { ok: false, reason: 'cooldown' };
    }

    // Overfeeding check
    if (now - pet.feedWindowStart > FEED_OVERWINDOW_MS) {
      pet.feedCountInWindow = 0;
      pet.feedWindowStart = now;
    }
    pet.feedCountInWindow++;

    let bloated = false;
    if (pet.feedCountInWindow >= FEED_OVERCOUNT) {
      pet.isBloated = true;
      pet.interactionBonus = Math.max(0, pet.interactionBonus - FEED_BLOAT_HAPPINESS_PENALTY);
      bloated = true;
      // Extra poop from bloat
      this._schedulePoop();
      this._emit('bloat', { active: true });
    }

    pet.hunger += FEED_AMOUNT;
    pet.lastFeedTime = now;
    pet.lastInteraction = now;

    // Schedule normal poop
    this._schedulePoop();

    this._emit('feed', {});
    return { ok: true, bloated };
  }

  _schedulePoop() {
    const delay = POOP_DELAY_MIN_MS + Math.random() * (POOP_DELAY_MAX_MS - POOP_DELAY_MIN_MS);
    this._pet.pendingPoopTimers.push({ scheduledAt: Date.now() + delay });
  }

  cleanPoop(poopId) {
    const pet = this._pet;
    const idx = pet.poops.findIndex(p => p.id === poopId);
    if (idx === -1) return { ok: false, reason: 'not_found' };
    pet.poops.splice(idx, 1);
    pet.lastInteraction = Date.now();
    this._emit('poop_remove', { id: poopId });
    return { ok: true };
  }

  changeWater() {
    const pet = this._pet;
    const now = Date.now();
    if (now - pet.lastWaterChangeTime < WATER_CHANGE_COOLDOWN_MS) {
      return { ok: false, reason: 'cooldown' };
    }
    pet.cleanliness = 100;
    pet.lastWaterChangeTime = now;
    pet.lastInteraction = now;
    this._emit('water_change', {});
    return { ok: true };
  }

  play() {
    const pet = this._pet;
    const now = Date.now();
    if (now - pet.lastPlayTime < PLAY_COOLDOWN_MS) {
      return { ok: false, reason: 'cooldown' };
    }
    pet.interactionBonus = Math.min(100, pet.interactionBonus + PLAY_BONUS);
    pet.lastPlayTime = now;
    pet.lastInteraction = now;
    this._emit('play', {});
    return { ok: true };
  }
```

Also add the missing imports at the top of `needs-engine.js`:

```js
import {
  HUNGER_DECAY_PER_HOUR, CLEANLINESS_DECAY_PER_HOUR,
  POOP_DECAY_MODIFIER_PER_HOUR, DIRTY_WATER_HUNGER_MULTIPLIER,
  DIRTY_WATER_THRESHOLD, HEALTH_RECOVERY_PER_HOUR,
  HEALTH_DAMAGE_PER_HOUR, HEALTH_CRITICAL_DAMAGE_PER_HOUR,
  HEALTH_RECOVERY_HUNGER_MIN, HEALTH_RECOVERY_CLEAN_MIN,
  HEALTH_DAMAGE_HUNGER_MAX, HEALTH_DAMAGE_CLEAN_MAX,
  INTERACTION_BONUS_DECAY_PER_HOUR, THRESHOLD_CRITICAL,
  FEED_AMOUNT, FEED_COOLDOWN_MS, FEED_OVERCOUNT,
  FEED_OVERWINDOW_MS, FEED_BLOAT_HAPPINESS_PENALTY,
  WATER_CHANGE_COOLDOWN_MS, PLAY_BONUS, PLAY_COOLDOWN_MS,
  POOP_DELAY_MIN_MS, POOP_DELAY_MAX_MS,
} from '../shared/constants.js';
```

- [ ] **Step 4: Run all needs tests**

Run: `cd L:/Dennis/Projects/glublm/companion && node --test server/needs-engine.test.js server/needs-actions.test.js`
Expected: all tests passed

- [ ] **Step 5: Commit**

```bash
git add companion/server/needs-engine.js companion/server/needs-actions.test.js
git commit -m "feat(companion): NeedsEngine actions - feed, clean, water change, play"
```

---

### Task 6: Persistence

**Files:**
- Create: `companion/server/persistence.js`
- Create: `companion/server/persistence.test.js`

- [ ] **Step 1: Write failing tests**

```js
// companion/server/persistence.test.js
import { describe, it, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { Persistence } from './persistence.js';
import { PetState } from './pet-state.js';

const TEST_PATH = path.join(import.meta.dirname, '_test_state.json');

afterEach(() => {
  try { fs.unlinkSync(TEST_PATH); } catch {}
});

describe('Persistence', () => {
  it('saves and loads pet state', () => {
    const pet = new PetState();
    pet.hunger = 42;
    pet.fishName = 'bubbles';
    const p = new Persistence(TEST_PATH);
    p.save(pet);
    assert.ok(fs.existsSync(TEST_PATH));
    const loaded = p.load();
    assert.equal(loaded.hunger, 42);
    assert.equal(loaded.fishName, 'bubbles');
  });

  it('returns null when no file exists', () => {
    const p = new Persistence(TEST_PATH);
    const loaded = p.load();
    assert.equal(loaded, null);
  });

  it('returns null on corrupt file', () => {
    fs.writeFileSync(TEST_PATH, 'not json{{{');
    const p = new Persistence(TEST_PATH);
    const loaded = p.load();
    assert.equal(loaded, null);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd L:/Dennis/Projects/glublm/companion && node --test server/persistence.test.js`
Expected: FAIL

- [ ] **Step 3: Implement Persistence**

```js
// companion/server/persistence.js
import fs from 'node:fs';
import { PetState } from './pet-state.js';

export class Persistence {
  constructor(filePath) {
    this._path = filePath;
  }

  save(petState) {
    const json = petState.serialize();
    const tmp = this._path + '.tmp';
    fs.writeFileSync(tmp, json, 'utf-8');
    fs.renameSync(tmp, this._path);
  }

  load() {
    try {
      if (!fs.existsSync(this._path)) return null;
      const raw = fs.readFileSync(this._path, 'utf-8');
      return PetState.deserialize(raw);
    } catch {
      return null;
    }
  }
}
```

- [ ] **Step 4: Run tests**

Run: `cd L:/Dennis/Projects/glublm/companion && node --test server/persistence.test.js`
Expected: 3 tests passed

- [ ] **Step 5: Commit**

```bash
git add companion/server/persistence.js companion/server/persistence.test.js
git commit -m "feat(companion): JSON persistence with atomic write"
```

---

### Task 7: WebSocket Server

**Files:**
- Create: `companion/server/ws-server.js`

- [ ] **Step 1: Implement WsServer**

```js
// companion/server/ws-server.js
import { WebSocketServer } from 'ws';
import { pack, unpack } from '../shared/protocol.js';

export class WsServer {
  constructor(httpServer) {
    this._wss = new WebSocketServer({ server: httpServer });
    this._clients = new Set();
    this._handler = null;

    this._wss.on('connection', (ws) => {
      this._clients.add(ws);
      ws.on('message', (raw) => {
        const msg = unpack(raw.toString());
        if (msg && this._handler) this._handler(msg, ws);
      });
      ws.on('close', () => this._clients.delete(ws));
      ws.on('error', () => this._clients.delete(ws));

      // Notify handler of new connection
      if (this._handler) this._handler({ type: '_connect' }, ws);
    });
  }

  onMessage(fn) {
    this._handler = fn;
  }

  broadcast(type, data = {}) {
    const msg = pack(type, data);
    for (const ws of this._clients) {
      if (ws.readyState === 1) ws.send(msg);
    }
  }

  send(ws, type, data = {}) {
    if (ws.readyState === 1) ws.send(pack(type, data));
  }

  get clientCount() {
    return this._clients.size;
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add companion/server/ws-server.js
git commit -m "feat(companion): WebSocket server with broadcast + per-client send"
```

---

### Task 8: Server Entry Point

**Files:**
- Create: `companion/server/index.js`

- [ ] **Step 1: Implement server entry point**

```js
// companion/server/index.js
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { PetState } from './pet-state.js';
import { NeedsEngine } from './needs-engine.js';
import { Persistence } from './persistence.js';
import { WsServer } from './ws-server.js';
import { MSG } from '../shared/protocol.js';
import {
  TICK_INTERVAL_MS, SAVE_INTERVAL_MS, DEFAULT_PORT,
} from '../shared/constants.js';

const PORT = parseInt(process.env.PORT || String(DEFAULT_PORT));
const STATE_FILE = process.env.STATE_FILE || path.join(import.meta.dirname, '..', 'pet-state.json');

// --- Load or create pet state ---
const persistence = new Persistence(STATE_FILE);
const pet = persistence.load() || new PetState();
const engine = new NeedsEngine(pet);

console.log(`[glub] Pet loaded: hunger=${pet.hunger.toFixed(1)} clean=${pet.cleanliness.toFixed(1)} health=${pet.health.toFixed(1)} bond=${pet.bond.toFixed(1)} age=${pet.ageDays}d`);

// --- HTTP server (serves static files for aquarium + controller) ---
const MIME = {
  '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript',
  '.css': 'text/css', '.json': 'application/json', '.png': 'image/png',
  '.svg': 'image/svg+xml', '.onnx': 'application/octet-stream',
};

const COMPANION_ROOT = path.join(import.meta.dirname, '..');
const DESK_PET_ROOT = path.join(import.meta.dirname, '..', '..', 'desk-pet');

function serveStatic(req, res) {
  const url = new URL(req.url, `http://localhost:${PORT}`);
  let filePath;

  if (url.pathname.startsWith('/aquarium/')) {
    filePath = path.join(COMPANION_ROOT, url.pathname);
  } else if (url.pathname.startsWith('/controller/')) {
    filePath = path.join(COMPANION_ROOT, url.pathname);
  } else if (url.pathname.startsWith('/engine/')) {
    // Serve desk-pet engine modules
    filePath = path.join(DESK_PET_ROOT, url.pathname);
  } else if (url.pathname === '/api/state') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(pet.snapshot()));
    return;
  } else if (url.pathname === '/') {
    res.writeHead(302, { Location: '/aquarium/' });
    res.end();
    return;
  } else {
    res.writeHead(404);
    res.end('not found');
    return;
  }

  const ext = path.extname(filePath);
  const mime = MIME[ext] || 'application/octet-stream';

  fs.readFile(filePath, (err, data) => {
    if (err) { res.writeHead(404); res.end('not found'); return; }
    res.writeHead(200, {
      'Content-Type': mime,
      'Cache-Control': 'no-cache',
    });
    res.end(data);
  });
}

const server = http.createServer(serveStatic);
const wss = new WsServer(server);

// --- Wire engine events to WebSocket broadcasts ---
engine.on('feed', () => wss.broadcast(MSG.FEED, { flakes: 5 }));
engine.on('poop_add', (poop) => wss.broadcast(MSG.POOP, { action: 'add', ...poop }));
engine.on('poop_remove', (data) => wss.broadcast(MSG.POOP, { action: 'remove', ...data }));
engine.on('water_change', () => wss.broadcast(MSG.WATER_CHANGE));
engine.on('play', () => wss.broadcast(MSG.PLAY, { toy: 'bubble_wand' }));
engine.on('belly_up', () => wss.broadcast(MSG.BELLY_UP, { active: true }));
engine.on('recovery', () => wss.broadcast(MSG.BELLY_UP, { active: false }));
engine.on('bloat', (d) => wss.broadcast(MSG.BLOAT, d));

// --- Handle client commands ---
wss.onMessage((msg, ws) => {
  if (msg.type === '_connect') {
    wss.send(ws, MSG.FULL_STATE, pet.snapshot());
    return;
  }

  switch (msg.type) {
    case MSG.CMD_FEED: {
      const result = engine.feed();
      if (result.ok) broadcastNeeds();
      else wss.send(ws, 'error', { action: 'feed', ...result });
      break;
    }
    case MSG.CMD_CLEAN_POOP: {
      const result = engine.cleanPoop(msg.id);
      if (result.ok) broadcastNeeds();
      break;
    }
    case MSG.CMD_CHANGE_WATER: {
      const result = engine.changeWater();
      if (result.ok) broadcastNeeds();
      else wss.send(ws, 'error', { action: 'water', ...result });
      break;
    }
    case MSG.CMD_PLAY: {
      const result = engine.play();
      if (result.ok) broadcastNeeds();
      else wss.send(ws, 'error', { action: 'play', ...result });
      break;
    }
    case MSG.CMD_CHAT: {
      // TODO: Task 10 - AI inference
      wss.broadcast(MSG.SPEECH, { text: msg.text, speaker: 'user', mood: '' });
      setTimeout(() => {
        wss.broadcast(MSG.SPEECH, { text: 'blub?', speaker: 'fish', mood: 'confused' });
      }, 1500);
      break;
    }
    case MSG.CMD_CLICK_FISH: {
      wss.broadcast(MSG.ANIMATION, { state: 'wiggle', duration: 0.8 });
      break;
    }
    case MSG.CMD_CURSOR: {
      wss.broadcast(MSG.CMD_CURSOR, { x: msg.x, y: msg.y });
      break;
    }
  }
});

function broadcastNeeds() {
  wss.broadcast(MSG.NEEDS_UPDATE, {
    hunger: pet.hunger,
    cleanliness: pet.cleanliness,
    happiness: pet.happiness,
    health: pet.health,
    bond: pet.bond,
    bondLevel: pet.bondLevel,
    isBloated: pet.isBloated,
    isBellyUp: pet.isBellyUp,
    poops: pet.poops,
  });
}

// --- Tick loop ---
let lastBroadcast = Date.now();
setInterval(() => {
  engine.tick(TICK_INTERVAL_MS / 1000);

  // Broadcast needs every 5 seconds (not every tick)
  if (Date.now() - lastBroadcast > 5000) {
    lastBroadcast = Date.now();
    broadcastNeeds();
    wss.broadcast(MSG.WATER_QUALITY, { level: pet.cleanliness / 100 });
  }
}, TICK_INTERVAL_MS);

// --- Auto-save ---
setInterval(() => {
  persistence.save(pet);
}, SAVE_INTERVAL_MS);

// --- Graceful shutdown ---
function shutdown() {
  console.log('[glub] Saving state...');
  persistence.save(pet);
  process.exit(0);
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

// --- Start ---
server.listen(PORT, () => {
  console.log(`[glub] Companion server running on http://localhost:${PORT}`);
  console.log(`[glub]   Aquarium: http://localhost:${PORT}/aquarium/`);
  console.log(`[glub]   Controller: http://localhost:${PORT}/controller/`);
  console.log(`[glub]   API: http://localhost:${PORT}/api/state`);
});
```

- [ ] **Step 2: Create placeholder index.html files so routes work**

```html
<!-- companion/aquarium/index.html -->
<!doctype html>
<html lang="en">
<head><meta charset="utf-8"><title>Glub Aquarium</title></head>
<body style="background:#0a1628;color:#c0e4f4;font-family:monospace;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;">
  <p>aquarium viewer - phase 3</p>
</body>
</html>
```

```html
<!-- companion/controller/index.html -->
<!doctype html>
<html lang="en">
<head><meta charset="utf-8"><title>Glub Controller</title></head>
<body style="background:#0c1e30;color:#c0e4f4;font-family:monospace;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;">
  <p>controller - phase 4</p>
</body>
</html>
```

- [ ] **Step 3: Test server starts and responds**

Run: `cd L:/Dennis/Projects/glublm/companion && timeout 5 node server/index.js || true`

Then in another terminal (or after):
Run: `curl http://localhost:3210/api/state 2>/dev/null | head -1`
Expected: JSON with hunger, cleanliness, etc.

- [ ] **Step 4: Commit**

```bash
git add companion/server/index.js companion/aquarium/index.html companion/controller/index.html
git commit -m "feat(companion): server entry point - HTTP + WebSocket + tick loop + persistence"
```

- [ ] **Step 5: Run full test suite**

Run: `cd L:/Dennis/Projects/glublm/companion && npm test`
Expected: all tests pass (smoke + constants + pet-state + needs-engine + needs-actions + persistence)

- [ ] **Step 6: Delete smoke test, commit**

```bash
rm companion/server/smoke.test.js
git add -A companion/ && git commit -m "chore(companion): remove smoke test, phase 1 complete"
```

---

## Phase 2: AI + Personality

### Task 9: Server-Side ONNX Inference

**Files:**
- Create: `companion/server/inference.js`
- Test: manual (ONNX inference is integration, not unit)

- [ ] **Step 1: Implement inference wrapper**

```js
// companion/server/inference.js
import { InferenceSession, Tensor } from 'onnxruntime-node';
import fs from 'node:fs';
import path from 'node:path';

const MAX_CTX = 96;
const MAX_NEW_TOKENS = 32;
const MIN_NEW_TOKENS = 4;
const TEMPERATURE = 0.6;
const TOP_K = 40;

function sampleTopK(logits, temperature, topK) {
  const scaled = logits.map(x => x / temperature);
  const indexed = scaled.map((v, i) => [v, i]);
  indexed.sort((a, b) => b[0] - a[0]);
  const top = indexed.slice(0, topK);
  const maxLogit = top[0][0];
  const exps = top.map(([v]) => Math.exp(v - maxLogit));
  const sumExp = exps.reduce((a, b) => a + b, 0);
  const probs = exps.map(e => e / sumExp);
  const r = Math.random();
  let acc = 0;
  for (let i = 0; i < probs.length; i++) {
    acc += probs[i];
    if (r <= acc) return top[i][1];
  }
  return top[top.length - 1][1];
}

export class GlubInference {
  constructor() {
    this._session = null;
    this._tokenizer = null;
    this._ready = false;
    this._generating = false;
  }

  async load(modelPath, tokenizerPath) {
    const tokJson = JSON.parse(fs.readFileSync(tokenizerPath, 'utf-8'));
    this._tokenizer = new SimpleBPE(tokJson);
    this._session = await InferenceSession.create(modelPath);
    this._ready = true;
    console.log('[glub] ONNX model loaded');
  }

  async generate(prompt) {
    if (!this._ready || this._generating) return 'blub?';
    this._generating = true;
    try {
      let ids = this._tokenizer.encode(prompt + ' ->');
      const produced = [];

      for (let step = 0; step < MAX_NEW_TOKENS; step++) {
        const ctx = ids.slice(-MAX_CTX);
        const input = new Tensor('int64', BigInt64Array.from(ctx.map(BigInt)), [1, ctx.length]);
        const out = await this._session.run({ input_ids: input });
        const logits = out.logits.data;
        const vocabSize = out.logits.dims[2];
        const seqLen = out.logits.dims[1];
        const lastLogits = Array.from(logits.slice((seqLen - 1) * vocabSize, seqLen * vocabSize));

        if (step < MIN_NEW_TOKENS) {
          if (this._tokenizer.eosId !== undefined) lastLogits[this._tokenizer.eosId] = -Infinity;
          if (this._tokenizer.padId !== undefined) lastLogits[this._tokenizer.padId] = -Infinity;
        }

        const nextId = sampleTopK(lastLogits, TEMPERATURE, TOP_K);
        ids.push(nextId);
        produced.push(nextId);
        if (step >= MIN_NEW_TOKENS && (nextId === this._tokenizer.eosId || nextId === this._tokenizer.padId)) break;
      }

      return this._tokenizer.decode(produced, true) || 'blub?';
    } catch (e) {
      console.error('[glub] Inference error:', e.message);
      return 'blub... i got confused';
    } finally {
      this._generating = false;
    }
  }

  get isReady() { return this._ready; }
}

// --- SimpleBPE (ported from desk-pet/inference/tokenizer.js) ---
class SimpleBPE {
  constructor(json) {
    this._vocab = json.model?.vocab || json.vocab || {};
    this._merges = (json.model?.merges || json.merges || []).map(m => m.split(' '));
    this._inv = {};
    for (const [k, v] of Object.entries(this._vocab)) this._inv[v] = k;
    this.eosId = json.model?.eos_token_id ?? this._vocab['</s>'];
    this.bosId = json.model?.bos_token_id ?? this._vocab['<s>'];
    this.padId = json.model?.pad_token_id ?? this._vocab['<pad>'];
    this.unkId = json.model?.unk_token_id ?? this._vocab['<unk>'];
  }

  encode(text) {
    let tokens = [...text].map(c => {
      const code = c.charCodeAt(0);
      const key = code === 32 ? '\u0120' : c;
      return this._vocab[key] ?? this.unkId ?? 0;
    });
    for (const [a, b] of this._merges) {
      const aId = this._vocab[a];
      const bId = this._vocab[b];
      const merged = this._vocab[a + b];
      if (aId === undefined || bId === undefined || merged === undefined) continue;
      let i = 0;
      while (i < tokens.length - 1) {
        if (tokens[i] === aId && tokens[i + 1] === bId) {
          tokens.splice(i, 2, merged);
        } else {
          i++;
        }
      }
    }
    return tokens;
  }

  decode(ids, skipSpecials = false) {
    const special = new Set([this.bosId, this.eosId, this.padId, this.unkId].filter(x => x !== undefined));
    let text = '';
    for (const id of ids) {
      if (skipSpecials && special.has(id)) continue;
      const tok = this._inv[id] || '';
      text += tok.startsWith('\u0120') ? ' ' + tok.slice(1) : tok;
    }
    return text.trim();
  }
}
```

- [ ] **Step 2: Test manually**

Run:
```bash
cd L:/Dennis/Projects/glublm/companion
node -e "
import { GlubInference } from './server/inference.js';
const inf = new GlubInference();
await inf.load('../desk-pet/model.onnx', '../desk-pet/tokenizer.json');
console.log(await inf.generate('hello'));
"
```
Expected: a goldfish-style response

- [ ] **Step 3: Commit**

```bash
git add companion/server/inference.js
git commit -m "feat(companion): server-side ONNX inference (ported from desk-pet)"
```

---

### Task 10: Prompt Builder

**Files:**
- Create: `companion/server/prompt-builder.js`
- Create: `companion/server/prompt-builder.test.js`

- [ ] **Step 1: Write failing tests**

```js
// companion/server/prompt-builder.test.js
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { buildPrompt } from './prompt-builder.js';

describe('buildPrompt', () => {
  it('happy state produces clean prompt', () => {
    const prompt = buildPrompt('hello', { hunger: 90, cleanliness: 85, health: 100, bondLevel: 'familiar' });
    assert.equal(prompt, '[mood:happy] hello');
  });

  it('hungry state adds hunger tag', () => {
    const prompt = buildPrompt('hello', { hunger: 20, cleanliness: 85, health: 100, bondLevel: 'familiar' });
    assert.ok(prompt.includes('[mood:hungry]'));
    assert.ok(prompt.includes('hello'));
  });

  it('dirty water adds water tag', () => {
    const prompt = buildPrompt('hi', { hunger: 80, cleanliness: 15, health: 100, bondLevel: 'familiar' });
    assert.ok(prompt.includes('[water:dirty]'));
  });

  it('critical state produces dying tag', () => {
    const prompt = buildPrompt('hi', { hunger: 5, cleanliness: 5, health: 8, bondLevel: 'stranger' });
    assert.ok(prompt.includes('[mood:dying]'));
  });

  it('prompt stays compact (<30 chars prefix)', () => {
    const prompt = buildPrompt('test', { hunger: 10, cleanliness: 10, health: 5, bondLevel: 'bonded' });
    const prefix = prompt.replace('test', '').trim();
    assert.ok(prefix.length < 30, `prefix too long: "${prefix}" (${prefix.length})`);
  });
});
```

- [ ] **Step 2: Run to verify fail**

Run: `cd L:/Dennis/Projects/glublm/companion && node --test server/prompt-builder.test.js`

- [ ] **Step 3: Implement**

```js
// companion/server/prompt-builder.js
import { THRESHOLD_STARVING, THRESHOLD_FILTHY, THRESHOLD_CRITICAL } from '../shared/constants.js';

export function buildPrompt(userText, state) {
  const tags = [];

  // Health-critical overrides everything
  if (state.health < THRESHOLD_CRITICAL) {
    tags.push('[mood:dying]');
  } else {
    // Hunger mood
    if (state.hunger < THRESHOLD_STARVING) tags.push('[mood:starving]');
    else if (state.hunger < 30) tags.push('[mood:hungry]');
    else if (state.hunger < 50) tags.push('[mood:peckish]');
    else tags.push('[mood:happy]');

    // Water quality
    if (state.cleanliness < THRESHOLD_FILTHY) tags.push('[water:dirty]');
    else if (state.cleanliness < 40) tags.push('[water:murky]');
  }

  return tags.join(' ') + ' ' + userText;
}
```

- [ ] **Step 4: Run tests**

Run: `cd L:/Dennis/Projects/glublm/companion && node --test server/prompt-builder.test.js`
Expected: 5 tests passed

- [ ] **Step 5: Commit**

```bash
git add companion/server/prompt-builder.js companion/server/prompt-builder.test.js
git commit -m "feat(companion): compact prompt builder with mood/water tags"
```

---

### Task 11: Phrase Selector

**Files:**
- Create: `companion/server/phrase-selector.js`
- Create: `companion/server/phrase-selector.test.js`

- [ ] **Step 1: Write failing tests**

```js
// companion/server/phrase-selector.test.js
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { PhraseSelector } from './phrase-selector.js';

const PHRASES = [
  { text: 'blub blub', category: 'cheerful' },
  { text: 'so hungry...', category: 'hungry' },
  { text: 'water thick', category: 'uncomfortable' },
  { text: 'who are you', category: 'cautious' },
  { text: 'oh the big shape!', category: 'affectionate' },
  { text: '...', category: 'critical' },
  { text: 'something nice happens now', category: 'routine_hints' },
  { text: 'what was i saying', category: 'forgetful' },
];

describe('PhraseSelector', () => {
  it('picks from all categories when happy', () => {
    const sel = new PhraseSelector(PHRASES);
    const phrase = sel.pick({ hunger: 90, cleanliness: 90, health: 100, bondLevel: 'familiar' });
    assert.ok(phrase);
    assert.ok(phrase.text.length > 0);
  });

  it('favors hungry category when hungry', () => {
    const sel = new PhraseSelector(PHRASES);
    const counts = {};
    for (let i = 0; i < 200; i++) {
      const p = sel.pick({ hunger: 10, cleanliness: 90, health: 80, bondLevel: 'familiar' });
      counts[p.category] = (counts[p.category] || 0) + 1;
    }
    // hungry should be most common
    assert.ok((counts.hungry || 0) > (counts.cheerful || 0), `hungry=${counts.hungry} cheerful=${counts.cheerful}`);
  });

  it('only picks critical phrases when health critical', () => {
    const sel = new PhraseSelector(PHRASES);
    for (let i = 0; i < 50; i++) {
      const p = sel.pick({ hunger: 5, cleanliness: 5, health: 5, bondLevel: 'stranger' });
      assert.ok(['critical', 'existential'].includes(p.category), `Got ${p.category}: "${p.text}"`);
    }
  });

  it('avoids affectionate phrases for strangers', () => {
    const sel = new PhraseSelector(PHRASES);
    for (let i = 0; i < 100; i++) {
      const p = sel.pick({ hunger: 90, cleanliness: 90, health: 100, bondLevel: 'stranger' });
      assert.notEqual(p.category, 'affectionate');
      assert.notEqual(p.category, 'routine_hints');
    }
  });
});
```

- [ ] **Step 2: Run to verify fail**

Run: `cd L:/Dennis/Projects/glublm/companion && node --test server/phrase-selector.test.js`

- [ ] **Step 3: Implement**

```js
// companion/server/phrase-selector.js
import { THRESHOLD_STARVING, THRESHOLD_FILTHY, THRESHOLD_CRITICAL } from '../shared/constants.js';

// Weight multipliers per state -> category
const WEIGHTS = {
  cheerful: { base: 1, hungry: 0.1, dirty: 0.1, critical: 0 },
  philosophical: { base: 1, hungry: 0.3, dirty: 0.5, critical: 0 },
  meta: { base: 1, hungry: 0.5, dirty: 0.2, critical: 0 },
  forgetful: { base: 1, hungry: 1, dirty: 1, critical: 0 },
  existential: { base: 0.5, hungry: 0.8, dirty: 1.5, critical: 1 },
  bored: { base: 0.8, hungry: 0.5, dirty: 0.5, critical: 0 },
  hungry: { base: 0.1, hungry: 3, dirty: 0.5, critical: 0 },
  uncomfortable: { base: 0.1, hungry: 0.5, dirty: 3, critical: 0 },
  affectionate: { base: 0, hungry: 0, dirty: 0, critical: 0, bondMin: 'comfortable' },
  cautious: { base: 0.3, hungry: 0.3, dirty: 0.3, critical: 0, bondMax: 'familiar' },
  critical: { base: 0, hungry: 0, dirty: 0, critical: 3 },
  routine_hints: { base: 0, hungry: 0, dirty: 0, critical: 0, bondMin: 'bonded' },
  notification: { base: 0, hungry: 0, dirty: 0, critical: 0 },
  // Default for unconfigured categories
  _default: { base: 0.5, hungry: 0.5, dirty: 0.5, critical: 0 },
};

const BOND_ORDER = ['stranger', 'familiar', 'comfortable', 'bonded'];

export class PhraseSelector {
  constructor(phrases) {
    this._phrases = phrases;
    this._recent = [];
  }

  pick(state) {
    const condition = this._getCondition(state);
    const bondIdx = BOND_ORDER.indexOf(state.bondLevel);

    const weighted = [];
    for (const phrase of this._phrases) {
      if (this._recent.includes(phrase.text)) continue;

      const cfg = WEIGHTS[phrase.category] || WEIGHTS._default;
      const w = cfg[condition] ?? cfg.base;
      if (w <= 0) continue;

      // Bond gating
      if (cfg.bondMin && bondIdx < BOND_ORDER.indexOf(cfg.bondMin)) continue;
      if (cfg.bondMax && bondIdx > BOND_ORDER.indexOf(cfg.bondMax)) continue;

      weighted.push({ phrase, weight: w });
    }

    if (weighted.length === 0) {
      this._recent = [];
      return this._phrases[Math.floor(Math.random() * this._phrases.length)];
    }

    const total = weighted.reduce((s, w) => s + w.weight, 0);
    let r = Math.random() * total;
    for (const { phrase, weight } of weighted) {
      r -= weight;
      if (r <= 0) {
        this._recent.push(phrase.text);
        if (this._recent.length > 20) this._recent.shift();
        return phrase;
      }
    }
    return weighted[weighted.length - 1].phrase;
  }

  _getCondition(state) {
    if (state.health < THRESHOLD_CRITICAL) return 'critical';
    if (state.hunger < THRESHOLD_STARVING) return 'hungry';
    if (state.cleanliness < THRESHOLD_FILTHY) return 'dirty';
    return 'base';
  }
}
```

- [ ] **Step 4: Run tests**

Run: `cd L:/Dennis/Projects/glublm/companion && node --test server/phrase-selector.test.js`
Expected: 4 tests passed

- [ ] **Step 5: Commit**

```bash
git add companion/server/phrase-selector.js companion/server/phrase-selector.test.js
git commit -m "feat(companion): weighted phrase selector with mood + bond gating"
```

---

### Task 12: Personality System (Bond)

**Files:**
- Create: `companion/server/personality.js`
- Create: `companion/server/personality.test.js`

- [ ] **Step 1: Write failing tests**

```js
// companion/server/personality.test.js
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { Personality } from './personality.js';
import { PetState } from './pet-state.js';

describe('Personality', () => {
  it('increases bond on feed when hungry', () => {
    const pet = new PetState();
    pet.hunger = 30; // hungry
    pet.bond = 50;
    const p = new Personality(pet);
    p.onFeed();
    assert.ok(pet.bond > 50);
  });

  it('caps daily feed bond', () => {
    const pet = new PetState();
    pet.hunger = 10;
    pet.bond = 50;
    const p = new Personality(pet);
    for (let i = 0; i < 10; i++) p.onFeed();
    // Should not exceed +2 per day
    assert.ok(pet.bond <= 52.1, `bond=${pet.bond}`);
  });

  it('increases bond on clean', () => {
    const pet = new PetState();
    pet.cleanliness = 20;
    pet.bond = 50;
    const p = new Personality(pet);
    p.onClean();
    assert.ok(pet.bond > 50);
  });

  it('decreases bond on critical event', () => {
    const pet = new PetState();
    pet.bond = 50;
    const p = new Personality(pet);
    p.onCritical();
    assert.equal(pet.bond, 48);
  });

  it('penalizes neglect daily', () => {
    const pet = new PetState();
    pet.bond = 50;
    pet.hunger = 20; // below 25
    const p = new Personality(pet);
    p.dailyCheck();
    assert.ok(pet.bond < 50);
  });

  it('rewards consistent care daily', () => {
    const pet = new PetState();
    pet.bond = 50;
    pet.hunger = 80;
    pet.cleanliness = 70;
    pet.health = 90;
    const p = new Personality(pet);
    p.dailyCheck();
    assert.ok(pet.bond > 50);
  });
});
```

- [ ] **Step 2: Run to verify fail**

Run: `cd L:/Dennis/Projects/glublm/companion && node --test server/personality.test.js`

- [ ] **Step 3: Implement**

```js
// companion/server/personality.js
import {
  BOND_FEED, BOND_FEED_DAILY_CAP, BOND_CLEAN, BOND_CHAT,
  BOND_DAILY_CARE_BONUS, BOND_NEGLECT_PER_DAY, BOND_CRITICAL_PENALTY,
  BOND_ABSENCE_PER_DAY, BOND_ABSENCE_THRESHOLD_MS,
} from '../shared/constants.js';

export class Personality {
  constructor(petState) {
    this._pet = petState;
  }

  onFeed() {
    if (this._pet.hunger < 50) { // only bond if actually hungry
      this._resetDayIfNeeded();
      if (this._pet.bondFeedToday < BOND_FEED_DAILY_CAP) {
        const add = Math.min(BOND_FEED, BOND_FEED_DAILY_CAP - this._pet.bondFeedToday);
        this._pet.bond += add;
        this._pet.bondFeedToday += add;
      }
    }
  }

  onClean() {
    if (this._pet.cleanliness < 50) {
      this._pet.bond += BOND_CLEAN;
    }
  }

  onChat() {
    this._pet.bond += BOND_CHAT;
  }

  onCritical() {
    this._pet.bond += BOND_CRITICAL_PENALTY;
  }

  dailyCheck() {
    const pet = this._pet;

    // Consistent care bonus
    if (pet.hunger > 50 && pet.cleanliness > 50 && pet.health > 50) {
      pet.bond += BOND_DAILY_CARE_BONUS;
    }

    // Neglect penalty
    if (pet.hunger < 25 || pet.cleanliness < 25) {
      pet.bond += BOND_NEGLECT_PER_DAY;
    }

    // Absence penalty
    if (Date.now() - pet.lastInteraction > BOND_ABSENCE_THRESHOLD_MS) {
      pet.bond += BOND_ABSENCE_PER_DAY;
    }

    // Reset daily feed tracker
    this._pet.bondFeedToday = 0;
    this._pet.bondDayStart = this._dayStart();
  }

  _resetDayIfNeeded() {
    const today = this._dayStart();
    if (this._pet.bondDayStart !== today) {
      this._pet.bondFeedToday = 0;
      this._pet.bondDayStart = today;
    }
  }

  _dayStart() {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d.getTime();
  }
}
```

- [ ] **Step 4: Run tests**

Run: `cd L:/Dennis/Projects/glublm/companion && node --test server/personality.test.js`
Expected: 6 tests passed

- [ ] **Step 5: Commit**

```bash
git add companion/server/personality.js companion/server/personality.test.js
git commit -m "feat(companion): personality system - bond tracking with daily cap + decay"
```

---

### Task 13: Generate New Idle Phrases

**Files:**
- Create: `companion/data/idle-phrases.json`

- [ ] **Step 1: Copy existing phrases as base**

```bash
cp L:/Dennis/Projects/glublm/desk-pet/data/idle-phrases.json L:/Dennis/Projects/glublm/companion/data/idle-phrases.json
```

- [ ] **Step 2: Generate ~200 new phrases across 6 new categories**

Use a Claude sub-agent (opus) to generate phrases matching the GlubLM voice. Each category needs ~30-35 phrases. Categories: `hungry`, `uncomfortable`, `affectionate`, `cautious`, `critical`, `routine_hints`.

Guidelines for the sub-agent:
- Match the existing tone: lowercase, no punctuation except `...` and `?`, short sentences
- Goldfish perspective: no human concepts, only water/bowl/glass/bubbles/flakes/light/shapes
- Forgetting is core: phrases should imply memory loss naturally
- Critical phrases: very short (1-5 words), trailing off
- Affectionate phrases: refer to owner as "the big shape" or "the warm presence"
- Routine hints: suggest unconscious pattern recognition without explicit memory

Merge generated phrases into `companion/data/idle-phrases.json` alongside the existing 530.

- [ ] **Step 3: Validate JSON**

Run: `node -e "const d=JSON.parse(require('fs').readFileSync('companion/data/idle-phrases.json','utf-8')); console.log(d.phrases?.length || d.length, 'phrases')"`
Expected: ~730 phrases

- [ ] **Step 4: Commit**

```bash
git add companion/data/idle-phrases.json
git commit -m "feat(companion): extended idle phrases - 730 total, 6 new mood categories"
```

---

## Phase 3: Aquarium Viewer

### Task 14: Aquarium WebSocket Client + Engine Bootstrap

**Files:**
- Create: `companion/aquarium/app.js`
- Modify: `companion/aquarium/index.html`

- [ ] **Step 1: Write aquarium HTML**

```html
<!-- companion/aquarium/index.html -->
<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>Glub Aquarium</title>
  <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no" />
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    html, body { width: 100%; height: 100%; overflow: hidden; background: #0a1628; }
    #bowl { display: block; width: 100%; height: 100%; image-rendering: pixelated; image-rendering: crisp-edges; touch-action: none; }
  </style>
</head>
<body>
  <canvas id="bowl"></canvas>
  <script type="module" src="app.js"></script>
</body>
</html>
```

- [ ] **Step 2: Write aquarium app.js**

```js
// companion/aquarium/app.js
// Imports from desk-pet engine (served via /engine/ route)
import { CanvasManager } from '/engine/canvas.js';
import { Bowl } from '/engine/bowl.js';
import { BubbleSystem, SplashSystem } from '/engine/bubbles.js';
import { DissolveSystem } from '/engine/dissolve.js';
import { SpriteEngine } from '/engine/sprites.js';
import { FishMovement } from '/engine/movement.js';
import { FishStateMachine, STATES } from '/engine/state-machine.js';
import { SpeechBubble } from '/engine/speech.js';

let canvas, bowl, bubbles, splash, sprites, movement, fsm, speech, dissolve;
let ws = null;
let waterQuality = 1.0; // 0-1, affects water overlay

function connectWs() {
  const url = `ws://${location.host}`;
  ws = new WebSocket(url);

  ws.onmessage = (e) => {
    const msg = JSON.parse(e.data);
    handleMessage(msg);
  };

  ws.onclose = () => {
    setTimeout(connectWs, 3000); // reconnect
  };

  ws.onerror = () => ws.close();
}

function handleMessage(msg) {
  switch (msg.type) {
    case 'full_state':
      waterQuality = (msg.cleanliness || 100) / 100;
      if (msg.isBellyUp) fsm.transition(STATES.SAD, { duration: Infinity, priority: 0 });
      break;
    case 'needs_update':
      waterQuality = (msg.cleanliness || 100) / 100;
      if (msg.isBellyUp && fsm.currentState !== STATES.SAD) {
        fsm.transition(STATES.SAD, { duration: Infinity, priority: 0 });
      } else if (!msg.isBellyUp && fsm.currentState === STATES.SAD) {
        fsm.transition(STATES.HAPPY, { duration: 3, priority: 3 });
      }
      break;
    case 'speech':
      speech.show(msg.text, { type: msg.speaker === 'user' ? 'user' : 'fish' });
      if (msg.speaker === 'fish') {
        fsm.transition(STATES.TALKING, { duration: Math.max(3, msg.text.length * 0.1), priority: 2 });
      }
      break;
    case 'animation':
      fsm.transition(msg.state, { duration: msg.duration || 2, priority: 3 });
      break;
    case 'feed':
      fsm.transition(STATES.EATING, { duration: 2, priority: 3 });
      // Food flakes handled by food-animation.js (Task 17)
      break;
    case 'water_quality':
      waterQuality = msg.level;
      break;
    case 'water_change':
      waterQuality = 1.0;
      break;
    case 'play':
      fsm.transition(STATES.EXCITED, { duration: 2, priority: 3 });
      splash.burst(movement.x, movement.y, 12);
      break;
    case 'belly_up':
      if (msg.active) fsm.transition(STATES.SAD, { duration: Infinity, priority: 0 });
      else fsm.transition(STATES.HAPPY, { duration: 3, priority: 3 });
      break;
  }
}

function sendCmd(type, data = {}) {
  if (ws && ws.readyState === 1) ws.send(JSON.stringify({ type, ...data }));
}

function getFishSize() {
  return Math.max(14, Math.min(24, Math.round(canvas.width * 0.1)));
}

function render(dt) {
  sprites.update(dt);
  fsm.update(dt);
  bubbles.update(dt);
  splash.update(dt);
  speech.update(dt);
  dissolve.update(dt);
  movement.update(dt);

  // Render to pixel buffer
  bowl.render(canvas.ctx, dt);
  bubbles.render(canvas.ctx);

  // Water quality overlay (dirty water tinting)
  if (waterQuality < 0.8) {
    const alpha = (1 - waterQuality) * 0.4; // max 0.4 opacity when fully dirty
    canvas.ctx.save();
    canvas.ctx.globalAlpha = alpha;
    canvas.ctx.fillStyle = waterQuality < 0.3 ? '#2a3a10' : '#1a2a18';
    canvas.ctx.fillRect(0, 0, canvas.width, canvas.height);
    canvas.ctx.restore();
  }

  const fs = getFishSize();
  sprites.render(canvas.ctx, movement.x, movement.y, fs, !movement.facingRight, movement.getEyeLook());
  splash.render(canvas.ctx);

  canvas.present();

  const fishScreen = canvas.internalToScreen(movement.x, movement.y);
  speech.render(canvas.screenCtx, fishScreen.x, fishScreen.y, canvas.screenWidth, canvas.screenHeight);

  if (dissolve.hasParticles) dissolve.render(canvas.screenCtx);
}

function setupInput() {
  canvas.el.addEventListener('pointerup', (e) => {
    const pos = canvas.screenToInternal(e.clientX, e.clientY);
    const fs = getFishSize();
    const hitFish = Math.abs(pos.x - movement.x) < fs * 0.6 && Math.abs(pos.y - movement.y) < fs * 0.6;
    if (hitFish) {
      sendCmd('cmd_click_fish');
      splash.burst(movement.x, movement.y, 8);
    } else if (bowl.isInSwimBounds(pos.x, pos.y)) {
      splash.burst(pos.x, pos.y, 4);
    }
  });

  canvas.el.addEventListener('pointermove', (e) => {
    const pos = canvas.screenToInternal(e.clientX, e.clientY);
    movement.setCursor(pos.x, pos.y);
  });

  canvas.el.addEventListener('pointerleave', () => movement.setCursor(null, null));
  canvas.el.addEventListener('contextmenu', (e) => e.preventDefault());
}

function init() {
  const canvasEl = document.getElementById('bowl');
  canvas = new CanvasManager(canvasEl);
  bowl = new Bowl(canvas);
  bubbles = new BubbleSystem(bowl);
  splash = new SplashSystem();
  sprites = new SpriteEngine();
  movement = new FishMovement(bowl);
  fsm = new FishStateMachine(sprites, movement);
  speech = new SpeechBubble();
  dissolve = new DissolveSystem();

  speech.onFadeOutStart((rect) => {
    if (rect) dissolve.burst(rect.cx, rect.cy, rect.w, rect.h, 18);
  });

  setupInput();
  canvas.startLoop(render);
  connectWs();

  setTimeout(() => {
    speech.show('glub!', { type: 'fish', duration: 3 });
    fsm.transition(STATES.HAPPY, { duration: 2, priority: 2 });
  }, 600);
}

document.addEventListener('DOMContentLoaded', init);
```

- [ ] **Step 3: Test in browser**

Run: `cd L:/Dennis/Projects/glublm/companion && node server/index.js`
Open: http://localhost:3210/aquarium/
Expected: fish rendering in bowl, speech bubble "glub!", WebSocket connected

- [ ] **Step 4: Commit**

```bash
git add companion/aquarium/
git commit -m "feat(companion): aquarium viewer - engine bootstrap + WebSocket client"
```

---

### Task 15-19: Aquarium Visual Enhancements

Tasks 15-19 add the new visual elements to the aquarium viewer:

- **Task 15**: Poop sprites (`companion/aquarium/poop-sprites.js`) - brown dots on gravel, spawn/remove on WS messages
- **Task 16**: Dirty water overlay refinement (`companion/aquarium/water-overlay.js`) - progressive tinting with algae at <20%
- **Task 17**: Food flakes animation (`companion/aquarium/food-animation.js`) - particle system for falling flakes on feed
- **Task 18**: Belly-up state - fish rotation + float-to-surface + recovery animation (modify `sprites.js` render call in `app.js`)
- **Task 19**: Bond behavior - fish wiggles on WS connect (high bond), retreats to castle (low bond)

Each follows the same pattern: create module, import in `app.js`, handle relevant WS message, render in the loop. These are visual-only tasks best tested by running the server and observing in browser.

> **Note for executor**: These tasks are intentionally kept as summaries here because they are client-side rendering code best implemented by looking at the existing desk-pet patterns (bubbles.js, dissolve.js) and adapting. Each task is one file + integration into app.js. Commit after each.

---

## Phase 4: Controller UI

### Task 20: Controller HTML + CSS

**Files:**
- Create: `companion/controller/index.html`
- Create: `companion/controller/style.css`

- [ ] **Step 1: Write controller HTML**

```html
<!-- companion/controller/index.html -->
<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>Glub Controller</title>
  <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no" />
  <link rel="stylesheet" href="style.css" />
</head>
<body>
  <div id="app">
    <header id="header">
      <span id="fish-name">glub</span>
      <span id="status-indicator">connecting...</span>
    </header>

    <div id="quote-box">
      <p id="fish-quote">...</p>
    </div>

    <div id="stats">
      <div class="stat-row">
        <span class="stat-label">hunger</span>
        <div class="stat-bar"><div id="bar-hunger" class="stat-fill"></div></div>
        <span id="val-hunger" class="stat-val">-</span>
      </div>
      <div class="stat-row">
        <span class="stat-label">water</span>
        <div class="stat-bar"><div id="bar-water" class="stat-fill"></div></div>
        <span id="val-water" class="stat-val">-</span>
      </div>
      <div class="stat-row">
        <span class="stat-label">happiness</span>
        <div class="stat-bar"><div id="bar-happy" class="stat-fill"></div></div>
        <span id="val-happy" class="stat-val">-</span>
      </div>
      <div class="stat-row">
        <span class="stat-label">bond</span>
        <div class="stat-bar"><div id="bar-bond" class="stat-fill bond"></div></div>
        <span id="val-bond" class="stat-val">-</span>
      </div>
    </div>

    <div id="actions"></div>

    <div id="chat-input">
      <input id="prompt" type="text" placeholder="say something to the goldfish..." autocomplete="off" />
      <button id="send" type="button">&gt;</button>
    </div>
  </div>

  <script type="module" src="app.js"></script>
</body>
</html>
```

- [ ] **Step 2: Write controller CSS (GBA theme)**

Full GBA-themed CSS matching the mockup from brainstorming. Status bars with striped fill, dynamic coloring (green/orange/red), quote box with mood border, action buttons with urgency sizing. File: `companion/controller/style.css` (use the same palette as desk-pet: `#0c1e30` background, `#c0e4f4` text, `#ff8b3d` accent, `#4a9abe` borders, `"Courier New"` font).

- [ ] **Step 3: Commit**

```bash
git add companion/controller/index.html companion/controller/style.css
git commit -m "feat(companion): controller HTML + GBA-themed CSS"
```

---

### Task 21: Controller App (WebSocket + State Rendering)

**Files:**
- Create: `companion/controller/app.js`

- [ ] **Step 1: Implement controller app**

The controller app connects via WebSocket, receives state updates, and renders:
- Status bars (update width + color based on value)
- Quote box (latest fish speech)
- Action buttons (dynamic layout based on urgency)
- Chat input (sends `cmd_chat` on Enter/click)
- Feed/clean/play/water buttons (send respective commands)

Key logic: action buttons re-sort based on needs. When hunger < 30, "feed" becomes full-width orange. When cleanliness < 30, "clean" rises to top. Multiple urgents stack by severity.

```js
// companion/controller/app.js
let ws = null;
let state = { hunger: 100, cleanliness: 100, happiness: 100, health: 100, bond: 10 };

function connectWs() {
  ws = new WebSocket(`ws://${location.host}`);
  ws.onopen = () => updateStatus('connected');
  ws.onmessage = (e) => handleMessage(JSON.parse(e.data));
  ws.onclose = () => { updateStatus('reconnecting...'); setTimeout(connectWs, 3000); };
  ws.onerror = () => ws.close();
}

function sendCmd(type, data = {}) {
  if (ws?.readyState === 1) ws.send(JSON.stringify({ type, ...data }));
}

function handleMessage(msg) {
  switch (msg.type) {
    case 'full_state':
    case 'needs_update':
      Object.assign(state, msg);
      renderStats();
      renderActions();
      break;
    case 'speech':
      if (msg.speaker === 'fish') renderQuote(msg.text, msg.mood);
      break;
  }
}

function renderStats() {
  setBar('hunger', state.hunger);
  setBar('water', state.cleanliness);
  setBar('happy', state.happiness);
  setBar('bond', state.bond);

  const dayText = state.ageDays !== undefined ? `day ${state.ageDays}` : '';
  const indicator = document.getElementById('status-indicator');
  if (state.isBellyUp) indicator.textContent = 'CRITICAL';
  else if (state.hunger < 30 || state.cleanliness < 30) indicator.textContent = 'needs attention';
  else indicator.textContent = dayText;
}

function setBar(id, value) {
  const fill = document.getElementById(`bar-${id}`);
  const val = document.getElementById(`val-${id}`);
  if (!fill || !val) return;
  fill.style.width = Math.max(2, value) + '%';
  val.textContent = Math.round(value) + '%';

  // Color by value
  fill.classList.remove('green', 'orange', 'red');
  if (id === 'bond') return; // bond keeps its own color
  if (value > 60) fill.classList.add('green');
  else if (value > 30) fill.classList.add('orange');
  else fill.classList.add('red');
}

function renderQuote(text, mood) {
  const box = document.getElementById('quote-box');
  const quote = document.getElementById('fish-quote');
  quote.textContent = `"${text}"`;
  box.className = mood === 'critical' ? 'mood-critical' : (mood === 'hungry' || mood === 'uncomfortable') ? 'mood-warn' : '';
}

function renderActions() {
  const container = document.getElementById('actions');
  const actions = [
    { id: 'feed', label: 'feed', urgency: state.hunger < 30 ? (state.hunger < 15 ? 2 : 1) : 0 },
    { id: 'clean', label: 'clean water', urgency: state.cleanliness < 30 ? (state.cleanliness < 20 ? 2 : 1) : 0 },
    { id: 'play', label: 'play', urgency: 0 },
    { id: 'poop', label: 'clean poop', urgency: (state.poops?.length || 0) > 2 ? 1 : 0 },
  ];

  actions.sort((a, b) => b.urgency - a.urgency);

  container.innerHTML = '';
  for (const action of actions) {
    const btn = document.createElement('button');
    btn.textContent = action.urgency >= 2 ? `${action.label}!` : action.label;
    btn.className = `action-btn ${action.urgency >= 2 ? 'urgent' : action.urgency >= 1 ? 'warn' : 'calm'}`;
    btn.addEventListener('click', () => {
      if (action.id === 'feed') sendCmd('cmd_feed');
      else if (action.id === 'clean') sendCmd('cmd_change_water');
      else if (action.id === 'play') sendCmd('cmd_play');
      else if (action.id === 'poop') {
        const first = state.poops?.[0];
        if (first) sendCmd('cmd_clean_poop', { id: first.id });
      }
    });
    container.appendChild(btn);
  }
}

function updateStatus(text) {
  document.getElementById('status-indicator').textContent = text;
}

// Chat
function setupChat() {
  const prompt = document.getElementById('prompt');
  const send = document.getElementById('send');
  const submit = () => {
    const text = prompt.value.trim();
    if (!text) return;
    sendCmd('cmd_chat', { text });
    prompt.value = '';
  };
  send.addEventListener('click', submit);
  prompt.addEventListener('keydown', (e) => { if (e.key === 'Enter') submit(); });
}

document.addEventListener('DOMContentLoaded', () => {
  setupChat();
  connectWs();
});
```

- [ ] **Step 2: Test in browser**

Run: `cd L:/Dennis/Projects/glublm/companion && node server/index.js`
Open: http://localhost:3210/controller/
Expected: status bars visible, action buttons, chat working

- [ ] **Step 3: Commit**

```bash
git add companion/controller/app.js
git commit -m "feat(companion): controller app - stats, dynamic actions, chat"
```

---

### Task 22-24: Controller Polish

- **Task 22**: Status bar animations (smooth transitions on value change, pulsing border when critical)
- **Task 23**: Mini bowl preview for tablet/desktop viewports (simplified Canvas renderer)
- **Task 24**: Fish name display from state, age counter, responsive layout fixes

---

### Task 25: Full-Stack Integration Test

- [ ] **Step 1: Start server**

Run: `cd L:/Dennis/Projects/glublm/companion && node server/index.js`

- [ ] **Step 2: Open aquarium and controller in separate windows**

Aquarium: http://localhost:3210/aquarium/
Controller: http://localhost:3210/controller/

- [ ] **Step 3: Verify end-to-end flow**

1. Click "feed" in controller -> fish plays eating animation in aquarium, hunger bar rises
2. Wait 5 seconds -> verify needs tick down slightly in controller
3. Type a message in controller chat -> user bubble appears in aquarium -> fish response appears in both
4. Click "play" -> fish does excited animation + splash in aquarium
5. Click "clean water" -> water quality resets in aquarium
6. Refresh both pages -> state persists (hunger/cleanliness at previous values)
7. Stop server, restart -> state loaded from disk, same values

- [ ] **Step 4: Final commit**

```bash
git add -A companion/
git commit -m "feat(companion): phase 4 complete - controller + full-stack integration"
```

---

## Post-Implementation

After all 4 phases:

1. **Wire AI inference** into server `CMD_CHAT` handler (replace the placeholder `blub?` response with real ONNX inference via `GlubInference` + `buildPrompt`)
2. **Wire phrase selector** into the server tick loop (replace random idle timing with `PhraseSelector.pick()` using current pet state)
3. **Wire personality** into action handlers (call `personality.onFeed()`, `personality.onClean()`, etc.)
4. **Add daily bond check** to server (run `personality.dailyCheck()` once per day at midnight)
5. **Update memory file** `personal_glublm.md` with companion status
6. **Push to GitHub**

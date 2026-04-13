// companion/server/needs-engine.js
import {
  HUNGER_DECAY_PER_HOUR, CLEANLINESS_DECAY_PER_HOUR,
  POOP_DECAY_MODIFIER_PER_HOUR, DIRTY_WATER_HUNGER_MULTIPLIER,
  DIRTY_WATER_THRESHOLD, HEALTH_RECOVERY_PER_HOUR,
  HEALTH_DAMAGE_PER_HOUR, HEALTH_CRITICAL_DAMAGE_PER_HOUR,
  HEALTH_RECOVERY_HUNGER_MIN, HEALTH_RECOVERY_CLEAN_MIN,
  HEALTH_DAMAGE_HUNGER_MAX, HEALTH_DAMAGE_CLEAN_MAX,
  INTERACTION_BONUS_DECAY_PER_HOUR, THRESHOLD_CRITICAL,
  THRESHOLD_BELLY_UP_RECOVERY,
  FEED_AMOUNT, FEED_COOLDOWN_MS, FEED_OVERCOUNT,
  FEED_OVERWINDOW_MS, FEED_BLOAT_HAPPINESS_PENALTY,
  WATER_CHANGE_COOLDOWN_MS, PLAY_BONUS, PLAY_COOLDOWN_MS,
  POOP_DELAY_MIN_MS, POOP_DELAY_MAX_MS,
  FEED_BLOAT_RECOVERY_MS,
} from '../shared/constants.js';

export class NeedsEngine {
  constructor(petState) {
    this._pet = petState;
    this._listeners = {};
  }

  on(event, fn) {
    (this._listeners[event] ||= []).push(fn);
  }

  off(event, fn) {
    const arr = this._listeners[event];
    if (arr) this._listeners[event] = arr.filter(f => f !== fn);
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
    if (pet.isBellyUp && pet.health >= THRESHOLD_BELLY_UP_RECOVERY) {
      pet.isBellyUp = false;
      this._emit('recovery', {});
    }

    // --- Bloat recovery ---
    if (pet.isBloated && Date.now() - pet.bloatedAt >= FEED_BLOAT_RECOVERY_MS) {
      pet.isBloated = false;
      this._emit('bloat', { active: false });
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
    const id = `p${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`;
    const x = 0.2 + Math.random() * 0.6;
    const y = 0.82 + Math.random() * 0.06;
    const poop = { id, x, y, createdAt: Date.now() };
    this._pet.poops.push(poop);
    this._emit('poop_add', poop);
  }

  // --- Actions ---

  feed() {
    const pet = this._pet;
    const now = Date.now();

    // Reset feed window if expired
    if (now - pet.feedWindowStart > FEED_OVERWINDOW_MS) {
      pet.feedCountInWindow = 0;
      pet.feedWindowStart = now;
    }

    // Cooldown only kicks in after 3 feeds (allow rapid feeding to rescue starving fish)
    if (pet.feedCountInWindow >= FEED_OVERCOUNT && now - pet.lastFeedTime < FEED_COOLDOWN_MS) {
      return { ok: false, reason: 'cooldown' };
    }

    pet.feedCountInWindow++;

    let bloated = false;
    if (pet.feedCountInWindow > FEED_OVERCOUNT && !pet.isBloated) {
      pet.isBloated = true;
      pet.bloatedAt = now;
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
}

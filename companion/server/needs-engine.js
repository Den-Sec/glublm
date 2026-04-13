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
}

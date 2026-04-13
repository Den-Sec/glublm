// companion/server/pet-state.js
import {
  HAPPY_WEIGHT_HUNGER, HAPPY_WEIGHT_CLEAN,
  HAPPY_WEIGHT_INTERACT, HAPPY_WEIGHT_HEALTH,
} from '../shared/constants.js';

function clamp(v) { return Math.max(0, Math.min(100, v)); }

export class PetState {
  constructor() {
    this._hunger = 100;
    this._cleanliness = 100;
    this._health = 100;
    this._bond = 10;
    this._interactionBonus = 0;
    this.poops = [];
    this.isBloated = false;
    this.bloatedAt = 0;
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

  get interactionBonus() { return this._interactionBonus; }
  set interactionBonus(v) { this._interactionBonus = clamp(v); }

  get happiness() {
    return clamp(
      this._hunger * HAPPY_WEIGHT_HUNGER +
      this._cleanliness * HAPPY_WEIGHT_CLEAN +
      this._interactionBonus * HAPPY_WEIGHT_INTERACT +
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
      interactionBonus: this._interactionBonus,
      poops: this.poops,
      isBloated: this.isBloated,
      bloatedAt: this.bloatedAt,
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
      else if (key === 'interactionBonus') pet._interactionBonus = clamp(data.interactionBonus);
      else if (Object.hasOwn(pet, key)) pet[key] = data[key];
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

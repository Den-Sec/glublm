// companion/server/pet-state.js
import {
  HAPPY_WEIGHT_HUNGER, HAPPY_WEIGHT_CLEAN,
  HAPPY_WEIGHT_INTERACT, HAPPY_WEIGHT_HEALTH,
} from '../shared/constants.js';

function clamp(v) { return Math.max(0, Math.min(100, v)); }

function utcDateStr(ts = Date.now()) {
  const d = new Date(ts);
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
}

function utcDaysBetween(a, b) {
  const parse = (s) => {
    const [y, m, d] = s.split('-').map(Number);
    return Date.UTC(y, m - 1, d);
  };
  return Math.round((parse(b) - parse(a)) / 86_400_000);
}

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
    // Cluster B.3: cross-session retention (bowl memory + rituals)
    this.last_chat_at = 0;
    this.last_excited_at = 0;
    this.last_seen_at = 0;
    this.total_chats = 0;
    this.total_excited = 0;
    this.streak_days = 0;
    this.last_interaction_day_utc = null;
    this.last_dawn_greeting = null;
    this.last_sunset_greeting = null;
    this._reactivationFired = false;     // process-only, not persisted
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

  get minsSinceInteraction() {
    return Math.floor((Date.now() - this.lastInteraction) / 60000);
  }

  _dayStart() {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d.getTime();
  }

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
      // gapDays < 1 (clock skew backwards) -> leave streak unchanged
    }
    this.last_interaction_day_utc = today;

    if (type === 'chat') { this.last_chat_at    = now; this.total_chats   += 1; }
    if (type === 'feed') { this.lastFeedTime    = now; }
    if (type === 'play') {
      this.last_excited_at = now;
      this.total_excited  += 1;
      this.lastPlayTime    = now;
    }
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
      last_chat_at: this.last_chat_at,
      last_excited_at: this.last_excited_at,
      last_seen_at: this.last_seen_at,
      total_chats: this.total_chats,
      total_excited: this.total_excited,
      streak_days: this.streak_days,
      last_interaction_day_utc: this.last_interaction_day_utc,
      last_dawn_greeting: this.last_dawn_greeting,
      last_sunset_greeting: this.last_sunset_greeting,
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
      else if (key === '_reactivationFired') continue; // process-only, never restore
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
      minsSinceInteraction: this.minsSinceInteraction,
    };
  }
}

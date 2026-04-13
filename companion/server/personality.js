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

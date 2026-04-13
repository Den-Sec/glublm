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

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

/**
 * Persisted mood-state for the Desk Pet across sessions.
 * Stores timestamps, counters, streak in a single localStorage JSON key.
 * mood_score is computed on-demand (stateless, recency-based).
 */

const STORAGE_KEY = 'glub_bowl_memory';
const SAVE_DEBOUNCE_MS = 500;

const DEFAULT_STATE = {
  version: 1,
  last_feed_at: 0,
  last_chat_at: 0,
  last_excited_at: 0,
  last_seen_at: 0,
  total_feeds: 0,
  total_chats: 0,
  total_excited: 0,
  streak_days: 0,
  last_interaction_day_utc: null,
};

function utcDateStr(ts = Date.now()) {
  const d = new Date(ts);
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function utcDaysBetween(a, b) {
  const ta = Date.UTC(...a.split('-').map((v, i) => i === 1 ? Number(v) - 1 : Number(v)));
  const tb = Date.UTC(...b.split('-').map((v, i) => i === 1 ? Number(v) - 1 : Number(v)));
  return Math.round((tb - ta) / 86_400_000);
}

export const SHORT_REACTIVATIONS = [
  'oh, you again!',
  "wait, weren't you just here?",
  'back already? hi!',
];
export const MED_REACTIVATIONS = [
  'where did the light go and come back?',
  'did the bowl get bigger or did i shrink?',
  'you came back. or maybe you never left and i forgot.',
];
export const LONG_REACTIVATIONS = [
  "i think i missed you. i'm not sure what missing means.",
  'the water moved a lot of times without you.',
  "hello again. i don't remember when you went but i'm glad you came.",
];

function pickFrom(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

export class MoodMemory {
  constructor({ now = () => Date.now(), today = () => utcDateStr() } = {}) {
    this._now = now;
    this._today = today;
    this._s = { ...DEFAULT_STATE };
    this._reactivationFired = false;
    this._saveTimer = null;
    this._warned = false;
  }

  load() {
    try {
      const raw = globalThis.localStorage?.getItem(STORAGE_KEY);
      if (!raw) { this._s = { ...DEFAULT_STATE }; return; }
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === 'object' && parsed.version === 1) {
        this._s = { ...DEFAULT_STATE, ...parsed };
      } else {
        this._s = { ...DEFAULT_STATE };
        this.save({ flush: true });
      }
    } catch (e) {
      if (!this._warned) { console.warn('bowl-memory: malformed localStorage, reset to defaults', e); this._warned = true; }
      this._s = { ...DEFAULT_STATE };
      this.save({ flush: true });
    }
  }

  save({ flush = false } = {}) {
    if (flush) {
      if (this._saveTimer) { clearTimeout(this._saveTimer); this._saveTimer = null; }
      this._writeNow();
      return;
    }
    this._scheduleSave();
  }

  _scheduleSave() {
    if (this._saveTimer) clearTimeout(this._saveTimer);
    this._saveTimer = setTimeout(() => { this._saveTimer = null; this._writeNow(); }, SAVE_DEBOUNCE_MS);
  }

  _writeNow() {
    try {
      globalThis.localStorage?.setItem(STORAGE_KEY, JSON.stringify(this._s));
    } catch (e) {
      if (!this._warned) { console.warn('bowl-memory: localStorage unavailable, in-memory only', e); this._warned = true; }
    }
  }

  recordSeen({ now } = {}) {
    this._s.last_seen_at = now ?? this._now();
    this._scheduleSave();
  }

  get state() { return { ...this._s, mood_score: this.getMoodScore() }; }

  getMoodScore() {
    const mostRecent = Math.max(
      this._s.last_chat_at || 0,
      this._s.last_feed_at || 0,
      this._s.last_excited_at || 0,
    );
    if (mostRecent === 0) return 0;
    const ageH = (this._now() - mostRecent) / 3_600_000;
    if (ageH < 2)  return 3;
    if (ageH < 8)  return 2;
    if (ageH < 24) return 1;
    return 0;
  }

  recordEvent(type) {
    if (type !== 'chat' && type !== 'feed' && type !== 'excited') {
      throw new Error(`Unknown event type: ${type}`);
    }
    const now = this._now();
    const today = this._today();
    const last = this._s.last_interaction_day_utc;

    if (!last) {
      this._s.streak_days = 1;
    } else if (last !== today) {
      const gapDays = utcDaysBetween(last, today);
      if (gapDays >= 1 && gapDays <= 2) this._s.streak_days += 1;
      else if (gapDays > 2)             this._s.streak_days = 1;
      // gapDays < 1 (clock skew backwards) -> leave streak unchanged
    }
    this._s.last_interaction_day_utc = today;

    if (type === 'chat')    { this._s.last_chat_at    = now; this._s.total_chats   += 1; }
    if (type === 'feed')    { this._s.last_feed_at    = now; this._s.total_feeds   += 1; }
    if (type === 'excited') { this._s.last_excited_at = now; this._s.total_excited += 1; }

    this._scheduleSave();
  }

  getReactivation() {
    if (this._reactivationFired) return null;
    const seen = this._s.last_seen_at;
    if (!seen) return null;
    const gapMs = this._now() - seen;
    if (gapMs < 30 * 60_000) return null;
    const gapH = gapMs / 3_600_000;
    this._reactivationFired = true;
    if (gapH < 2)      return { variant: 'short', text: pickFrom(SHORT_REACTIVATIONS) };
    else if (gapH < 8) return { variant: 'med',   text: pickFrom(MED_REACTIVATIONS) };
    else               return { variant: 'long',  text: pickFrom(LONG_REACTIVATIONS) };
  }

  reset() {
    this._s = { ...DEFAULT_STATE };
    this._reactivationFired = false;
    try { globalThis.localStorage?.removeItem(STORAGE_KEY); } catch {}
  }

  get isReactivationFired() { return this._reactivationFired; }
}

export const bowlMemory = new MoodMemory();

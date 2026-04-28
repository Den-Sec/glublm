/**
 * Daily ritual scheduler - one-shot dawn (6-7am) and sunset (18-20) greetings.
 * Polls hour every 30s in the render loop. Persists last-fire UTC date per ritual.
 */

const FLAG_DAWN = 'glub_last_dawn_greeting';
const FLAG_SUNSET = 'glub_last_sunset_greeting';
const POLL_INTERVAL_S = 30;

export const DAWN_PHRASES = [
  'good morning! the light came back!',
  "oh hi sun! you're warm today.",
  'another day. another perfect day.',
];
export const SUNSET_PHRASES = [
  'the light is going away again. weird.',
  'everything is getting orange. nice.',
  'i think the sky is sleepy. me too. soon.',
];

function pickFrom(arr) { return arr[Math.floor(Math.random() * arr.length)]; }

function utcDateStr(ts = Date.now()) {
  const d = new Date(ts);
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export class RitualScheduler {
  constructor({
    now = () => Date.now(),
    getHours = () => new Date().getHours(),
    today = () => utcDateStr(),
  } = {}) {
    this._now = now;
    this._getHours = getHours;
    this._today = today;
    this._checkTimer = 0;
    this._inMemFlags = {};
    this._speech = null;
    this._fsm = null;
    this._STATES = null;
  }

  setDeps({ speech, fsm, STATES }) {
    this._speech = speech;
    this._fsm = fsm;
    this._STATES = STATES;
  }

  update(dt) {
    this._checkTimer += dt;
    if (this._checkTimer < POLL_INTERVAL_S) return;
    this._checkTimer = 0;

    if (!this._speech || !this._fsm || !this._STATES) return;
    if (this._fsm.currentState === this._STATES.SLEEPING) return;
    if (this._speech.isVisible) return;

    const hour = this._getHours();
    const today = this._today();

    // Dawn / sunset logic added in Tasks 8 + 9
  }

  reset() {
    this._inMemFlags = {};
    try {
      globalThis.localStorage?.removeItem(FLAG_DAWN);
      globalThis.localStorage?.removeItem(FLAG_SUNSET);
    } catch {}
  }

  _readFlag(key) {
    try { return globalThis.localStorage?.getItem(key) ?? this._inMemFlags[key] ?? null; }
    catch { return this._inMemFlags[key] ?? null; }
  }

  _writeFlag(key, val) {
    this._inMemFlags[key] = val;
    try { globalThis.localStorage?.setItem(key, val); } catch {}
  }
}

export const rituals = new RitualScheduler();

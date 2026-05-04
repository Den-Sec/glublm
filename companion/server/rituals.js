// companion/server/rituals.js
/**
 * Daily ritual scheduler - one-shot dawn (6-7am) and sunset (18-20) greetings.
 * Polls hour every 30s in the existing tick loop. Persists last-fire UTC date
 * on the pet object (via pet-state.json save cycle).
 */

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
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
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
    this._ws = null;
    this._pet = null;
  }

  setDeps({ ws, pet }) {
    this._ws = ws;
    this._pet = pet;
  }

  update(dt) {
    this._checkTimer += dt;
    if (this._checkTimer < POLL_INTERVAL_S) return;
    this._checkTimer = 0;

    if (!this._ws || !this._pet) return;
    if (this._pet.isBellyUp) return;

    const hour = this._getHours();
    const today = this._today();

    if (hour >= 6 && hour < 7) {
      if (this._pet.last_dawn_greeting !== today) {
        this._pet.last_dawn_greeting = today;
        this._ws.broadcast('animation', { state: 'happy', duration: 2 });
        const phrase = pickFrom(DAWN_PHRASES);
        setTimeout(() => this._ws.broadcast('speech', { text: phrase, speaker: 'fish', duration: 3 }), 500);
      }
    }

    if (hour >= 18 && hour < 20) {
      if (this._pet.last_sunset_greeting !== today) {
        this._pet.last_sunset_greeting = today;
        this._ws.broadcast('animation', { state: 'bubble_blow', duration: 2.5 });
        const phrase = pickFrom(SUNSET_PHRASES);
        setTimeout(() => this._ws.broadcast('speech', { text: phrase, speaker: 'fish', duration: 3 }), 500);
      }
    }
  }
}

export const rituals = new RitualScheduler();

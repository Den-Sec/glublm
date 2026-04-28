/**
 * Idle phrase scheduler - picks and shows phrases based on time and context.
 * Phase 1: basic timer + hardcoded preview phrases.
 * Phase 2: full 500+ phrase pool from JSON.
 */

// Preview phrases for Phase 1 (replaced by idle-phrases.json in Phase 2)
const PREVIEW_PHRASES = [
  { text: 'blub blub blub', category: 'cheerful' },
  { text: 'the water is nice today', category: 'cheerful' },
  { text: 'what was i saying?', category: 'forgetful' },
  { text: 'i forgot why i swam over here', category: 'forgetful' },
  { text: 'oh! a bubble!', category: 'cheerful' },
  { text: 'do you think the bowl is the whole world?', category: 'existential' },
  { text: 'i love this corner. wait. every corner looks the same.', category: 'meta' },
  { text: 'is someone there? i already forgot', category: 'bored' },
  { text: 'sometimes i see a big face in the glass', category: 'meta' },
  { text: "i was going to say something important. or maybe not. who knows", category: 'forgetful' },
  { text: 'tiny flakes are the best flakes', category: 'hungry' },
  { text: 'the light keeps coming and going. weird.', category: 'existential' },
  { text: 'blub', category: 'cheerful' },
  { text: "i don't remember yesterday but today is great", category: 'cheerful' },
  { text: 'wait... where am i? oh right. the bowl.', category: 'forgetful' },
  { text: "i've been swimming in circles. or maybe a square.", category: 'meta' },
  { text: 'every moment is new! i think. i forget.', category: 'existential' },
  { text: 'the glass is cold but the water is warm', category: 'meta' },
  { text: 'do fish dream? i already forgot my dream', category: 'existential' },
  { text: 'i could go for some flakes right about now', category: 'hungry' },
];

export class IdleScheduler {
  /**
   * @param {import('./speech.js').SpeechBubble} speechBubble
   * @param {import('./state-machine.js').FishStateMachine} stateMachine
   */
  constructor(speechBubble, stateMachine) {
    this._speech = speechBubble;
    this._fsm = stateMachine;
    this._phrases = PREVIEW_PHRASES;
    this._recentlyShown = [];
    this._timer = 0;
    this._nextInterval = 8 + Math.random() * 12; // first phrase quick (8-20s)
    this._lastChatTime = 0;
    this._silenceTime = 0;
    this._enabled = true;
    this._getMood = null;
    this._getHour = null;
  }

  /** Load full phrase pool from JSON (Phase 2). */
  async loadPhrases(url) {
    try {
      const resp = await fetch(url);
      const data = await resp.json();
      this._phrases = data.phrases || data;
    } catch {
      // Keep preview phrases
    }
  }

  /** Get phrases tagged for push notifications (standalone readable). */
  getNotificationPhrases() {
    const notifPhrases = this._phrases.filter(p => p.category === 'notification');
    if (notifPhrases.length > 0) return notifPhrases.map(p => p.text);
    // Fallback: use bored/long_silence phrases
    return this._phrases
      .filter(p => ['bored', 'long_silence', 'cheerful'].includes(p.category))
      .map(p => p.text);
  }

  /** Mark that user just chatted. */
  onChatComplete() {
    this._lastChatTime = performance.now();
    this._silenceTime = 0;
    // Reset timer for a post-chat phrase sooner
    this._timer = 0;
    this._nextInterval = 8 + Math.random() * 15;
  }

  /** Mark user interaction (reset silence counter). */
  onUserInteraction() {
    this._silenceTime = 0;
  }

  /** Enable/disable idle phrases. */
  setEnabled(v) { this._enabled = v; }

  /** Inject mood provider () => 0..3 (joyful=3, neglected=0). */
  setMoodProvider(fn) { this._getMood = fn; }

  /** Inject hour-of-day provider () => 0..23 (local hour). */
  setHourProvider(fn) { this._getHour = fn; }

  update(dt) {
    if (!this._enabled) return null;

    this._silenceTime += dt;
    this._timer += dt;

    // Don't speak if bubble is visible or fish is sleeping
    if (this._speech.isVisible) return null;
    if (this._fsm.currentState === 'sleep') return null;

    // Check if time to speak
    if (this._timer < this._nextInterval) return null;

    // Speak!
    this._timer = 0;
    this._nextInterval = 30 + Math.random() * 90; // 30-120s

    const phrase = this._selectPhrase();
    if (!phrase) return null;

    return phrase;
  }

  _selectPhrase() {
    const candidates = this._phrases.filter(p => !this._recentlyShown.includes(p.text));
    let pool;
    if (candidates.length > 0) {
      pool = candidates;
    } else {
      this._recentlyShown = [];
      pool = this._phrases;
    }

    const mood = this._getMood ? this._getMood() : 2;
    const hour = this._getHour ? this._getHour() : 12;
    const moodCat = mood === 3 ? 'cheerful' : mood === 0 ? 'existential' : null;
    const hourCat = hour >= 6 && hour < 12 ? 'morning'
                  : hour >= 18 && hour < 22 ? 'evening' : null;

    const weighted = pool.map(p => {
      const baseW = p.weight ?? 1;
      const moodMul = (moodCat && p.category === moodCat) ? 2.0 : 1.0;
      const hourMul = (hourCat && p.category === hourCat) ? 1.5 : 1.0;
      return { p, w: baseW * moodMul * hourMul };
    });

    const totalW = weighted.reduce((s, x) => s + x.w, 0);
    if (totalW <= 0) return pool[0];

    let r = Math.random() * totalW;
    let pick = weighted[weighted.length - 1].p;
    for (const { p, w } of weighted) {
      r -= w;
      if (r <= 0) { pick = p; break; }
    }

    this._recentlyShown.push(pick.text);
    if (this._recentlyShown.length > 15) this._recentlyShown.shift();

    return pick;
  }
}

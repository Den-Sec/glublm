// companion/server/phrase-selector.js
import { THRESHOLD_STARVING, THRESHOLD_FILTHY, THRESHOLD_CRITICAL } from '../shared/constants.js';

// Weight multipliers per state -> category
const WEIGHTS = {
  cheerful: { base: 1, hungry: 0.1, dirty: 0.1, critical: 0 },
  philosophical: { base: 1, hungry: 0.3, dirty: 0.5, critical: 0 },
  meta: { base: 1, hungry: 0.5, dirty: 0.2, critical: 0 },
  forgetful: { base: 1, hungry: 1, dirty: 1, critical: 0 },
  existential: { base: 0.5, hungry: 0.8, dirty: 1.5, critical: 1 },
  bored: { base: 0.8, hungry: 0.5, dirty: 0.5, critical: 0 },
  hungry: { base: 0.1, hungry: 3, dirty: 0.5, critical: 0 },
  uncomfortable: { base: 0.1, hungry: 0.5, dirty: 3, critical: 0 },
  affectionate: { base: 0, hungry: 0, dirty: 0, critical: 0, bondMin: 'comfortable' },
  cautious: { base: 0.3, hungry: 0.3, dirty: 0.3, critical: 0, bondMax: 'familiar' },
  critical: { base: 0, hungry: 0, dirty: 0, critical: 3 },
  routine_hints: { base: 0, hungry: 0, dirty: 0, critical: 0, bondMin: 'bonded' },
  notification: { base: 0, hungry: 0, dirty: 0, critical: 0 },
  // Default for unconfigured categories
  _default: { base: 0.5, hungry: 0.5, dirty: 0.5, critical: 0 },
};

const BOND_ORDER = ['stranger', 'familiar', 'comfortable', 'bonded'];

export class PhraseSelector {
  constructor(phrases) {
    this._phrases = phrases;
    this._recent = [];
  }

  pick(state) {
    const condition = this._getCondition(state);
    const bondIdx = BOND_ORDER.indexOf(state.bondLevel);

    // Build full eligible pool (ignoring recent) to size the recent cap
    const fullPool = this._buildWeighted(condition, bondIdx, []);
    // Cap recent to half the eligible pool to preserve weight distribution
    const maxRecent = Math.min(20, Math.max(0, Math.floor(fullPool.length / 2)));
    while (this._recent.length > maxRecent) this._recent.shift();

    let weighted = this._buildWeighted(condition, bondIdx, this._recent);

    // If all eligible phrases are in recent, clear recent and rebuild
    if (weighted.length === 0) {
      this._recent = [];
      weighted = fullPool;
    }

    // Final fallback: nothing eligible at all (all weights 0 for this condition)
    if (weighted.length === 0) {
      return this._phrases[Math.floor(Math.random() * this._phrases.length)];
    }

    const total = weighted.reduce((s, w) => s + w.weight, 0);
    let r = Math.random() * total;
    for (const { phrase, weight } of weighted) {
      r -= weight;
      if (r <= 0) {
        this._recent.push(phrase.text);
        if (this._recent.length > 20) this._recent.shift();
        return phrase;
      }
    }
    return weighted[weighted.length - 1].phrase;
  }

  _buildWeighted(condition, bondIdx, recent) {
    const weighted = [];
    for (const phrase of this._phrases) {
      if (recent.includes(phrase.text)) continue;

      const cfg = WEIGHTS[phrase.category] || WEIGHTS._default;
      const w = cfg[condition] ?? cfg.base;
      if (w <= 0) continue;

      // Bond gating
      if (cfg.bondMin && bondIdx < BOND_ORDER.indexOf(cfg.bondMin)) continue;
      if (cfg.bondMax && bondIdx > BOND_ORDER.indexOf(cfg.bondMax)) continue;

      weighted.push({ phrase, weight: w });
    }
    return weighted;
  }

  _getCondition(state) {
    if (state.health < THRESHOLD_CRITICAL) return 'critical';
    if (state.hunger < THRESHOLD_STARVING) return 'hungry';
    if (state.cleanliness < THRESHOLD_FILTHY) return 'dirty';
    return 'base';
  }
}

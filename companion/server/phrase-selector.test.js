// companion/server/phrase-selector.test.js
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { PhraseSelector } from './phrase-selector.js';

const PHRASES = [
  { text: 'blub blub', category: 'cheerful' },
  { text: 'so hungry...', category: 'hungry' },
  { text: 'water thick', category: 'uncomfortable' },
  { text: 'who are you', category: 'cautious' },
  { text: 'oh the big shape!', category: 'affectionate' },
  { text: '...', category: 'critical' },
  { text: 'something nice happens now', category: 'routine_hints' },
  { text: 'what was i saying', category: 'forgetful' },
];

describe('PhraseSelector', () => {
  it('picks from all categories when happy', () => {
    const sel = new PhraseSelector(PHRASES);
    const phrase = sel.pick({ hunger: 90, cleanliness: 90, health: 100, bondLevel: 'familiar' });
    assert.ok(phrase);
    assert.ok(phrase.text.length > 0);
  });

  it('favors hungry category when hungry', () => {
    const sel = new PhraseSelector(PHRASES);
    const counts = {};
    for (let i = 0; i < 200; i++) {
      const p = sel.pick({ hunger: 10, cleanliness: 90, health: 80, bondLevel: 'familiar' });
      counts[p.category] = (counts[p.category] || 0) + 1;
    }
    // hungry should be most common
    assert.ok((counts.hungry || 0) > (counts.cheerful || 0), `hungry=${counts.hungry} cheerful=${counts.cheerful}`);
  });

  it('only picks critical phrases when health critical', () => {
    const sel = new PhraseSelector(PHRASES);
    for (let i = 0; i < 50; i++) {
      const p = sel.pick({ hunger: 5, cleanliness: 5, health: 5, bondLevel: 'stranger' });
      assert.ok(['critical', 'existential'].includes(p.category), `Got ${p.category}: "${p.text}"`);
    }
  });

  it('avoids affectionate phrases for strangers', () => {
    const sel = new PhraseSelector(PHRASES);
    for (let i = 0; i < 100; i++) {
      const p = sel.pick({ hunger: 90, cleanliness: 90, health: 100, bondLevel: 'stranger' });
      assert.notEqual(p.category, 'affectionate');
      assert.notEqual(p.category, 'routine_hints');
    }
  });

  it('favors notification when user is absent (familiar+)', () => {
    // Need >=5 phrases per category: PhraseSelector caps `_recent` to half the eligible
    // pool, so with only 2 phrases the recent-cap forces 50/50 alternation regardless of weights.
    const phrases = [];
    for (let i = 0; i < 8; i++) phrases.push({ text: `miss you ${i}`, category: 'notification' });
    for (let i = 0; i < 8; i++) phrases.push({ text: `hi ${i}`, category: 'cheerful' });
    const sel = new PhraseSelector(phrases);
    const counts = { notification: 0, cheerful: 0 };
    for (let i = 0; i < 400; i++) {
      const p = sel.pick({
        hunger: 90, cleanliness: 90, health: 100,
        bondLevel: 'familiar', minsSinceInteraction: 45,
      });
      counts[p.category]++;
    }
    // notification weight 1.5 vs cheerful 0.2 in absent -> notification dominates.
    // Empirical ratio ~2.6x (recent-cap flattens the pure 7.5x weight ratio).
    assert.ok(counts.notification > counts.cheerful * 2,
      `notification=${counts.notification} cheerful=${counts.cheerful}`);
  });

  it('does NOT trigger notification absent for stranger', () => {
    const phrases = [];
    for (let i = 0; i < 5; i++) phrases.push({ text: `miss you ${i}`, category: 'notification' });
    for (let i = 0; i < 5; i++) phrases.push({ text: `hi ${i}`, category: 'cheerful' });
    const sel = new PhraseSelector(phrases);
    for (let i = 0; i < 100; i++) {
      const p = sel.pick({
        hunger: 90, cleanliness: 90, health: 100,
        bondLevel: 'stranger', minsSinceInteraction: 60,
      });
      assert.notEqual(p.category, 'notification', 'stranger fish should not say miss you');
    }
  });

  it('critical/hungry beat absent', () => {
    const phrases = [];
    for (let i = 0; i < 5; i++) phrases.push({ text: `miss you ${i}`, category: 'notification' });
    for (let i = 0; i < 5; i++) phrases.push({ text: `so hungry ${i}`, category: 'hungry' });
    const sel = new PhraseSelector(phrases);
    let hungryCount = 0;
    for (let i = 0; i < 100; i++) {
      // Hungry AND absent -> hungry wins (priority)
      const p = sel.pick({
        hunger: 5, cleanliness: 90, health: 80,
        bondLevel: 'familiar', minsSinceInteraction: 60,
      });
      if (p.category === 'hungry') hungryCount++;
    }
    // hungry weight 3 in 'hungry' condition vs notification 0 in 'hungry' -> hungry only
    assert.equal(hungryCount, 100, 'hungry condition should dominate over absent');
  });
});

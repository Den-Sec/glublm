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
});

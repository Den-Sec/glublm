// companion/shared/constants.test.js
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import * as C from './constants.js';

describe('constants', () => {
  it('hunger drains in ~24h', () => {
    const hours = 100 / C.HUNGER_DECAY_PER_HOUR;
    assert.ok(hours > 20 && hours < 28, `Expected ~24h, got ${hours}h`);
  });

  it('cleanliness drains in 72-96h', () => {
    const hours = 100 / C.CLEANLINESS_DECAY_PER_HOUR;
    assert.ok(hours > 70 && hours < 100, `Expected 72-96h, got ${hours}h`);
  });

  it('feed amount is reasonable (25% per feed)', () => {
    assert.ok(C.FEED_AMOUNT >= 20 && C.FEED_AMOUNT <= 40);
    assert.ok(C.FEED_AMOUNT * C.FEED_OVERCOUNT <= 100, '3 feeds should not exceed 100%');
  });

  it('all thresholds are 0-100 range', () => {
    for (const k of ['THRESHOLD_STARVING', 'THRESHOLD_FILTHY', 'THRESHOLD_DEPRESSED', 'THRESHOLD_CRITICAL']) {
      assert.ok(C[k] >= 0 && C[k] <= 100, `${k} = ${C[k]}`);
    }
  });
});

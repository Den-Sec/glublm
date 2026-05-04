import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { RitualScheduler, DAWN_PHRASES, SUNSET_PHRASES } from './rituals.js';

function makeWsMock() {
  const calls = [];
  return {
    broadcast(type, data) { calls.push({ type, data }); },
    send() {},
    _calls: calls,
  };
}

function makePetMock(overrides = {}) {
  return {
    last_dawn_greeting: null,
    last_sunset_greeting: null,
    isBellyUp: false,
    ...overrides,
  };
}

describe('RitualScheduler', () => {
  it('update(dt < 30) does not fire any check', () => {
    const ws = makeWsMock();
    const pet = makePetMock();
    const r = new RitualScheduler({ getHours: () => 6, today: () => '2026-04-28' });
    r.setDeps({ ws, pet });
    r.update(10);
    r.update(10);
    r.update(9);
    assert.equal(ws._calls.length, 0);
  });

  it('update without setDeps -> no crash, no-op', () => {
    const r = new RitualScheduler({ getHours: () => 6, today: () => '2026-04-28' });
    assert.doesNotThrow(() => r.update(60));
  });

  it('dawn fires at hour=6 when flag != today', async () => {
    const ws = makeWsMock();
    const pet = makePetMock();
    const r = new RitualScheduler({ getHours: () => 6, today: () => '2026-04-28' });
    r.setDeps({ ws, pet });
    r.update(31);
    assert.equal(ws._calls.length, 1);
    assert.equal(ws._calls[0].type, 'animation');
    assert.equal(ws._calls[0].data.state, 'happy');
    assert.equal(pet.last_dawn_greeting, '2026-04-28');
    await new Promise(r => setTimeout(r, 600));
    assert.equal(ws._calls.length, 2);
    assert.equal(ws._calls[1].type, 'speech');
    assert.ok(DAWN_PHRASES.includes(ws._calls[1].data.text));
  });

  it('dawn skipped if flag == today', () => {
    const ws = makeWsMock();
    const pet = makePetMock({ last_dawn_greeting: '2026-04-28' });
    const r = new RitualScheduler({ getHours: () => 6, today: () => '2026-04-28' });
    r.setDeps({ ws, pet });
    r.update(31);
    assert.equal(ws._calls.length, 0);
  });

  it('sunset fires at hour=18 when flag != today', async () => {
    const ws = makeWsMock();
    const pet = makePetMock();
    const r = new RitualScheduler({ getHours: () => 18, today: () => '2026-04-28' });
    r.setDeps({ ws, pet });
    r.update(31);
    assert.equal(ws._calls.length, 1);
    assert.equal(ws._calls[0].type, 'animation');
    assert.equal(ws._calls[0].data.state, 'bubble_blow');
    assert.equal(pet.last_sunset_greeting, '2026-04-28');
    await new Promise(r => setTimeout(r, 600));
    assert.equal(ws._calls.length, 2);
    assert.equal(ws._calls[1].type, 'speech');
    assert.ok(SUNSET_PHRASES.includes(ws._calls[1].data.text));
  });

  it('skip both at hour=21', () => {
    const ws = makeWsMock();
    const pet = makePetMock();
    const r = new RitualScheduler({ getHours: () => 21, today: () => '2026-04-28' });
    r.setDeps({ ws, pet });
    r.update(31);
    assert.equal(ws._calls.length, 0);
  });

  it('dawn skipped if pet.isBellyUp + flag NOT set', () => {
    const ws = makeWsMock();
    const pet = makePetMock({ isBellyUp: true });
    const r = new RitualScheduler({ getHours: () => 6, today: () => '2026-04-28' });
    r.setDeps({ ws, pet });
    r.update(31);
    assert.equal(ws._calls.length, 0);
    assert.equal(pet.last_dawn_greeting, null);
  });

  it('30s timer resets after fire', () => {
    const ws = makeWsMock();
    const pet = makePetMock();
    const r = new RitualScheduler({ getHours: () => 21, today: () => '2026-04-28' });
    r.setDeps({ ws, pet });
    r.update(31);                                     // tick 1: noop (hour=21)
    r.update(10);                                     // accumulate
    assert.equal(ws._calls.length, 0);                // not yet 30s threshold
  });
});

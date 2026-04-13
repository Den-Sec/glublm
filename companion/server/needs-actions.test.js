// companion/server/needs-actions.test.js
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { NeedsEngine } from './needs-engine.js';
import { PetState } from './pet-state.js';

describe('NeedsEngine.feed', () => {
  it('increases hunger by FEED_AMOUNT', () => {
    const pet = new PetState();
    pet.hunger = 50;
    const engine = new NeedsEngine(pet);
    const result = engine.feed();
    assert.ok(result.ok);
    assert.equal(pet.hunger, 75);
  });

  it('caps hunger at 100', () => {
    const pet = new PetState();
    pet.hunger = 80;
    const engine = new NeedsEngine(pet);
    engine.feed();
    assert.equal(pet.hunger, 100);
  });

  it('allows 3 rapid feeds then rejects on cooldown', () => {
    const pet = new PetState();
    pet.hunger = 10;
    const engine = new NeedsEngine(pet);
    assert.ok(engine.feed().ok);  // 1st - ok
    assert.ok(engine.feed().ok);  // 2nd - ok
    assert.ok(engine.feed().ok);  // 3rd - ok
    const result = engine.feed(); // 4th - cooldown
    assert.ok(!result.ok);
    assert.equal(result.reason, 'cooldown');
  });

  it('triggers bloat on overfeeding', () => {
    const pet = new PetState();
    pet.hunger = 10;
    const engine = new NeedsEngine(pet);
    // Force 4 feeds by resetting cooldown (FEED_OVERCOUNT=3, so >3 = 4th triggers)
    engine.feed();
    pet.lastFeedTime = 0;
    engine.feed();
    pet.lastFeedTime = 0;
    engine.feed();
    pet.lastFeedTime = 0;
    const result = engine.feed();
    assert.ok(result.bloated);
    assert.ok(pet.isBloated);
  });

  it('schedules poop after feeding', () => {
    const pet = new PetState();
    const engine = new NeedsEngine(pet);
    engine.feed();
    assert.equal(pet.pendingPoopTimers.length, 1);
  });
});

describe('NeedsEngine.cleanPoop', () => {
  it('removes specific poop by id', () => {
    const pet = new PetState();
    pet.poops = [
      { id: 'p1', x: 0.3, y: 0.85, createdAt: Date.now() },
      { id: 'p2', x: 0.5, y: 0.85, createdAt: Date.now() },
    ];
    const engine = new NeedsEngine(pet);
    engine.cleanPoop('p1');
    assert.equal(pet.poops.length, 1);
    assert.equal(pet.poops[0].id, 'p2');
  });
});

describe('NeedsEngine.changeWater', () => {
  it('resets cleanliness to 100', () => {
    const pet = new PetState();
    pet.cleanliness = 30;
    const engine = new NeedsEngine(pet);
    const result = engine.changeWater();
    assert.ok(result.ok);
    assert.equal(pet.cleanliness, 100);
  });

  it('rejects during cooldown', () => {
    const pet = new PetState();
    pet.cleanliness = 30;
    const engine = new NeedsEngine(pet);
    engine.changeWater();
    const result = engine.changeWater();
    assert.ok(!result.ok);
    assert.equal(result.reason, 'cooldown');
  });
});

describe('NeedsEngine.play', () => {
  it('adds interaction bonus', () => {
    const pet = new PetState();
    pet.interactionBonus = 0;
    const engine = new NeedsEngine(pet);
    engine.play();
    assert.equal(pet.interactionBonus, 20);
  });

  it('rejects during cooldown', () => {
    const pet = new PetState();
    const engine = new NeedsEngine(pet);
    engine.play();
    const result = engine.play();
    assert.ok(!result.ok);
  });
});

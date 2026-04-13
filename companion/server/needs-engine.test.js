// companion/server/needs-engine.test.js
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { NeedsEngine } from './needs-engine.js';
import { PetState } from './pet-state.js';

describe('NeedsEngine.tick', () => {
  it('decays hunger over 1 hour', () => {
    const pet = new PetState();
    const engine = new NeedsEngine(pet);
    // Simulate 1 hour of ticks (3600 seconds)
    for (let i = 0; i < 3600; i++) engine.tick(1);
    // ~4.17 per hour
    assert.ok(pet.hunger > 94 && pet.hunger < 97, `hunger=${pet.hunger}`);
  });

  it('decays cleanliness over 1 hour', () => {
    const pet = new PetState();
    const engine = new NeedsEngine(pet);
    for (let i = 0; i < 3600; i++) engine.tick(1);
    // ~1.2 per hour
    assert.ok(pet.cleanliness > 97.5 && pet.cleanliness < 99.5, `clean=${pet.cleanliness}`);
  });

  it('hunger decays faster when water is dirty', () => {
    const pet = new PetState();
    pet.cleanliness = 20; // below 30 threshold
    const engine = new NeedsEngine(pet);
    for (let i = 0; i < 3600; i++) engine.tick(1);
    // 4.17 * 1.2 = ~5.0/hr
    const lost = 100 - pet.hunger;
    assert.ok(lost > 4.5 && lost < 5.5, `lost=${lost}`);
  });

  it('poop accelerates cleanliness decay', () => {
    const pet = new PetState();
    pet.poops = [
      { id: 'p1', x: 0.3, y: 0.85, createdAt: Date.now() },
      { id: 'p2', x: 0.5, y: 0.85, createdAt: Date.now() },
    ];
    const engine = new NeedsEngine(pet);
    for (let i = 0; i < 3600; i++) engine.tick(1);
    // base 1.2 + 2*0.3 = 1.8/hr
    const lost = 100 - pet.cleanliness;
    assert.ok(lost > 1.5 && lost < 2.1, `lost=${lost}`);
  });

  it('health recovers when fed and clean', () => {
    const pet = new PetState();
    pet.health = 50;
    pet.hunger = 80;
    pet.cleanliness = 80;
    const engine = new NeedsEngine(pet);
    for (let i = 0; i < 3600; i++) engine.tick(1);
    // +4/hr recovery
    assert.ok(pet.health > 53 && pet.health < 55, `health=${pet.health}`);
  });

  it('health drops when starving', () => {
    const pet = new PetState();
    pet.hunger = 10; // below 15
    pet.cleanliness = 50;
    const engine = new NeedsEngine(pet);
    for (let i = 0; i < 3600; i++) engine.tick(1);
    // -3/hr
    assert.ok(pet.health > 96 && pet.health < 98, `health=${pet.health}`);
  });

  it('health drops fast when both starving and filthy', () => {
    const pet = new PetState();
    pet.hunger = 5;
    pet.cleanliness = 5;
    const engine = new NeedsEngine(pet);
    for (let i = 0; i < 3600; i++) engine.tick(1);
    // -6/hr
    assert.ok(pet.health > 93 && pet.health < 95, `health=${pet.health}`);
  });

  it('belly-up triggers at health <10', () => {
    const pet = new PetState();
    pet.health = 10.5;
    pet.hunger = 5;
    pet.cleanliness = 5;
    const engine = new NeedsEngine(pet);
    const events = [];
    engine.on('belly_up', () => events.push('belly_up'));
    // Tick until health drops below 10
    for (let i = 0; i < 400; i++) engine.tick(1);
    assert.ok(pet.isBellyUp, 'Expected belly-up');
    assert.ok(events.length > 0, 'Expected belly_up event');
  });

  it('interaction bonus decays', () => {
    const pet = new PetState();
    pet.interactionBonus = 50;
    const engine = new NeedsEngine(pet);
    for (let i = 0; i < 3600; i++) engine.tick(1);
    // 50/hr decay -> should be ~0
    assert.ok(pet.interactionBonus < 2, `bonus=${pet.interactionBonus}`);
  });

  it('recovers from belly-up when health >= 15', () => {
    const pet = new PetState();
    pet.health = 9;
    pet.isBellyUp = true;
    pet.hunger = 80;
    pet.cleanliness = 80;
    const engine = new NeedsEngine(pet);
    const events = [];
    engine.on('recovery', () => events.push('recovery'));
    // 3 hours at +2/hr = +6, 9 -> 15 -> should recover
    for (let i = 0; i < 3600 * 3; i++) engine.tick(1);
    assert.ok(!pet.isBellyUp, 'Expected recovery');
    assert.ok(events.length > 0, 'Expected recovery event');
  });
});

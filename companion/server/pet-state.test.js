// companion/server/pet-state.test.js
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { PetState } from './pet-state.js';

describe('PetState', () => {
  it('creates with default values', () => {
    const pet = new PetState();
    assert.equal(pet.hunger, 100);
    assert.equal(pet.cleanliness, 100);
    assert.equal(pet.health, 100);
    assert.equal(pet.bond, 10);
    assert.equal(pet.poops.length, 0);
    assert.equal(pet.isBloated, false);
    assert.equal(pet.isBellyUp, false);
    assert.ok(pet.createdAt > 0);
  });

  it('serializes and deserializes', () => {
    const pet = new PetState();
    pet.hunger = 50;
    pet.bond = 42;
    pet.poops.push({ id: 'p1', x: 0.3, y: 0.85, createdAt: Date.now() });
    const json = pet.serialize();
    const restored = PetState.deserialize(json);
    assert.equal(restored.hunger, 50);
    assert.equal(restored.bond, 42);
    assert.equal(restored.poops.length, 1);
    assert.equal(restored.poops[0].id, 'p1');
  });

  it('clamps values to 0-100', () => {
    const pet = new PetState();
    pet.hunger = 150;
    assert.equal(pet.hunger, 100);
    pet.hunger = -20;
    assert.equal(pet.hunger, 0);
  });

  it('computes happiness from formula', () => {
    const pet = new PetState();
    pet.hunger = 80;
    pet.cleanliness = 80;
    pet.health = 100;
    pet.interactionBonus = 50;
    const h = pet.happiness;
    // (80*0.35)+(80*0.25)+(50*0.25)+(100*0.15) = 28+20+12.5+15 = 75.5
    assert.ok(Math.abs(h - 75.5) < 0.1, `Expected ~75.5, got ${h}`);
  });

  it('tracks age in days', () => {
    const pet = new PetState();
    pet.createdAt = Date.now() - 3 * 24 * 60 * 60 * 1000;
    assert.equal(pet.ageDays, 3);
  });

  it('computes bond level label', () => {
    const pet = new PetState();
    pet.bond = 5;
    assert.equal(pet.bondLevel, 'stranger');
    pet.bond = 35;
    assert.equal(pet.bondLevel, 'familiar');
    pet.bond = 60;
    assert.equal(pet.bondLevel, 'comfortable');
    pet.bond = 85;
    assert.equal(pet.bondLevel, 'bonded');
  });
});

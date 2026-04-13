// companion/server/personality.test.js
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { Personality } from './personality.js';
import { PetState } from './pet-state.js';

describe('Personality', () => {
  it('increases bond on feed when hungry', () => {
    const pet = new PetState();
    pet.hunger = 30; // hungry
    pet.bond = 50;
    const p = new Personality(pet);
    p.onFeed();
    assert.ok(pet.bond > 50);
  });

  it('caps daily feed bond', () => {
    const pet = new PetState();
    pet.hunger = 10;
    pet.bond = 50;
    const p = new Personality(pet);
    for (let i = 0; i < 10; i++) p.onFeed();
    // Should not exceed +2 per day
    assert.ok(pet.bond <= 52.1, `bond=${pet.bond}`);
  });

  it('increases bond on clean', () => {
    const pet = new PetState();
    pet.cleanliness = 20;
    pet.bond = 50;
    const p = new Personality(pet);
    p.onClean();
    assert.ok(pet.bond > 50);
  });

  it('decreases bond on critical event', () => {
    const pet = new PetState();
    pet.bond = 50;
    const p = new Personality(pet);
    p.onCritical();
    assert.equal(pet.bond, 48);
  });

  it('penalizes neglect daily', () => {
    const pet = new PetState();
    pet.bond = 50;
    pet.hunger = 20; // below 25
    const p = new Personality(pet);
    p.dailyCheck();
    assert.ok(pet.bond < 50);
  });

  it('rewards consistent care daily', () => {
    const pet = new PetState();
    pet.bond = 50;
    pet.hunger = 80;
    pet.cleanliness = 70;
    pet.health = 90;
    const p = new Personality(pet);
    p.dailyCheck();
    assert.ok(pet.bond > 50);
  });
});

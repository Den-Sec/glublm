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

  it('initializes 9 new B.3 fields with defaults', () => {
    const pet = new PetState();
    assert.equal(pet.last_chat_at, 0);
    assert.equal(pet.last_excited_at, 0);
    assert.equal(pet.last_seen_at, 0);
    assert.equal(pet.total_chats, 0);
    assert.equal(pet.total_excited, 0);
    assert.equal(pet.streak_days, 0);
    assert.equal(pet.last_interaction_day_utc, null);
    assert.equal(pet.last_dawn_greeting, null);
    assert.equal(pet.last_sunset_greeting, null);
    assert.equal(pet._reactivationFired, false);
  });

  it('serializes 9 new B.3 fields', () => {
    const pet = new PetState();
    pet.last_chat_at = 1000;
    pet.last_excited_at = 2000;
    pet.last_seen_at = 3000;
    pet.total_chats = 4;
    pet.total_excited = 5;
    pet.streak_days = 6;
    pet.last_interaction_day_utc = '2026-04-28';
    pet.last_dawn_greeting = '2026-04-28';
    pet.last_sunset_greeting = '2026-04-27';
    const data = JSON.parse(pet.serialize());
    assert.equal(data.last_chat_at, 1000);
    assert.equal(data.last_excited_at, 2000);
    assert.equal(data.last_seen_at, 3000);
    assert.equal(data.total_chats, 4);
    assert.equal(data.total_excited, 5);
    assert.equal(data.streak_days, 6);
    assert.equal(data.last_interaction_day_utc, '2026-04-28');
    assert.equal(data.last_dawn_greeting, '2026-04-28');
    assert.equal(data.last_sunset_greeting, '2026-04-27');
    // _reactivationFired is process-only, NOT persisted
    assert.equal('_reactivationFired' in data, false);
  });

  it('deserializes 9 new B.3 fields', () => {
    const original = new PetState();
    original.last_chat_at = 1000;
    original.streak_days = 3;
    original.last_interaction_day_utc = '2026-04-28';
    const restored = PetState.deserialize(original.serialize());
    assert.equal(restored.last_chat_at, 1000);
    assert.equal(restored.streak_days, 3);
    assert.equal(restored.last_interaction_day_utc, '2026-04-28');
  });

  it('deserializes old JSON without B.3 fields -> defaults', () => {
    const oldJson = JSON.stringify({
      hunger: 80, cleanliness: 70, health: 90, bond: 30,
      createdAt: 1000, lastInteraction: 2000, fishName: 'glub',
      // no last_chat_at, no streak_days, etc.
    });
    const pet = PetState.deserialize(oldJson);
    assert.equal(pet.hunger, 80);
    assert.equal(pet.last_chat_at, 0);          // default preserved
    assert.equal(pet.streak_days, 0);
    assert.equal(pet.last_interaction_day_utc, null);
  });

  it('deserialize never restores _reactivationFired even if present in JSON', () => {
    const malicious = JSON.stringify({
      hunger: 100, fishName: 'glub',
      _reactivationFired: true,
    });
    const pet = PetState.deserialize(malicious);
    assert.equal(pet._reactivationFired, false);
  });

  it('recordEvent("chat") updates last_chat_at + total_chats + day', () => {
    const pet = new PetState();
    const before = Date.now();
    pet.recordEvent('chat');
    assert.ok(pet.last_chat_at >= before);
    assert.equal(pet.total_chats, 1);
    assert.equal(pet.streak_days, 1);
    assert.ok(pet.last_interaction_day_utc !== null);
  });

  it('recordEvent("feed") updates lastFeedTime + leaves chat counters alone', () => {
    const pet = new PetState();
    pet.recordEvent('feed');
    assert.ok(pet.lastFeedTime > 0);
    assert.equal(pet.total_chats, 0);
  });

  it('recordEvent("play") updates last_excited_at + total_excited + lastPlayTime', () => {
    const pet = new PetState();
    pet.recordEvent('play');
    assert.ok(pet.last_excited_at > 0);
    assert.equal(pet.total_excited, 1);
    assert.ok(pet.lastPlayTime > 0);
  });

  it('recordEvent unknown type throws', () => {
    const pet = new PetState();
    assert.throws(() => pet.recordEvent('bogus'), /Unknown event type/);
  });

  it('streak: same UTC day -> no increment', () => {
    const pet = new PetState();
    pet.recordEvent('chat');
    pet.recordEvent('chat');
    pet.recordEvent('feed');
    assert.equal(pet.streak_days, 1);
  });

  it('streak: gap 1 UTC day -> +1', () => {
    const pet = new PetState();
    const today = new Date();
    const yesterday = new Date(today.getTime() - 24 * 3600 * 1000);
    const pad = (n) => String(n).padStart(2, '0');
    const yStr = `${yesterday.getUTCFullYear()}-${pad(yesterday.getUTCMonth() + 1)}-${pad(yesterday.getUTCDate())}`;
    pet.last_interaction_day_utc = yStr;
    pet.streak_days = 5;
    pet.recordEvent('chat');
    assert.equal(pet.streak_days, 6);
  });

  it('streak: gap 2 UTC days -> +1 (24h grace)', () => {
    const pet = new PetState();
    const today = new Date();
    const twoDaysAgo = new Date(today.getTime() - 2 * 24 * 3600 * 1000);
    const pad = (n) => String(n).padStart(2, '0');
    const yStr = `${twoDaysAgo.getUTCFullYear()}-${pad(twoDaysAgo.getUTCMonth() + 1)}-${pad(twoDaysAgo.getUTCDate())}`;
    pet.last_interaction_day_utc = yStr;
    pet.streak_days = 3;
    pet.recordEvent('chat');
    assert.equal(pet.streak_days, 4);
  });

  it('streak: gap 3+ UTC days -> reset to 1', () => {
    const pet = new PetState();
    const today = new Date();
    const fourDaysAgo = new Date(today.getTime() - 4 * 24 * 3600 * 1000);
    const pad = (n) => String(n).padStart(2, '0');
    const yStr = `${fourDaysAgo.getUTCFullYear()}-${pad(fourDaysAgo.getUTCMonth() + 1)}-${pad(fourDaysAgo.getUTCDate())}`;
    pet.last_interaction_day_utc = yStr;
    pet.streak_days = 7;
    pet.recordEvent('chat');
    assert.equal(pet.streak_days, 1);
  });
});

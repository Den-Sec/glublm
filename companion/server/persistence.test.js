// companion/server/persistence.test.js
import { describe, it, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { Persistence } from './persistence.js';
import { PetState } from './pet-state.js';

const TEST_PATH = path.join(import.meta.dirname, '_test_state.json');

afterEach(() => {
  try { fs.unlinkSync(TEST_PATH); } catch {}
});

describe('Persistence', () => {
  it('saves and loads pet state', () => {
    const pet = new PetState();
    pet.hunger = 42;
    pet.fishName = 'bubbles';
    const p = new Persistence(TEST_PATH);
    p.save(pet);
    assert.ok(fs.existsSync(TEST_PATH));
    const loaded = p.load();
    assert.equal(loaded.hunger, 42);
    assert.equal(loaded.fishName, 'bubbles');
  });

  it('returns null when no file exists', () => {
    const p = new Persistence(TEST_PATH);
    const loaded = p.load();
    assert.equal(loaded, null);
  });

  it('returns null on corrupt file', () => {
    fs.writeFileSync(TEST_PATH, 'not json{{{');
    const p = new Persistence(TEST_PATH);
    const loaded = p.load();
    assert.equal(loaded, null);
  });
});

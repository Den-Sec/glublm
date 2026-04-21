// Unit tests for SoundEngine. Run: node --test desk-pet/engine/sound.test.js

import { test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';

import {
  installAudioStub,
  removeAudioStub,
  resetAllStubs,
} from './test-stubs.js';

let SoundEngineModule;

async function loadModule() {
  // Cache-bust the module import so each test gets a fresh module instance
  // (ES module cache by URL; append a unique query).
  SoundEngineModule = await import('./sound.js?t=' + Math.random());
  return SoundEngineModule;
}

beforeEach(() => {
  resetAllStubs();
});

afterEach(() => {
  resetAllStubs();
});

test('SoundEngine: hasAudio true when AudioContext stub installed', async () => {
  installAudioStub();
  const { SoundEngine } = await loadModule();
  const s = new SoundEngine({ enabled: true });
  assert.equal(s.hasAudio, true);
});

test('SoundEngine: hasAudio false when no AudioContext global', async () => {
  removeAudioStub();
  const { SoundEngine } = await loadModule();
  const s = new SoundEngine({ enabled: true });
  assert.equal(s.hasAudio, false);
});

test('SoundEngine: constructor does not instantiate AudioContext', async () => {
  const registry = installAudioStub();
  const { SoundEngine } = await loadModule();
  new SoundEngine({ enabled: true });
  assert.equal(registry.count, 0);
});

test('SoundEngine: unlock() instantiates AudioContext and calls resume', async () => {
  const registry = installAudioStub();
  const { SoundEngine } = await loadModule();
  const s = new SoundEngine({ enabled: true });
  s.unlock();
  assert.equal(registry.count, 1);
  assert.equal(registry.last._resumeCalls, 1);
});

test('SoundEngine: unlock() is idempotent (second call no-op)', async () => {
  const registry = installAudioStub();
  const { SoundEngine } = await loadModule();
  const s = new SoundEngine({ enabled: true });
  s.unlock();
  s.unlock();
  assert.equal(registry.count, 1);
});

test('SoundEngine: setEnabled toggles enabled state', async () => {
  installAudioStub();
  const { SoundEngine } = await loadModule();
  const s = new SoundEngine({ enabled: true });
  assert.equal(s.enabled, true);
  s.setEnabled(false);
  assert.equal(s.enabled, false);
  s.setEnabled(true);
  assert.equal(s.enabled, true);
});

test('SoundEngine: preset registry includes 6 known presets', async () => {
  installAudioStub();
  const { SoundEngine, PRESET_IDS } = await loadModule();
  const expected = ['bubble_pop', 'splash_click', 'nom_nom_eat', 'forget_glub', 'chat_send', 'excited_celebration'];
  for (const id of expected) {
    assert.ok(PRESET_IDS.includes(id), `missing preset ${id}`);
  }
  assert.equal(PRESET_IDS.length, 6);
});

test('SoundEngine: play(invalid) throws with preset name', async () => {
  installAudioStub();
  const { SoundEngine } = await loadModule();
  const s = new SoundEngine({ enabled: true });
  s.unlock();
  assert.throws(() => s.play('does_not_exist'), /Unknown sound preset: does_not_exist/);
});

test('SoundEngine: play() pre-unlock is silent no-op', async () => {
  const registry = installAudioStub();
  const { SoundEngine } = await loadModule();
  const s = new SoundEngine({ enabled: true });
  const result = s.play('bubble_pop');
  assert.equal(result, false);
  assert.equal(registry.count, 0);
});

test('SoundEngine: play(bubble_pop) when enabled + unlocked creates oscillator', async () => {
  const registry = installAudioStub();
  const { SoundEngine } = await loadModule();
  const s = new SoundEngine({ enabled: true });
  s.unlock();
  const result = s.play('bubble_pop');
  assert.equal(result, true);
  assert.equal(registry.last._oscillators.length, 1);
  assert.equal(registry.last._oscillators[0].started, true);
});

test('SoundEngine: play() when disabled is silent no-op', async () => {
  const registry = installAudioStub();
  const { SoundEngine } = await loadModule();
  const s = new SoundEngine({ enabled: true });
  s.unlock();
  s.setEnabled(false);
  const result = s.play('bubble_pop');
  assert.equal(result, false);
  assert.equal(registry.last._oscillators.length, 0);
});

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

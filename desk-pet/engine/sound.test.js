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

test('SoundEngine: all 6 presets callable without throw', async () => {
  const registry = installAudioStub();
  const { SoundEngine, PRESET_IDS } = await loadModule();
  const s = new SoundEngine({ enabled: true });
  s.unlock();
  for (const id of PRESET_IDS) {
    const result = s.play(id);
    assert.equal(result, true, `preset ${id} did not play`);
  }
});

test('SoundEngine: excited_celebration schedules 3 oscillators (arpeggio)', async () => {
  const registry = installAudioStub();
  const { SoundEngine } = await loadModule();
  const s = new SoundEngine({ enabled: true });
  s.unlock();
  const before = registry.last._oscillators.length;
  s.play('excited_celebration');
  // 3-note arpeggio => 3 oscillators scheduled
  assert.equal(registry.last._oscillators.length, before + 3);
});

test('SoundEngine: nom_nom_eat schedules 3 oscillators (3 bursts)', async () => {
  const registry = installAudioStub();
  const { SoundEngine } = await loadModule();
  const s = new SoundEngine({ enabled: true });
  s.unlock();
  const before = registry.last._oscillators.length;
  s.play('nom_nom_eat');
  assert.equal(registry.last._oscillators.length, before + 3);
});

test('SoundEngine: bubble_pop throttled to max 1 per 500ms', async () => {
  const registry = installAudioStub();
  const { SoundEngine } = await loadModule();
  const s = new SoundEngine({ enabled: true });
  s.unlock();

  // Fake clock via monkey-patch Date.now used internally
  let now = 1000;
  const origNow = Date.now;
  Date.now = () => now;

  try {
    // 3 rapid spawns in 100ms
    const r1 = s.play('bubble_pop'); now += 100;
    const r2 = s.play('bubble_pop'); now += 100;
    const r3 = s.play('bubble_pop');

    // First allowed, second + third throttled
    assert.equal(r1, true);
    assert.equal(r2, false);
    assert.equal(r3, false);

    // After 500ms window, allowed again
    now += 400; // total 600ms since first
    const r4 = s.play('bubble_pop');
    assert.equal(r4, true);
  } finally {
    Date.now = origNow;
  }
});

test('SoundEngine: other presets NOT throttled', async () => {
  const registry = installAudioStub();
  const { SoundEngine } = await loadModule();
  const s = new SoundEngine({ enabled: true });
  s.unlock();

  // 3 rapid chat_send in same tick should all succeed
  assert.equal(s.play('chat_send'), true);
  assert.equal(s.play('chat_send'), true);
  assert.equal(s.play('chat_send'), true);
});

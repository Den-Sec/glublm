import { test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  installHapticStub,
  removeHapticStub,
  installMatchMediaStub,
  resetAllStubs,
} from './test-stubs.js';

async function loadModule() {
  return await import('./haptic.js?t=' + Math.random());
}

beforeEach(() => { resetAllStubs(); });
afterEach(() => { resetAllStubs(); });

test('HapticEngine: hasHaptic true when navigator.vibrate exists', async () => {
  installHapticStub();
  installMatchMediaStub();
  const { HapticEngine } = await loadModule();
  const h = new HapticEngine({ enabled: true });
  assert.equal(h.hasHaptic, true);
});

test('HapticEngine: hasHaptic false when navigator.vibrate missing', async () => {
  removeHapticStub();
  installMatchMediaStub();
  const { HapticEngine } = await loadModule();
  const h = new HapticEngine({ enabled: true });
  assert.equal(h.hasHaptic, false);
});

test('HapticEngine: preset registry includes 5 presets', async () => {
  installHapticStub();
  installMatchMediaStub();
  const { PRESET_IDS } = await loadModule();
  const expected = ['tap_fish', 'long_press_happy', 'double_excited', 'splash_click', 'chat_send'];
  for (const id of expected) assert.ok(PRESET_IDS.includes(id), `missing ${id}`);
  assert.equal(PRESET_IDS.length, 5);
});

test('HapticEngine: pulse(tap_fish) invokes navigator.vibrate([10])', async () => {
  const registry = installHapticStub();
  installMatchMediaStub();
  const { HapticEngine } = await loadModule();
  const h = new HapticEngine({ enabled: true });
  h.pulse('tap_fish');
  assert.deepEqual(registry.calls[0], [10]);
});

test('HapticEngine: pulse(double_excited) invokes pattern [40,30,40]', async () => {
  const registry = installHapticStub();
  installMatchMediaStub();
  const { HapticEngine } = await loadModule();
  const h = new HapticEngine({ enabled: true });
  h.pulse('double_excited');
  assert.deepEqual(registry.calls[0], [40, 30, 40]);
});

test('HapticEngine: disabled is silent no-op', async () => {
  const registry = installHapticStub();
  installMatchMediaStub();
  const { HapticEngine } = await loadModule();
  const h = new HapticEngine({ enabled: false });
  h.pulse('tap_fish');
  assert.equal(registry.calls.length, 0);
});

test('HapticEngine: no haptic support = silent no-op', async () => {
  removeHapticStub();
  installMatchMediaStub();
  const { HapticEngine } = await loadModule();
  const h = new HapticEngine({ enabled: true });
  h.pulse('tap_fish'); // should not throw
});

test('HapticEngine: prefers-reduced-motion silences pulse', async () => {
  const registry = installHapticStub();
  const mm = installMatchMediaStub({ reducedMotion: true });
  const { HapticEngine } = await loadModule();
  const h = new HapticEngine({ enabled: true });
  h.pulse('tap_fish');
  assert.equal(registry.calls.length, 0);
});

test('HapticEngine: reduced-motion live update via matchMedia listener', async () => {
  const registry = installHapticStub();
  const mm = installMatchMediaStub({ reducedMotion: false });
  const { HapticEngine } = await loadModule();
  const h = new HapticEngine({ enabled: true });
  h.pulse('tap_fish');
  assert.equal(registry.calls.length, 1);
  mm.setReducedMotion(true);
  h.pulse('tap_fish');
  assert.equal(registry.calls.length, 1); // no new call
});

test('HapticEngine: pulse(invalid) throws with preset name', async () => {
  installHapticStub();
  installMatchMediaStub();
  const { HapticEngine } = await loadModule();
  const h = new HapticEngine({ enabled: true });
  assert.throws(() => h.pulse('unknown'), /Unknown haptic preset: unknown/);
});

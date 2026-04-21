import { test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  installLocalStorageStub,
  installMatchMediaStub,
  resetAllStubs,
} from './test-stubs.js';

async function loadModule() {
  // reset DOM-related globals; onboarding uses document directly, so install a minimal stub
  globalThis.document = {
    getElementById: () => null,
    querySelector: () => null,
    addEventListener: () => {},
    removeEventListener: () => {},
  };
  return await import('./onboarding.js?t=' + Math.random());
}

beforeEach(() => { resetAllStubs(); });
afterEach(() => { resetAllStubs(); });

test('onboarding: shouldShowOnboarding true when no flag set', async () => {
  installLocalStorageStub({});
  installMatchMediaStub();
  const { shouldShowOnboarding } = await loadModule();
  assert.equal(shouldShowOnboarding(), true);
});

test('onboarding: shouldShowOnboarding false when v2 flag set', async () => {
  installLocalStorageStub({ glub_onboarded_v2: '1' });
  installMatchMediaStub();
  const { shouldShowOnboarding } = await loadModule();
  assert.equal(shouldShowOnboarding(), false);
});

test('onboarding: shouldShowOnboarding true for v1 user (migration)', async () => {
  installLocalStorageStub({ glub_onboarded_v1: '1' });
  installMatchMediaStub();
  const { shouldShowOnboarding } = await loadModule();
  // v1 user sees new tutorial once -> should show
  assert.equal(shouldShowOnboarding(), true);
});

test('onboarding: HINTS array has 3 entries with id + text + target + demo', async () => {
  installLocalStorageStub({});
  installMatchMediaStub();
  const { HINTS } = await loadModule();
  assert.equal(HINTS.length, 3);
  const ids = HINTS.map(h => h.id);
  assert.deepEqual(ids, ['tap', 'hold', 'type']);
  for (const h of HINTS) {
    assert.ok(typeof h.text === 'string');
    assert.ok(typeof h.duration === 'number');
    assert.ok(typeof h.target === 'function');
    assert.ok(typeof h.demo === 'function');
  }
});

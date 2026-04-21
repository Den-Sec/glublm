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

// Minimal DOM stub factory for onboarding loop tests.
function installDomStub() {
  const elements = new Map();
  const createEl = () => ({
    classList: { add: () => {}, remove: () => {}, toggle: () => {} },
    style: {},
    textContent: '',
    setAttribute: () => {},
    getAttribute: () => null,
    addEventListener: () => {},
    removeEventListener: () => {},
    appendChild: () => {},
    removeChild: () => {},
    focus: () => {},
    getBoundingClientRect: () => ({ left: 0, top: 0, width: 100, height: 100 }),
  });
  globalThis.document = {
    getElementById: (id) => elements.get(id) ?? null,
    querySelector: (sel) => elements.get(sel) ?? null,
    createElement: () => createEl(),
    addEventListener: () => {},
    removeEventListener: () => {},
    body: createEl(),
  };
  const register = (key, el = createEl()) => { elements.set(key, el); return el; };
  return { register };
}

test('onboarding: runOnboarding aborts on abortSignal and marks v2 flag', async () => {
  const ls = installLocalStorageStub({});
  installMatchMediaStub();
  const dom = installDomStub();
  dom.register('onboarding-overlay');
  dom.register('onboarding-cue');
  dom.register('.onboarding-text');
  const { runOnboarding, setDeps } = await loadModule();
  setDeps({
    haptic: { pulse: () => {} },
    sound: { play: () => {} },
    speech: { show: () => {} },
    fsm: { transition: () => true },
    STATES: { HAPPY: 'HAPPY', EXCITED: 'EXCITED' },
    getFishRect: () => ({ left: 0, top: 0, width: 16, height: 16 }),
  });

  const ac = new AbortController();
  const p = runOnboarding({ signal: ac.signal });
  ac.abort(); // early dismiss immediately
  await p;

  assert.equal(ls.glub_onboarded_v2, '1');
});

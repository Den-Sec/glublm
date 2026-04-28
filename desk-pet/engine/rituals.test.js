import { test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  installLocalStorageStub,
  resetAllStubs,
  makeSpeechMock,
  makeFsmMock,
  STATES_MOCK,
} from './test-stubs.js';

async function loadModule() {
  return await import('./rituals.js?t=' + Math.random());
}

beforeEach(() => { resetAllStubs(); });
afterEach(() => { resetAllStubs(); });

test('rituals: update(dt < 30) does not fire any check', async () => {
  installLocalStorageStub({});
  const { RitualScheduler } = await loadModule();
  const speech = makeSpeechMock();
  const fsm = makeFsmMock(STATES_MOCK.IDLE);
  const r = new RitualScheduler({ getHours: () => 6, today: () => '2026-04-28' });
  r.setDeps({ speech, fsm, STATES: STATES_MOCK });
  r.update(10);
  r.update(10);
  r.update(9);
  assert.equal(fsm._calls.length, 0);
  assert.equal(speech._calls.length, 0);
});

test('rituals: update without setDeps -> no crash, no-op', async () => {
  installLocalStorageStub({});
  const { RitualScheduler } = await loadModule();
  const r = new RitualScheduler({ getHours: () => 6, today: () => '2026-04-28' });
  // Note: no setDeps called
  assert.doesNotThrow(() => r.update(60));
});

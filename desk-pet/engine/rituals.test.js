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

test('rituals: dawn fires at hour=6 when flag != today', async () => {
  installLocalStorageStub({});
  const { RitualScheduler, DAWN_PHRASES } = await loadModule();
  const speech = makeSpeechMock();
  const fsm = makeFsmMock(STATES_MOCK.IDLE);
  const r = new RitualScheduler({ getHours: () => 6, today: () => '2026-04-28' });
  r.setDeps({ speech, fsm, STATES: STATES_MOCK });
  r.update(31);
  // FSM transition fires synchronously; speech.show fires via setTimeout 500ms
  assert.equal(fsm._calls.length, 1);
  assert.equal(fsm._calls[0].state, STATES_MOCK.HAPPY);
  await new Promise(r => setTimeout(r, 600));
  assert.equal(speech._calls.length, 1);
  assert.ok(DAWN_PHRASES.includes(speech._calls[0].text));
  assert.equal(globalThis.localStorage.getItem('glub_last_dawn_greeting'), '2026-04-28');
});

test('rituals: dawn skipped if flag == today', async () => {
  installLocalStorageStub({ glub_last_dawn_greeting: '2026-04-28' });
  const { RitualScheduler } = await loadModule();
  const speech = makeSpeechMock();
  const fsm = makeFsmMock(STATES_MOCK.IDLE);
  const r = new RitualScheduler({ getHours: () => 6, today: () => '2026-04-28' });
  r.setDeps({ speech, fsm, STATES: STATES_MOCK });
  r.update(31);
  await new Promise(r => setTimeout(r, 600));
  assert.equal(fsm._calls.length, 0);
  assert.equal(speech._calls.length, 0);
});

test('rituals: dawn skipped if fsm.SLEEPING + flag NOT set', async () => {
  const ls = installLocalStorageStub({});
  const { RitualScheduler } = await loadModule();
  const speech = makeSpeechMock();
  const fsm = makeFsmMock(STATES_MOCK.SLEEPING);
  const r = new RitualScheduler({ getHours: () => 6, today: () => '2026-04-28' });
  r.setDeps({ speech, fsm, STATES: STATES_MOCK });
  r.update(31);
  assert.equal(fsm._calls.length, 0);
  assert.equal(ls.glub_last_dawn_greeting, undefined);
});

test('rituals: dawn skipped if speech.isVisible', async () => {
  installLocalStorageStub({});
  const { RitualScheduler } = await loadModule();
  const speech = makeSpeechMock();
  speech.isVisible = true;
  const fsm = makeFsmMock(STATES_MOCK.IDLE);
  const r = new RitualScheduler({ getHours: () => 6, today: () => '2026-04-28' });
  r.setDeps({ speech, fsm, STATES: STATES_MOCK });
  r.update(31);
  assert.equal(fsm._calls.length, 0);
});

test('rituals: sunset fires at hour=18 when flag != today', async () => {
  installLocalStorageStub({});
  const { RitualScheduler, SUNSET_PHRASES } = await loadModule();
  const speech = makeSpeechMock();
  const fsm = makeFsmMock(STATES_MOCK.IDLE);
  const r = new RitualScheduler({ getHours: () => 18, today: () => '2026-04-28' });
  r.setDeps({ speech, fsm, STATES: STATES_MOCK });
  r.update(31);
  assert.equal(fsm._calls.length, 1);
  assert.equal(fsm._calls[0].state, STATES_MOCK.BLOWING_BUBBLES);
  await new Promise(r => setTimeout(r, 600));
  assert.equal(speech._calls.length, 1);
  assert.ok(SUNSET_PHRASES.includes(speech._calls[0].text));
  assert.equal(globalThis.localStorage.getItem('glub_last_sunset_greeting'), '2026-04-28');
});

test('rituals: skip both at hour=21', async () => {
  installLocalStorageStub({});
  const { RitualScheduler } = await loadModule();
  const speech = makeSpeechMock();
  const fsm = makeFsmMock(STATES_MOCK.IDLE);
  const r = new RitualScheduler({ getHours: () => 21, today: () => '2026-04-28' });
  r.setDeps({ speech, fsm, STATES: STATES_MOCK });
  r.update(31);
  assert.equal(fsm._calls.length, 0);
});

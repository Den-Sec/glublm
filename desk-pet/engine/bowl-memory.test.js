import { test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { installLocalStorageStub, resetAllStubs } from './test-stubs.js';

async function loadModule() {
  return await import('./bowl-memory.js?t=' + Math.random());
}

beforeEach(() => { resetAllStubs(); });
afterEach(() => { resetAllStubs(); });

test('bowl-memory: load with no localStorage entry -> safe defaults', async () => {
  installLocalStorageStub({});
  const { MoodMemory } = await loadModule();
  const m = new MoodMemory();
  m.load();
  const s = m.state;
  assert.equal(s.last_feed_at, 0);
  assert.equal(s.last_chat_at, 0);
  assert.equal(s.last_excited_at, 0);
  assert.equal(s.last_seen_at, 0);
  assert.equal(s.total_feeds, 0);
  assert.equal(s.total_chats, 0);
  assert.equal(s.total_excited, 0);
  assert.equal(s.streak_days, 0);
  assert.equal(s.last_interaction_day_utc, null);
});

test('bowl-memory: load with malformed JSON -> reset to defaults', async () => {
  installLocalStorageStub({ glub_bowl_memory: 'not json{' });
  const { MoodMemory } = await loadModule();
  const m = new MoodMemory();
  m.load();
  assert.equal(m.state.streak_days, 0);
});

test('bowl-memory: load with valid persisted state -> deserializes', async () => {
  installLocalStorageStub({
    glub_bowl_memory: JSON.stringify({
      version: 1,
      last_feed_at: 1000, last_chat_at: 2000, last_excited_at: 3000,
      last_seen_at: 4000,
      total_feeds: 5, total_chats: 10, total_excited: 2,
      streak_days: 3, last_interaction_day_utc: '2026-04-26',
    }),
  });
  const { MoodMemory } = await loadModule();
  const m = new MoodMemory();
  m.load();
  assert.equal(m.state.last_feed_at, 1000);
  assert.equal(m.state.total_chats, 10);
  assert.equal(m.state.streak_days, 3);
  assert.equal(m.state.last_interaction_day_utc, '2026-04-26');
});

test('bowl-memory: save({flush:true}) writes JSON immediately', async () => {
  const ls = installLocalStorageStub({});
  const { MoodMemory } = await loadModule();
  const m = new MoodMemory();
  m.load();
  m.recordSeen({ now: 5000 });
  m.save({ flush: true });
  const persisted = JSON.parse(ls.glub_bowl_memory);
  assert.equal(persisted.last_seen_at, 5000);
  assert.equal(persisted.version, 1);
});

test('bowl-memory: recordSeen updates last_seen_at', async () => {
  installLocalStorageStub({});
  const { MoodMemory } = await loadModule();
  const m = new MoodMemory({ now: () => 12345 });
  m.load();
  m.recordSeen();
  assert.equal(m.state.last_seen_at, 12345);
});

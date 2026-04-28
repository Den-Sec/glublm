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

test('bowl-memory: mood_score = 0 when never interacted', async () => {
  installLocalStorageStub({});
  const { MoodMemory } = await loadModule();
  const m = new MoodMemory({ now: () => 1_000_000 });
  m.load();
  assert.equal(m.getMoodScore(), 0);
});

test('bowl-memory: mood_score 3=joyful <2h, 2=ok <8h, 1=lonely <24h, 0=neglected >=24h', async () => {
  installLocalStorageStub({});
  const { MoodMemory } = await loadModule();
  const NOW = 1_000_000_000;
  let now = NOW;
  const m = new MoodMemory({ now: () => now });
  m.load();

  // Inject last_chat_at via direct state for testing pure mood logic
  m._s.last_chat_at = NOW;
  now = NOW + 1 * 3_600_000;       assert.equal(m.getMoodScore(), 3, '1h -> joyful');
  now = NOW + 3 * 3_600_000;       assert.equal(m.getMoodScore(), 2, '3h -> ok');
  now = NOW + 12 * 3_600_000;      assert.equal(m.getMoodScore(), 1, '12h -> lonely');
  now = NOW + 30 * 3_600_000;      assert.equal(m.getMoodScore(), 0, '30h -> neglected');
});

test('bowl-memory: mood_score uses most recent of feed/chat/excited', async () => {
  installLocalStorageStub({});
  const { MoodMemory } = await loadModule();
  const NOW = 1_000_000_000;
  const m = new MoodMemory({ now: () => NOW + 60 * 60_000 }); // 1h after NOW
  m.load();
  m._s.last_chat_at = NOW - 100 * 3_600_000;     // 100h ago (very old)
  m._s.last_feed_at = NOW;                       // 1h ago (joyful range)
  m._s.last_excited_at = 0;
  assert.equal(m.getMoodScore(), 3);
});

test('bowl-memory: recordEvent("chat") updates last_chat_at + total_chats + day', async () => {
  installLocalStorageStub({});
  const { MoodMemory } = await loadModule();
  const m = new MoodMemory({ now: () => 5000, today: () => '2026-04-28' });
  m.load();
  m.recordEvent('chat');
  assert.equal(m.state.last_chat_at, 5000);
  assert.equal(m.state.total_chats, 1);
  assert.equal(m.state.last_feed_at, 0);
  assert.equal(m.state.streak_days, 1);
  assert.equal(m.state.last_interaction_day_utc, '2026-04-28');
});

test('bowl-memory: recordEvent("feed") increments total_feeds only', async () => {
  installLocalStorageStub({});
  const { MoodMemory } = await loadModule();
  const m = new MoodMemory({ today: () => '2026-04-28' });
  m.load();
  m.recordEvent('feed');
  m.recordEvent('feed');
  assert.equal(m.state.total_feeds, 2);
  assert.equal(m.state.total_chats, 0);
  assert.equal(m.state.total_excited, 0);
});

test('bowl-memory: streak same UTC day -> no increment', async () => {
  installLocalStorageStub({});
  const { MoodMemory } = await loadModule();
  const m = new MoodMemory({ today: () => '2026-04-28' });
  m.load();
  m.recordEvent('chat');
  m.recordEvent('chat');
  m.recordEvent('feed');
  assert.equal(m.state.streak_days, 1);
});

test('bowl-memory: streak gap 1 UTC day -> +1', async () => {
  installLocalStorageStub({});
  const { MoodMemory } = await loadModule();
  let day = '2026-04-26';
  const m = new MoodMemory({ today: () => day });
  m.load();
  m.recordEvent('chat');                        // streak=1
  day = '2026-04-27';
  m.recordEvent('chat');                        // streak=2 (gap=1)
  assert.equal(m.state.streak_days, 2);
});

test('bowl-memory: streak gap 2 UTC days -> +1 (24h grace)', async () => {
  installLocalStorageStub({});
  const { MoodMemory } = await loadModule();
  let day = '2026-04-26';
  const m = new MoodMemory({ today: () => day });
  m.load();
  m.recordEvent('chat');                        // streak=1
  day = '2026-04-28';
  m.recordEvent('chat');                        // streak=2 (gap=2, grace)
  assert.equal(m.state.streak_days, 2);
});

test('bowl-memory: streak gap 3+ UTC days -> reset to 1', async () => {
  installLocalStorageStub({});
  const { MoodMemory } = await loadModule();
  let day = '2026-04-26';
  const m = new MoodMemory({ today: () => day });
  m.load();
  m.recordEvent('chat');                        // streak=1
  m._s.streak_days = 7;                          // simulate accumulated streak
  day = '2026-04-30';
  m.recordEvent('chat');                        // gap=4 -> reset
  assert.equal(m.state.streak_days, 1);
});

test('bowl-memory: recordEvent unknown type throws', async () => {
  installLocalStorageStub({});
  const { MoodMemory } = await loadModule();
  const m = new MoodMemory();
  m.load();
  assert.throws(() => m.recordEvent('bogus'), /Unknown event type/);
});

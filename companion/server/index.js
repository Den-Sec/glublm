// companion/server/index.js
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { PetState } from './pet-state.js';
import { NeedsEngine } from './needs-engine.js';
import { Persistence } from './persistence.js';
import { WsServer } from './ws-server.js';
import { GlubInference } from './inference.js';
import { buildPrompt } from './prompt-builder.js';
import { PhraseSelector } from './phrase-selector.js';
import { Personality } from './personality.js';
import { MSG } from '../shared/protocol.js';
import {
  TICK_INTERVAL_MS, SAVE_INTERVAL_MS, DEFAULT_PORT,
} from '../shared/constants.js';

const PORT = parseInt(process.env.PORT || String(DEFAULT_PORT));
const STATE_FILE = process.env.STATE_FILE || path.join(import.meta.dirname, '..', 'pet-state.json');

// --- Load or create pet state ---
const persistence = new Persistence(STATE_FILE);
const pet = persistence.load() || new PetState();
const engine = new NeedsEngine(pet);

console.log(`[glub] Pet loaded: hunger=${pet.hunger.toFixed(1)} clean=${pet.cleanliness.toFixed(1)} health=${pet.health.toFixed(1)} bond=${pet.bond.toFixed(1)} age=${pet.ageDays}d`);

// --- AI inference (loads async, server works before model is ready) ---
const inference = new GlubInference();
inference.load(
  path.join(import.meta.dirname, '..', '..', 'desk-pet', 'model.onnx'),
  path.join(import.meta.dirname, '..', '..', 'desk-pet', 'tokenizer.json')
).catch(e => console.error('[glub] Model load failed:', e.message));

// --- Personality & phrase selector ---
const personality = new Personality(pet);

const phrasesData = JSON.parse(fs.readFileSync(
  path.join(import.meta.dirname, '..', 'data', 'idle-phrases.json'), 'utf-8'
));
const phraseSelector = new PhraseSelector(phrasesData.phrases);

let lastPhrase = Date.now();
const PHRASE_INTERVAL_MS = 45000;

function getMoodLabel() {
  if (pet.health < 10) return 'critical';
  if (pet.hunger < 15) return 'hungry';
  if (pet.cleanliness < 20) return 'uncomfortable';
  return 'happy';
}

// --- HTTP server (serves static files for aquarium + controller) ---
const MIME = {
  '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript',
  '.css': 'text/css', '.json': 'application/json', '.png': 'image/png',
  '.svg': 'image/svg+xml', '.onnx': 'application/octet-stream',
};

const COMPANION_ROOT = path.resolve(path.join(import.meta.dirname, '..'));
const DESK_PET_ROOT = path.resolve(path.join(import.meta.dirname, '..', '..', 'desk-pet'));

const AQUARIUM_ROOT = path.join(COMPANION_ROOT, 'aquarium');
const CONTROLLER_ROOT = path.join(COMPANION_ROOT, 'controller');
const ENGINE_ROOT = path.join(DESK_PET_ROOT, 'engine');

// Path traversal guard: returns absolute path under `root`, or null if escape attempt.
function resolveSafe(root, subpath) {
  const resolved = path.resolve(path.join(root, subpath));
  if (resolved !== root && !resolved.startsWith(root + path.sep)) return null;
  return resolved;
}

function serveStatic(req, res) {
  const url = new URL(req.url, `http://localhost:${PORT}`);
  let filePath;

  if (url.pathname.startsWith('/aquarium/')) {
    filePath = resolveSafe(AQUARIUM_ROOT, url.pathname.slice('/aquarium/'.length));
  } else if (url.pathname.startsWith('/controller/')) {
    filePath = resolveSafe(CONTROLLER_ROOT, url.pathname.slice('/controller/'.length));
  } else if (url.pathname.startsWith('/engine/')) {
    filePath = resolveSafe(ENGINE_ROOT, url.pathname.slice('/engine/'.length));
  } else if (url.pathname === '/api/state') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(pet.snapshot()));
    return;
  } else if (url.pathname === '/') {
    res.writeHead(302, { Location: '/aquarium/' });
    res.end();
    return;
  } else {
    res.writeHead(404);
    res.end('not found');
    return;
  }

  if (filePath === null) {
    res.writeHead(403);
    res.end('forbidden');
    return;
  }

  // Resolve directory paths to index.html
  if (!path.extname(filePath)) {
    filePath = path.join(filePath, 'index.html');
  }

  const ext = path.extname(filePath);
  const mime = MIME[ext] || 'application/octet-stream';

  fs.readFile(filePath, (err, data) => {
    if (err) { res.writeHead(404); res.end('not found'); return; }
    res.writeHead(200, {
      'Content-Type': mime,
      'Cache-Control': 'no-cache',
    });
    res.end(data);
  });
}

const server = http.createServer(serveStatic);
const wss = new WsServer(server);

// --- Wire engine events to WebSocket broadcasts ---
engine.on('feed', () => wss.broadcast(MSG.FEED, { flakes: 5 }));
engine.on('poop_add', (poop) => wss.broadcast(MSG.POOP, { action: 'add', ...poop }));
engine.on('poop_remove', (data) => wss.broadcast(MSG.POOP, { action: 'remove', ...data }));
engine.on('water_change', () => wss.broadcast(MSG.WATER_CHANGE));
engine.on('play', () => wss.broadcast(MSG.PLAY, { toy: 'bubble_wand' }));
engine.on('belly_up', () => { wss.broadcast(MSG.BELLY_UP, { active: true }); personality.onCritical(); });
engine.on('recovery', () => wss.broadcast(MSG.BELLY_UP, { active: false }));
engine.on('bloat', (d) => wss.broadcast(MSG.BLOAT, d));

// --- Handle client commands ---
wss.onMessage((msg, ws) => {
  if (msg.type === '_connect') {
    wss.send(ws, MSG.FULL_STATE, pet.snapshot());
    return;
  }

  switch (msg.type) {
    case MSG.CMD_FEED: {
      const result = engine.feed();
      console.log('[glub] Feed:', result.ok ? 'ok' : result.reason);
      if (result.ok) { personality.onFeed(); broadcastNeeds(); }
      else wss.send(ws, 'error', { action: 'feed', ...result });
      break;
    }
    case MSG.CMD_CLEAN_POOP: {
      const result = engine.cleanPoop(msg.id);
      console.log('[glub] Clean poop:', result.ok ? 'ok' : result.reason);
      if (result.ok) { personality.onClean(); broadcastNeeds(); }
      break;
    }
    case MSG.CMD_CHANGE_WATER: {
      const result = engine.changeWater();
      console.log('[glub] Water:', result.ok ? 'ok' : result.reason);
      if (result.ok) broadcastNeeds();
      else wss.send(ws, 'error', { action: 'water', ...result });
      break;
    }
    case MSG.CMD_PLAY: {
      const result = engine.play();
      console.log('[glub] Play:', result.ok ? 'ok' : result.reason);
      if (result.ok) broadcastNeeds();
      else wss.send(ws, 'error', { action: 'play', ...result });
      break;
    }
    case MSG.CMD_CHAT: {
      console.log('[glub] Chat:', msg.text.substring(0, 30));
      wss.broadcast(MSG.SPEECH, { text: msg.text, speaker: 'user', mood: '' });
      (async () => {
        const prompt = buildPrompt(msg.text, pet.snapshot());
        const response = await inference.generate(prompt);
        wss.broadcast(MSG.SPEECH, { text: response, speaker: 'fish', mood: getMoodLabel() });
        personality.onChat();
        pet.lastInteraction = Date.now();
        broadcastNeeds();
      })();
      break;
    }
    case MSG.CMD_CLICK_FISH: {
      wss.broadcast(MSG.ANIMATION, { state: 'wiggle', duration: 0.8 });
      break;
    }
    case MSG.CMD_CURSOR: {
      wss.broadcast(MSG.CMD_CURSOR, { x: msg.x, y: msg.y });
      break;
    }
  }
});

function broadcastNeeds() {
  wss.broadcast(MSG.NEEDS_UPDATE, {
    hunger: pet.hunger,
    cleanliness: pet.cleanliness,
    happiness: pet.happiness,
    health: pet.health,
    bond: pet.bond,
    bondLevel: pet.bondLevel,
    isBloated: pet.isBloated,
    isBellyUp: pet.isBellyUp,
    poops: pet.poops,
  });
}

// --- Tick loop ---
let lastBroadcast = Date.now();
setInterval(() => {
  engine.tick(TICK_INTERVAL_MS / 1000);

  // Broadcast needs every 5 seconds (not every tick)
  if (Date.now() - lastBroadcast > 5000) {
    lastBroadcast = Date.now();
    broadcastNeeds();
    wss.broadcast(MSG.WATER_QUALITY, { level: pet.cleanliness / 100 });
  }

  // Idle phrases
  if (Date.now() - lastPhrase > PHRASE_INTERVAL_MS) {
    lastPhrase = Date.now();
    const phrase = phraseSelector.pick(pet.snapshot());
    if (phrase) {
      wss.broadcast(MSG.SPEECH, { text: phrase.text, speaker: 'fish', mood: getMoodLabel() });
    }
  }
}, TICK_INTERVAL_MS);

// --- Auto-save ---
setInterval(() => {
  persistence.save(pet);
}, SAVE_INTERVAL_MS);

// --- Daily bond check ---
let lastDailyCheck = Date.now();
setInterval(() => {
  const now = Date.now();
  const today = new Date(); today.setHours(0, 0, 0, 0);
  if (now >= today.getTime() && lastDailyCheck < today.getTime()) {
    personality.dailyCheck();
    lastDailyCheck = now;
    console.log('[glub] Daily bond check - bond:', pet.bond.toFixed(1));
  }
}, 60000);

// --- Graceful shutdown ---
function shutdown() {
  console.log('[glub] Saving state...');
  persistence.save(pet);
  process.exit(0);
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

// --- Start ---
server.listen(PORT, () => {
  console.log(`[glub] Companion server running on http://localhost:${PORT}`);
  console.log(`[glub]   Aquarium: http://localhost:${PORT}/aquarium/`);
  console.log(`[glub]   Controller: http://localhost:${PORT}/controller/`);
  console.log(`[glub]   API: http://localhost:${PORT}/api/state`);
});

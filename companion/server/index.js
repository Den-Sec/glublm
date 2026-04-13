// companion/server/index.js
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { PetState } from './pet-state.js';
import { NeedsEngine } from './needs-engine.js';
import { Persistence } from './persistence.js';
import { WsServer } from './ws-server.js';
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

// --- HTTP server (serves static files for aquarium + controller) ---
const MIME = {
  '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript',
  '.css': 'text/css', '.json': 'application/json', '.png': 'image/png',
  '.svg': 'image/svg+xml', '.onnx': 'application/octet-stream',
};

const COMPANION_ROOT = path.join(import.meta.dirname, '..');
const DESK_PET_ROOT = path.join(import.meta.dirname, '..', '..', 'desk-pet');

function serveStatic(req, res) {
  const url = new URL(req.url, `http://localhost:${PORT}`);
  let filePath;

  if (url.pathname.startsWith('/aquarium/')) {
    filePath = path.join(COMPANION_ROOT, url.pathname);
  } else if (url.pathname.startsWith('/controller/')) {
    filePath = path.join(COMPANION_ROOT, url.pathname);
  } else if (url.pathname.startsWith('/engine/')) {
    // Serve desk-pet engine modules
    filePath = path.join(DESK_PET_ROOT, url.pathname);
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
engine.on('belly_up', () => wss.broadcast(MSG.BELLY_UP, { active: true }));
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
      if (result.ok) broadcastNeeds();
      else wss.send(ws, 'error', { action: 'feed', ...result });
      break;
    }
    case MSG.CMD_CLEAN_POOP: {
      const result = engine.cleanPoop(msg.id);
      if (result.ok) broadcastNeeds();
      break;
    }
    case MSG.CMD_CHANGE_WATER: {
      const result = engine.changeWater();
      if (result.ok) broadcastNeeds();
      else wss.send(ws, 'error', { action: 'water', ...result });
      break;
    }
    case MSG.CMD_PLAY: {
      const result = engine.play();
      if (result.ok) broadcastNeeds();
      else wss.send(ws, 'error', { action: 'play', ...result });
      break;
    }
    case MSG.CMD_CHAT: {
      // TODO: Task 10 - AI inference
      wss.broadcast(MSG.SPEECH, { text: msg.text, speaker: 'user', mood: '' });
      setTimeout(() => {
        wss.broadcast(MSG.SPEECH, { text: 'blub?', speaker: 'fish', mood: 'confused' });
      }, 1500);
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
}, TICK_INTERVAL_MS);

// --- Auto-save ---
setInterval(() => {
  persistence.save(pet);
}, SAVE_INTERVAL_MS);

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

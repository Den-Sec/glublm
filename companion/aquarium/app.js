// companion/aquarium/app.js
// Imports from desk-pet engine (served via /engine/ route)
import { CanvasManager } from '/engine/canvas.js';
import { Bowl } from '/engine/bowl.js';
import { BubbleSystem, SplashSystem } from '/engine/bubbles.js';
import { DissolveSystem } from '/engine/dissolve.js';
import { SpriteEngine } from '/engine/sprites.js';
import { FishMovement } from '/engine/movement.js';
import { FishStateMachine, STATES } from '/engine/state-machine.js';
import { SpeechBubble } from '/engine/speech.js';

// Aquarium visual modules
import { PoopSprites } from './poop-sprites.js';
import { WaterOverlay } from './water-overlay.js';
import { FoodAnimation } from './food-animation.js';

let canvas, bowl, bubbles, splash, sprites, movement, fsm, speech, dissolve;
let poopSprites, waterOverlay, foodAnim;
let ws = null;

// Belly-up state (Task 18)
let isBellyUp = false;
let bellyUpAngle = 0;       // 0 = normal, PI = fully flipped
let bellyUpTargetY = 0;     // surface Y for floating up
let recovering = false;     // true during flip-back animation

// Bond level (Task 19)
let bondLevel = 'stranger';

function connectWs() {
  const url = `ws://${location.host}`;
  ws = new WebSocket(url);

  ws.onmessage = (e) => {
    const msg = JSON.parse(e.data);
    handleMessage(msg);
  };

  ws.onclose = () => {
    setTimeout(connectWs, 3000); // reconnect
  };

  ws.onerror = () => ws.close();
}

function handleMessage(msg) {
  switch (msg.type) {
    case 'full_state':
      waterOverlay.setQuality((msg.cleanliness || 100) / 100);
      if (msg.isBellyUp) enterBellyUp();
      else if (isBellyUp) exitBellyUp();
      // Load existing poops from state
      if (msg.poops && msg.poops.length > 0) {
        poopSprites.clear();
        for (const p of msg.poops) poopSprites.add(p.id, p.x, p.y);
      }
      // Bond behavior on connect (Task 19)
      if (msg.bondLevel) {
        bondLevel = msg.bondLevel;
        applyBondBehavior();
      }
      break;
    case 'needs_update':
      waterOverlay.setQuality((msg.cleanliness || 100) / 100);
      if (msg.isBellyUp && !isBellyUp) {
        enterBellyUp();
      } else if (!msg.isBellyUp && isBellyUp) {
        exitBellyUp();
      }
      break;
    case 'speech':
      speech.show(msg.text, { type: msg.speaker === 'user' ? 'user' : 'fish' });
      if (msg.speaker === 'fish') {
        fsm.transition(STATES.TALKING, { duration: Math.max(3, msg.text.length * 0.1), priority: 2 });
      }
      break;
    case 'animation':
      fsm.transition(msg.state, { duration: msg.duration || 2, priority: 3 });
      break;
    case 'feed':
      fsm.transition(STATES.EATING, { duration: 2, priority: 3 });
      foodAnim.spawn(5);
      // Fish swims toward nearest flake after a brief delay
      setTimeout(() => {
        const flake = foodAnim.getNearestFlake(movement.x, movement.rawY);
        if (flake) movement.setTarget(flake.x, flake.y);
      }, 300);
      break;
    case 'water_quality':
      waterOverlay.setQuality(msg.level);
      break;
    case 'water_change':
      waterOverlay.setQuality(1.0);
      break;
    case 'play':
      fsm.transition(STATES.EXCITED, { duration: 2, priority: 3 });
      splash.burst(movement.x, movement.y, 12);
      break;
    case 'belly_up':
      if (msg.active) enterBellyUp();
      else exitBellyUp();
      break;
    case 'poop':
      poopSprites.handleMessage(msg);
      break;
  }
}

// --- Belly-up helpers (Task 18) ---

function enterBellyUp() {
  isBellyUp = true;
  recovering = false;
  const swim = bowl.getSwimBounds();
  bellyUpTargetY = swim.cy - swim.ry * 0.8; // near surface
  fsm.transition(STATES.SAD, { duration: Infinity, priority: 0 });
  movement.slowDown();
}

function exitBellyUp() {
  isBellyUp = false;
  recovering = true;
  // Recovery: 2-second flip-back animation
  setTimeout(() => { recovering = false; }, 2000);
  fsm.transition(STATES.HAPPY, { duration: 3, priority: 3 });
  movement.unfreeze();
}

// --- Bond behavior (Task 19) ---

function applyBondBehavior() {
  const swim = bowl.getSwimBounds();
  switch (bondLevel) {
    case 'stranger':
      // Retreat toward castle area (center-bottom, behind castle)
      movement.setTarget(swim.cx, swim.cy + swim.ry * 0.6);
      movement.pause(2);
      break;
    case 'bonded':
      // Excited wiggle on connect
      fsm.transition(STATES.EXCITED, { duration: 2, priority: 3 });
      break;
    // 'familiar' and 'comfortable': no special action
  }
}

function sendCmd(type, data = {}) {
  if (ws && ws.readyState === 1) ws.send(JSON.stringify({ type, ...data }));
}

function getFishSize() {
  return Math.max(14, Math.min(24, Math.round(canvas.width * 0.1)));
}

function render(dt) {
  sprites.update(dt);
  fsm.update(dt);
  bubbles.update(dt);
  splash.update(dt);
  speech.update(dt);
  dissolve.update(dt);
  movement.update(dt);
  poopSprites.update(dt);
  waterOverlay.update(dt);
  foodAnim.update(dt);

  // Belly-up: slowly float toward surface
  if (isBellyUp) {
    const dy = bellyUpTargetY - movement.rawY;
    if (Math.abs(dy) > 1) {
      movement.setTarget(movement.x + (Math.random() - 0.5) * 3, bellyUpTargetY);
    }
    // Rotate toward upside-down
    bellyUpAngle = Math.min(Math.PI, bellyUpAngle + dt * 1.5);
  } else if (recovering) {
    // Rotate back to normal
    bellyUpAngle = Math.max(0, bellyUpAngle - dt * (Math.PI / 2));
  }

  // Render to pixel buffer
  bowl.render(canvas.ctx, dt);
  poopSprites.render(canvas.ctx);
  bubbles.render(canvas.ctx);

  // Fish rendering with belly-up rotation (Task 18)
  const fs = getFishSize();
  const fishX = movement.x;
  const fishY = movement.y;

  if (bellyUpAngle > 0.01) {
    canvas.ctx.save();
    canvas.ctx.translate(fishX, fishY);
    canvas.ctx.rotate(bellyUpAngle);
    canvas.ctx.translate(-fishX, -fishY);
    sprites.render(canvas.ctx, fishX, fishY, fs, !movement.facingRight, movement.getEyeLook());
    canvas.ctx.restore();
  } else {
    sprites.render(canvas.ctx, fishX, fishY, fs, !movement.facingRight, movement.getEyeLook());
  }

  foodAnim.render(canvas.ctx);
  splash.render(canvas.ctx);

  // Water overlay AFTER fish so tint covers everything in the bowl
  waterOverlay.render(canvas.ctx);

  canvas.present();

  const fishScreen = canvas.internalToScreen(fishX, fishY);
  speech.render(canvas.screenCtx, fishScreen.x, fishScreen.y, canvas.screenWidth, canvas.screenHeight);

  if (dissolve.hasParticles) dissolve.render(canvas.screenCtx);
}

function setupInput() {
  canvas.el.addEventListener('pointerup', (e) => {
    const pos = canvas.screenToInternal(e.clientX, e.clientY);
    const fs = getFishSize();
    const hitFish = Math.abs(pos.x - movement.x) < fs * 0.6 && Math.abs(pos.y - movement.y) < fs * 0.6;
    if (hitFish) {
      sendCmd('cmd_click_fish');
      splash.burst(movement.x, movement.y, 8);
    } else if (bowl.isInSwimBounds(pos.x, pos.y)) {
      splash.burst(pos.x, pos.y, 4);
    }
  });

  canvas.el.addEventListener('pointermove', (e) => {
    const pos = canvas.screenToInternal(e.clientX, e.clientY);
    movement.setCursor(pos.x, pos.y);
  });

  canvas.el.addEventListener('pointerleave', () => movement.setCursor(null, null));
  canvas.el.addEventListener('contextmenu', (e) => e.preventDefault());
}

function init() {
  const canvasEl = document.getElementById('bowl');
  canvas = new CanvasManager(canvasEl);
  bowl = new Bowl(canvas);
  bubbles = new BubbleSystem(bowl);
  splash = new SplashSystem();
  sprites = new SpriteEngine();
  movement = new FishMovement(bowl);
  fsm = new FishStateMachine(sprites, movement);
  speech = new SpeechBubble();
  dissolve = new DissolveSystem();
  poopSprites = new PoopSprites(bowl);
  waterOverlay = new WaterOverlay(bowl);
  foodAnim = new FoodAnimation(bowl);

  speech.onFadeOutStart((rect) => {
    if (rect) dissolve.burst(rect.cx, rect.cy, rect.w, rect.h, 18);
  });

  setupInput();
  canvas.startLoop(render);
  connectWs();

  setTimeout(() => {
    speech.show('glub!', { type: 'fish', duration: 3 });
    fsm.transition(STATES.HAPPY, { duration: 2, priority: 2 });
  }, 600);
}

document.addEventListener('DOMContentLoaded', init);

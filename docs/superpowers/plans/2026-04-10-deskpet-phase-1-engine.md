# Desk Pet Phase 1: Core Engine

> **Spec:** [`../specs/2026-04-10-deskpet-design.md`](../specs/2026-04-10-deskpet-design.md)
> **Ultraplan:** [`2026-04-10-deskpet-ultraplan.md`](2026-04-10-deskpet-ultraplan.md)
> **Phase focus:** Canvas rendering, sprite system, state machine, bowl environment, fish movement, click interaction
> **No model dependency** - Phase 1 runs without ONNX model. The fish swims and reacts but doesn't talk yet.

---

## Task 1: Scaffold desk-pet directory

**Goal:** Create the directory structure and base HTML file.

- [ ] Step 1: Create `desk-pet/` directory at project root
- [ ] Step 2: Create `desk-pet/index.html` - minimal PWA shell with:
  - `<canvas id="bowl">` element (full viewport)
  - `<div id="ui">` overlay with text input (hidden initially)
  - `<div id="status">` for loading state
  - Meta viewport, charset, title
  - Link to `style.css`
  - Script module `app.js`
- [ ] Step 3: Create `desk-pet/style.css` - minimal styles:
  - Canvas: full viewport, `image-rendering: pixelated`
  - UI overlay: absolute positioned, bottom
  - Input: semi-transparent, rounded
  - Status: centered overlay
  - Body: no margin, no scroll, background color #f7fcff
- [ ] Step 4: Create `desk-pet/app.js` - empty entry point with `console.log('glub!')` and DOMContentLoaded listener
- [ ] Step 5: Create empty directories: `engine/`, `inference/`, `data/`, `assets/`, `assets/icons/`
- [ ] Step 6: Verify: serve with `python -m http.server 8000 --directory desk-pet`, open in browser, see blank page with console "glub!"

**Files:** `desk-pet/index.html`, `desk-pet/style.css`, `desk-pet/app.js`

---

## Task 2: Canvas manager module

**Goal:** Create the canvas manager that handles sizing, DPI, layers, and the render loop.

- [ ] Step 1: Create `desk-pet/engine/canvas.js`:
  ```javascript
  export class CanvasManager {
    constructor(canvasEl) // stores ref, gets 2D context
    resize()             // set canvas size to viewport, handle devicePixelRatio
    clear()              // clear entire canvas
    startLoop(renderFn)  // requestAnimationFrame loop, passes delta time
    stopLoop()
    get width()          // logical width
    get height()         // logical height
    get ctx()            // 2D context
  }
  ```
- [ ] Step 2: Implement resize with devicePixelRatio handling:
  - Canvas element size = viewport size (CSS)
  - Canvas buffer size = viewport * devicePixelRatio
  - Context scale by devicePixelRatio
  - Listen to window resize event
- [ ] Step 3: Implement render loop with delta time:
  - requestAnimationFrame
  - Calculate delta from last frame (cap at 100ms to prevent spiral)
  - Call renderFn(delta) each frame
  - Track FPS for debug (optional)
- [ ] Step 4: Wire into `app.js`:
  ```javascript
  import { CanvasManager } from './engine/canvas.js';
  const canvas = new CanvasManager(document.getElementById('bowl'));
  canvas.startLoop((dt) => {
    canvas.clear();
    // draw a test circle
    canvas.ctx.fillStyle = '#ff8b3d';
    canvas.ctx.beginPath();
    canvas.ctx.arc(canvas.width/2, canvas.height/2, 50, 0, Math.PI*2);
    canvas.ctx.fill();
  });
  ```
- [ ] Step 5: Verify: orange circle centered on screen, resizes with window

**Files:** `desk-pet/engine/canvas.js`, `desk-pet/app.js`

---

## Task 3: Bowl background renderer

**Goal:** Render the fishbowl with water gradient, gravel, and plants.

- [ ] Step 1: Create `desk-pet/engine/bowl.js`:
  ```javascript
  export class Bowl {
    constructor(canvasManager)
    render(ctx)           // draws full bowl
    getBounds()           // returns { x, y, radiusX, radiusY } for swim zone
    isInBounds(x, y)      // checks if point is inside swim zone
  }
  ```
- [ ] Step 2: Implement bowl shape:
  - Calculate bowl dimensions relative to canvas size (responsive)
  - Bowl = ellipse, centered horizontally, slightly below center vertically
  - Swim zone = inner ellipse with margin (fish stays inside water, not on glass)
- [ ] Step 3: Render water gradient:
  - Use `createLinearGradient` - light blue (#c8e6ff) at top to deeper (#7bb8e0) at bottom
  - Clip to bowl ellipse shape
  - Fill with gradient
- [ ] Step 4: Render gravel layer:
  - Bottom 15% of bowl
  - Sandy brown (#c4a882) base
  - Small dots/rectangles in slightly different shades (pre-computed, deterministic from seed)
- [ ] Step 5: Render plants (1-2):
  - Simple pixel-art style: 3-4 pixel wide green stalks with leaves
  - Drawn procedurally (not sprite) - a few lines and filled rects
  - Positioned on gravel layer, left and right side
- [ ] Step 6: Render glass effect:
  - Subtle white arc on left side of bowl (glass reflection)
  - Low opacity (0.08-0.12)
- [ ] Step 7: Render water surface:
  - Slight wave at the top of the water level
  - Use sin() with time parameter for gentle animation
  - 2-3 pixel height variation
- [ ] Step 8: Wire into render loop in `app.js`, verify: bowl renders responsively

**Files:** `desk-pet/engine/bowl.js`, `desk-pet/app.js`

---

## Task 4: Ambient bubble particle system

**Goal:** Subtle bubbles rising through the water.

- [ ] Step 1: Create `desk-pet/engine/bubbles.js`:
  ```javascript
  export class BubbleSystem {
    constructor(bowl)        // reference to bowl for bounds
    update(dt)               // move bubbles, spawn new ones
    render(ctx)              // draw bubbles
  }
  ```
- [ ] Step 2: Implement bubble lifecycle:
  - Pool of 5-8 bubbles (reuse, no allocation per frame)
  - Spawn at random X within bowl, near bottom
  - Rise at 20-40 px/sec (randomized per bubble)
  - Slight horizontal drift (sin wave)
  - Size: 2-4 px radius (randomized)
  - Remove when reaching water surface
  - Respawn after random delay (2-5 seconds)
- [ ] Step 3: Render bubbles:
  - Circle outline (light blue #a8d4f0, 1px stroke)
  - Small white highlight dot (1px)
  - Low opacity (0.3-0.6)
- [ ] Step 4: Wire into render loop after bowl, verify: bubbles rise gently

**Files:** `desk-pet/engine/bubbles.js`, `desk-pet/app.js`

---

## Task 5: Sprite sheet and metadata system

**Goal:** Load a sprite sheet PNG and animate frames from it.

- [ ] Step 1: Create `desk-pet/assets/sprite-meta.js`:
  ```javascript
  // Each state: { row, frames, fps, loop }
  export const SPRITE_META = {
    idle_swim:     { row: 0,  frames: 4, fps: 6,  loop: true },
    talk:          { row: 1,  frames: 4, fps: 8,  loop: true },
    happy:         { row: 2,  frames: 4, fps: 8,  loop: true },
    sad:           { row: 3,  frames: 3, fps: 4,  loop: true },
    sleep:         { row: 4,  frames: 4, fps: 2,  loop: true },
    eat:           { row: 5,  frames: 4, fps: 6,  loop: false },
    bump_glass:    { row: 6,  frames: 4, fps: 6,  loop: false },
    forget:        { row: 7,  frames: 3, fps: 4,  loop: false },
    excited:       { row: 8,  frames: 4, fps: 10, loop: true },
    wiggle:        { row: 9,  frames: 3, fps: 8,  loop: false },
    bubble_blow:   { row: 10, frames: 5, fps: 6,  loop: false },
    turn_around:   { row: 11, frames: 4, fps: 6,  loop: false },
  };
  export const CELL_SIZE = 16;
  export const SHEET_COLS = 5;
  ```
- [ ] Step 2: Create `desk-pet/engine/sprites.js`:
  ```javascript
  export class SpriteSheet {
    constructor(image, cellSize, cols)
    async load(url)
  }
  export class SpriteAnimator {
    constructor(sheet, meta)
    play(stateName)         // start playing a state animation
    update(dt)              // advance frame timer
    getCurrentFrame()       // returns { sx, sy, sw, sh } for drawImage
    get isFinished()        // true if non-loop animation completed
    get currentState()
  }
  ```
- [ ] Step 3: Implement SpriteSheet:
  - Load PNG via `new Image()` + `onload` promise
  - Store image reference, cell size, cols
  - Method: `getFrame(row, col)` returns { sx, sy, sw, sh }
- [ ] Step 4: Implement SpriteAnimator:
  - Tracks current state, current frame index, elapsed time
  - `update(dt)`: accumulate time, advance frame when time >= 1000/fps
  - Looping states: wrap frame index
  - Non-looping states: stop at last frame, set `isFinished = true`
  - `play(state)`: reset frame to 0 if different state, start timer
- [ ] Step 5: Verify with a test: load a placeholder image, animate frames, draw to canvas

**Files:** `desk-pet/assets/sprite-meta.js`, `desk-pet/engine/sprites.js`

---

## Task 6: Generate placeholder sprite sheet

**Goal:** Create a simple but functional placeholder sprite sheet for development.

- [ ] Step 1: Create a small Node.js/browser script `desk-pet/tools/gen-placeholder.html`:
  - Uses canvas to draw a 5x12 grid (80x192 px)
  - Each cell: orange oval body + black eye dot + state-specific details
  - States differentiated by simple variations (tail position, mouth, eye state, symbols)
  - Exports as PNG download
- [ ] Step 2: Generate the sprite sheet and save as `desk-pet/assets/sprites.png`
- [ ] Step 3: Alternative: hand-draw in Piskel (https://www.piskelapp.com/) - 16x16, 12 rows, 3-5 frames each
- [ ] Step 4: Verify: sprite sheet loads in the SpriteAnimator, frames cycle correctly on canvas

**Note:** The placeholder just needs to be distinguishable per state. Artistic quality is not the priority here - that's a separate task for real pixel art. A simple orange blob with eyes that changes slightly per frame is fine.

**Files:** `desk-pet/assets/sprites.png`, `desk-pet/tools/gen-placeholder.html` (optional, can delete after)

---

## Task 7: Fish movement system

**Goal:** Fish moves smoothly within the bowl, picking random targets and swimming toward them.

- [ ] Step 1: Create `desk-pet/engine/movement.js`:
  ```javascript
  export class FishMovement {
    constructor(bowl)         // needs bowl bounds
    update(dt)                // move toward target, pick new target at arrival
    get x()                   // current position
    get y()
    get facingRight()         // direction for sprite flipping
    get isAtEdge()            // true when near bowl glass (for bump state)
    setTarget(x, y)           // override target (for user interaction)
    resetToCenter()           // snap to center (for init)
  }
  ```
- [ ] Step 2: Implement target-based movement:
  - Start at bowl center
  - Pick random target within swim zone (Bowl.getBounds())
  - Move toward target at 30-60 px/sec (randomized per target)
  - Use lerp for smooth interpolation
  - When within 5px of target, pause for 1-3 seconds (random), pick new target
- [ ] Step 3: Implement direction tracking:
  - `facingRight` = true when target is to the right of current position
  - Only update direction when actually moving (not during pause)
  - Used by renderer to flip sprite horizontally
- [ ] Step 4: Implement edge detection:
  - `isAtEdge` = true when fish center is within 10px of bowl boundary
  - Used by state machine to trigger BUMP_GLASS
- [ ] Step 5: Add gentle vertical "bob" effect:
  - Small sinusoidal Y offset (2-3px amplitude, 0.5-1Hz)
  - Overlaid on top of target-based movement
  - Makes fish feel alive even when stationary
- [ ] Step 6: Wire into render loop, draw a simple circle at fish position, verify: smooth movement, stays in bowl, direction changes

**Files:** `desk-pet/engine/movement.js`, `desk-pet/app.js`

---

## Task 8: Fish state machine

**Goal:** Finite state machine that manages fish behavior states and transitions.

- [ ] Step 1: Create `desk-pet/engine/state-machine.js`:
  ```javascript
  export const STATES = {
    IDLE: 'idle_swim',
    TALKING: 'talk',
    HAPPY: 'happy',
    SAD: 'sad',
    SLEEPING: 'sleep',
    EATING: 'eat',
    BUMPING: 'bump_glass',
    FORGETTING: 'forget',
    EXCITED: 'excited',
    WIGGLING: 'wiggle',
    BLOWING_BUBBLES: 'bubble_blow',
    TURNING: 'turn_around',
  };

  export class FishStateMachine {
    constructor(spriteAnimator)
    get currentState()
    get canInterrupt()         // whether current state allows interruption
    transition(newState, { duration, priority, onComplete })
    update(dt)                 // check duration, handle completion
    onStateComplete(callback)  // register listener
  }
  ```
- [ ] Step 2: Implement priority system:
  - Priority 0: IDLE, SLEEPING (always interruptible)
  - Priority 1: random events (BUMPING, BLOWING_BUBBLES, TURNING, EATING)
  - Priority 2: idle phrases (TALKING from idle system)
  - Priority 3: user interactions (WIGGLING, EXCITED, HAPPY, TALKING from chat)
  - Higher priority can interrupt lower. Same priority cannot interrupt.
- [ ] Step 3: Implement duration-based transitions:
  - Each non-IDLE state has a duration (from spec or calculated)
  - After duration expires, state returns to IDLE
  - Non-loop animations: state ends when animation finishes (use `spriteAnimator.isFinished`)
  - Loop animations: state ends when duration expires
- [ ] Step 4: Implement `onComplete` callbacks:
  - When a state completes, fire registered callback
  - Used for chaining (e.g., TALKING -> HAPPY -> IDLE)
- [ ] Step 5: Connect to SpriteAnimator:
  - `transition()` calls `spriteAnimator.play(stateName)`
  - State name maps directly to sprite meta key
- [ ] Step 6: Verify: manually trigger transitions from console, see sprite animation change

**Files:** `desk-pet/engine/state-machine.js`

---

## Task 9: Random event scheduler

**Goal:** Periodically trigger random states (bumping, bubble blow, eating, turning, forgetting) when idle.

- [ ] Step 1: Add random event logic to `app.js` (or a small scheduler in state-machine.js):
  ```javascript
  // Every 10-30 seconds (randomized), if state is IDLE:
  //   pick a random event from weighted pool
  //   transition to that state
  ```
- [ ] Step 2: Define random event pool with weights:
  ```javascript
  const RANDOM_EVENTS = [
    { state: STATES.BUMPING,         weight: 2, duration: 1500 },
    { state: STATES.BLOWING_BUBBLES, weight: 3, duration: 2000 },
    { state: STATES.TURNING,         weight: 3, duration: 500 },
    { state: STATES.EATING,          weight: 1, duration: 2000 },
    { state: STATES.FORGETTING,      weight: 2, duration: 2000 },
  ];
  ```
- [ ] Step 3: Implement weighted random selection (roulette wheel)
- [ ] Step 4: Timer: next event in 10-30 seconds (uniform random), reset after each event
- [ ] Step 5: Only fire when state is IDLE (check `stateMachine.currentState === STATES.IDLE`)
- [ ] Step 6: Verify: fish randomly bumps glass, blows bubbles, turns around, etc.

**Files:** `desk-pet/app.js` (or `desk-pet/engine/state-machine.js`)

---

## Task 10: Click/touch interaction

**Goal:** User can click/tap the fish for reactions.

- [ ] Step 1: Add click event listener on canvas in `app.js`:
  - Convert click coordinates to canvas logical coordinates (accounting for DPI scaling)
  - Check if click is within fish hitbox (circle around fish position, radius ~64px at rendered scale)
- [ ] Step 2: Implement single click → WIGGLING:
  - On click on fish, transition to WIGGLING (priority 3)
  - Duration: 1 second
- [ ] Step 3: Implement double-click → EXCITED:
  - Track click timing (two clicks within 300ms)
  - Transition to EXCITED (priority 3)
  - Duration: 1.5 seconds
- [ ] Step 4: Implement long-press → HAPPY:
  - Track pointerdown → pointereup timing
  - If held > 500ms, transition to HAPPY
  - Duration: 2 seconds
- [ ] Step 5: Implement click on water (not fish) → ripple:
  - If click is within bowl bounds but not on fish
  - Trigger a small ripple animation at click point (canvas-drawn expanding circle)
  - Ripples fade out over 0.5 seconds
- [ ] Step 6: Touch support:
  - Use `pointer` events (works for both mouse and touch)
  - Prevent default touch behaviors (scroll, zoom) on canvas
  - Test on mobile viewport
- [ ] Step 7: Verify: all three interaction types work, touch works on mobile

**Files:** `desk-pet/app.js`

---

## Task 11: Compose the full render pipeline

**Goal:** Wire everything together into a clean render loop.

- [ ] Step 1: Refactor `app.js` into clean initialization:
  ```javascript
  // 1. Create canvas manager
  // 2. Create bowl
  // 3. Create bubble system
  // 4. Load sprite sheet
  // 5. Create sprite animator
  // 6. Create state machine
  // 7. Create movement
  // 8. Setup click handlers
  // 9. Start render loop
  ```
- [ ] Step 2: Implement layered render order in the loop:
  ```javascript
  function render(dt) {
    canvas.clear();
    bowl.render(ctx);           // Layer 0: bowl background
    bowl.renderWaterSurface(ctx, time);  // Layer 1: wave
    bubbles.update(dt);
    bubbles.render(ctx);        // Layer 2: ambient bubbles
    movement.update(dt);
    stateMachine.update(dt);
    renderFish(ctx);            // Layer 3: fish sprite
    // Layer 4: speech bubble (Phase 2)
    bowl.renderGlass(ctx);      // Layer 5: glass reflection
  }
  ```
- [ ] Step 3: Implement `renderFish()`:
  - Get current frame from sprite animator
  - Draw at fish position (from movement)
  - Scale from 16x16 to render size (128x128 or responsive)
  - Flip horizontally if `movement.facingRight` is false
  - Use `ctx.drawImage()` with source rect from sprite frame
  - Ensure nearest-neighbor: `ctx.imageSmoothingEnabled = false`
- [ ] Step 4: Handle DPI and responsive sizing:
  - Bowl size = percentage of viewport (not fixed pixels)
  - Fish render size scales with bowl
  - All coordinates relative to bowl dimensions
- [ ] Step 5: Verify: full scene renders - bowl + bubbles + swimming fish + glass. Fish animates, moves, direction flips work.

**Files:** `desk-pet/app.js`

---

## Task 12: Inactivity → sleep state

**Goal:** Fish falls asleep after extended inactivity.

- [ ] Step 1: Track last interaction time (click, message, page focus)
- [ ] Step 2: In update loop, check if `(now - lastInteraction) > 5 minutes`
- [ ] Step 3: If threshold exceeded and state is IDLE:
  - Transition to SLEEPING (priority 0, indefinite duration)
  - Fish drifts to bottom-center of bowl (movement target override)
  - Movement speed slows to near-zero
- [ ] Step 4: Wake up on any interaction:
  - Click, message, or page visibility change → transition back to IDLE
  - Reset last interaction timer
  - Brief EXCITED or WIGGLING transition before returning to normal swim
- [ ] Step 5: Sleeping animation: fish near bottom, slow fin movement, subtle "Zzz" text or Z bubbles drawn in canvas
- [ ] Step 6: Verify: leave page idle for 5 min, fish sleeps. Click → wakes up.

**Files:** `desk-pet/app.js` or `desk-pet/engine/state-machine.js`

---

## Task 13: Loading screen and status

**Goal:** Show loading state while assets load, graceful error handling.

- [ ] Step 1: Implement loading sequence in `app.js`:
  ```
  1. "loading bowl..." → canvas setup
  2. "finding the fish..." → sprite sheet load
  3. "glub!" → ready
  ```
- [ ] Step 2: Show status text centered on canvas (not DOM overlay):
  - Simple white text on dark blue background
  - Rendered via canvas fillText
  - Updates as each step completes
- [ ] Step 3: Error handling:
  - If sprite sheet fails to load: show error on canvas
  - If canvas context not available: show DOM fallback message
- [ ] Step 4: Hide DOM input until fully loaded (Phase 2 enables it)
- [ ] Step 5: Verify: reload page, see loading sequence, then bowl appears

**Files:** `desk-pet/app.js`

---

## Task 14: Mobile viewport and touch polish

**Goal:** Make the desk pet work well on mobile devices.

- [ ] Step 1: Set proper viewport meta:
  - `<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no">`
  - Prevent zoom on double-tap (which conflicts with our double-tap handler)
- [ ] Step 2: Handle touch events properly:
  - `touch-action: none` on canvas CSS
  - Prevent default on touchstart/touchmove to avoid scroll
  - Handle both mouse and touch via pointer events
- [ ] Step 3: Responsive bowl sizing:
  - Portrait: bowl fills width with padding
  - Landscape: bowl fills height
  - Maintain aspect ratio
- [ ] Step 4: Test at common mobile sizes (375x667, 390x844, 414x896)
- [ ] Step 5: Verify on actual mobile device or Chrome DevTools mobile emulation

**Files:** `desk-pet/index.html`, `desk-pet/style.css`, `desk-pet/app.js`

---

## Task 15: Phase 1 integration test and cleanup

**Goal:** Full verification that all Phase 1 components work together.

- [ ] Step 1: Manual test checklist:
  - [ ] Bowl renders with water, gravel, plants, glass reflection
  - [ ] Water surface animates (gentle wave)
  - [ ] Ambient bubbles rise and respawn
  - [ ] Fish swims smoothly within bowl bounds
  - [ ] Fish flips direction when changing target
  - [ ] Fish sprite animates (frame changes visible)
  - [ ] Single click on fish → wiggle reaction
  - [ ] Double click on fish → excited reaction
  - [ ] Long press on fish → happy reaction
  - [ ] Click on water → ripple effect
  - [ ] Random events fire (bump glass, bubble blow, etc.)
  - [ ] After 5 min inactivity → fish sleeps
  - [ ] Click sleeping fish → wakes up
  - [ ] Responsive: works on mobile viewport
  - [ ] No console errors
  - [ ] No jank (60fps canvas, smooth movement)
- [ ] Step 2: Clean up any debug code (console.logs, test circles)
- [ ] Step 3: Ensure all files have JSDoc on public classes/functions
- [ ] Step 4: Commit: `feat(desk-pet): phase 1 core engine complete`

**Files:** All desk-pet/ files

---

## Phase 1 Exit Criteria

1. Bowl renders with full environment (water, gravel, plants, bubbles, glass)
2. Fish swims with smooth movement, stays in bounds, flips direction
3. All 12 sprite states play correct animations
4. Click interactions work (single, double, long-press)
5. Random events fire periodically
6. Sleep state triggers after inactivity
7. Mobile-responsive layout
8. Zero console errors
9. Consistent 60fps render (no frame drops on desktop)

---

*End of Phase 1 plan. After completion, proceed to [`2026-04-10-deskpet-phase-2-intelligence.md`](2026-04-10-deskpet-phase-2-intelligence.md).*

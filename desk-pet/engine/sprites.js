/**
 * Procedural pixel-art goldfish renderer.
 * Draws a 16x16 goldfish directly on an offscreen canvas for each animation frame,
 * then scales up with nearest-neighbor for authentic pixel art.
 *
 * The fish is drawn procedurally (not from a PNG sprite sheet) so we can iterate
 * on the look easily. Swap in a real sprite sheet later by replacing this module.
 */

const CELL = 16;

// Color palette
const C = {
  _:  null,                  // transparent
  B:  '#ff8b3d',             // body orange
  D:  '#d45a1a',             // dark orange (outline)
  L:  '#ffb870',             // light orange (belly)
  T:  '#ff6b2d',             // tail / fins
  Td: '#cc4a10',             // tail dark
  E:  '#1a1a1a',             // eye
  W:  '#ffffff',             // eye highlight
  M:  '#cc3300',             // mouth
};

/**
 * Draw a single pixel on the offscreen context.
 * @param {CanvasRenderingContext2D} px - 16x16 offscreen context
 * @param {number} x
 * @param {number} y
 * @param {string} color
 */
function dot(px, x, y, color) {
  if (!color) return;
  px.fillStyle = color;
  px.fillRect(x, y, 1, 1);
}

/**
 * Draw the base goldfish body (facing right).
 * Returns pixel data on a 16x16 offscreen canvas.
 */
function drawBody(px, opts = {}) {
  const { mouthOpen = false, eyeOpen = true, bellyHighlight = true } = opts;

  // Body outline + fill
  // Row by row, the goldfish (facing right, centered)
  //   tail on left (cols 1-3), body (cols 4-12), head right (cols 10-13)

  // Outline
  const outline = [
    // [x, y]
    [5,3],[6,3],[7,3],[8,3],[9,3],
    [4,4],[10,4],[11,4],
    [3,5],[11,5],[12,5],
    [3,6],[12,6],[13,6],
    [3,7],[13,7],
    [3,8],[13,8],
    [3,9],[13,9],
    [3,10],[12,10],[13,10],
    [3,11],[11,11],[12,11],
    [4,12],[10,12],[11,12],
    [5,13],[6,13],[7,13],[8,13],[9,13],
  ];
  for (const [x, y] of outline) dot(px, x, y, C.D);

  // Body fill
  const bodyFill = [
    [5,4],[6,4],[7,4],[8,4],[9,4],
    [4,5],[5,5],[6,5],[7,5],[8,5],[9,5],[10,5],[11,5],
    [4,6],[5,6],[6,6],[7,6],[8,6],[9,6],[10,6],[11,6],[12,6],
    [4,7],[5,7],[6,7],[7,7],[8,7],[9,7],[10,7],[11,7],[12,7],
    [4,8],[5,8],[6,8],[7,8],[8,8],[9,8],[10,8],[11,8],[12,8],
    [4,9],[5,9],[6,9],[7,9],[8,9],[9,9],[10,9],[11,9],[12,9],
    [4,10],[5,10],[6,10],[7,10],[8,10],[9,10],[10,10],[11,10],[12,10],
    [4,11],[5,11],[6,11],[7,11],[8,11],[9,11],[10,11],
    [5,12],[6,12],[7,12],[8,12],[9,12],
  ];
  for (const [x, y] of bodyFill) dot(px, x, y, C.B);

  // Belly (lighter)
  if (bellyHighlight) {
    const belly = [
      [6,9],[7,9],[8,9],[9,9],
      [5,10],[6,10],[7,10],[8,10],[9,10],[10,10],
      [6,11],[7,11],[8,11],[9,11],
      [6,12],[7,12],[8,12],
    ];
    for (const [x, y] of belly) dot(px, x, y, C.L);
  }

  // Eye
  if (eyeOpen) {
    dot(px, 10, 6, C.E);
    dot(px, 11, 6, C.E);
    dot(px, 10, 7, C.E);
    dot(px, 11, 7, C.E);
    dot(px, 11, 6, C.W); // highlight
  } else {
    // Closed eye (sleeping) - horizontal line
    dot(px, 10, 7, C.E);
    dot(px, 11, 7, C.E);
  }

  // Mouth
  if (mouthOpen) {
    dot(px, 13, 8, C.M);
    dot(px, 13, 9, C.M);
  }

  // Dorsal fin
  dot(px, 7, 2, C.T);
  dot(px, 8, 2, C.T);
  dot(px, 6, 3, C.T);
}

/**
 * Draw the tail at a specific vertical offset (for animation).
 * @param {number} yOffset - -1, 0, or 1 for tail position
 */
function drawTail(px, yOffset = 0) {
  const by = 7 + yOffset;
  // Tail fork shape
  dot(px, 1, by - 2, C.T);
  dot(px, 0, by - 3, C.T);
  dot(px, 0, by - 2, C.Td);
  dot(px, 1, by - 1, C.T);
  dot(px, 2, by - 1, C.T);
  dot(px, 2, by, C.T);
  dot(px, 2, by + 1, C.T);
  dot(px, 1, by + 1, C.T);
  dot(px, 1, by + 2, C.T);
  dot(px, 0, by + 2, C.Td);
  dot(px, 0, by + 3, C.T);

  // Connection to body
  dot(px, 3, by - 1, C.D);
  dot(px, 3, by, C.B);
  dot(px, 3, by + 1, C.D);
}

/**
 * Draw pectoral fin (small, on the side of the body).
 */
function drawPectoralFin(px, frame = 0) {
  const fy = frame % 2 === 0 ? 0 : 1;
  dot(px, 7, 13 + fy, C.T);
  dot(px, 8, 13 + fy, C.T);
  dot(px, 8, 14 + fy, C.Td);
}

// ============================================================
// Frame generators for each animation state
// ============================================================

function frame_idle(px, frameIdx) {
  const tailOffsets = [0, -1, 0, 1];
  drawBody(px);
  drawTail(px, tailOffsets[frameIdx]);
  drawPectoralFin(px, frameIdx);
}

function frame_talk(px, frameIdx) {
  const mouthOpen = frameIdx % 2 === 0;
  drawBody(px, { mouthOpen });
  drawTail(px, frameIdx % 2 === 0 ? -1 : 1);
  drawPectoralFin(px, frameIdx);
}

function frame_happy(px, frameIdx) {
  // Body bounces up
  px.save();
  const bounce = frameIdx % 2 === 0 ? -1 : 0;
  px.translate(0, bounce);
  drawBody(px);
  drawTail(px, frameIdx % 2 === 0 ? -1 : 1);
  drawPectoralFin(px, frameIdx);
  px.restore();

  // Sparkle
  if (frameIdx === 0 || frameIdx === 2) {
    dot(px, 13, 3, C.W);
    dot(px, 14, 4, C.W);
  }
}

function frame_sad(px, frameIdx) {
  // Body sinks down slightly
  px.save();
  px.translate(0, 1);
  drawBody(px);
  drawTail(px, 0); // limp tail
  px.restore();
}

function frame_sleep(px, frameIdx) {
  drawBody(px, { eyeOpen: false });
  drawTail(px, 0);
  // Z bubbles
  const zPos = [[12, 3], [13, 2], [14, 1]];
  const showZ = frameIdx;
  for (let i = 0; i <= Math.min(showZ, 2); i++) {
    dot(px, zPos[i][0], zPos[i][1], '#7bb8e0');
    if (i < 2) dot(px, zPos[i][0] + 1, zPos[i][1], '#7bb8e0');
  }
}

function frame_eat(px, frameIdx) {
  const mouthOpen = frameIdx < 2;
  drawBody(px, { mouthOpen });
  drawTail(px, frameIdx % 2 === 0 ? 0 : 1);
  drawPectoralFin(px, frameIdx);
  // Food pellet
  if (frameIdx === 0) {
    dot(px, 14, 7, '#8B4513');
    dot(px, 14, 8, '#8B4513');
  }
}

function frame_bump(px, frameIdx) {
  // Squish against right side
  const squish = frameIdx < 2 ? 1 : 0;
  px.save();
  if (squish) px.translate(1, 0);
  drawBody(px);
  drawTail(px, frameIdx === 1 ? -1 : (frameIdx === 2 ? 1 : 0));
  drawPectoralFin(px, frameIdx);
  px.restore();
  // Impact stars
  if (frameIdx === 0 || frameIdx === 1) {
    dot(px, 14, 6, C.W);
    dot(px, 15, 8, C.W);
    dot(px, 14, 10, C.W);
  }
}

function frame_forget(px, frameIdx) {
  drawBody(px);
  drawTail(px, 0);
  drawPectoralFin(px, frameIdx);
  // Question mark
  if (frameIdx >= 1) {
    // ?
    dot(px, 12, 1, '#7bb8e0');
    dot(px, 13, 1, '#7bb8e0');
    dot(px, 14, 1, '#7bb8e0');
    dot(px, 14, 2, '#7bb8e0');
    dot(px, 13, 3, '#7bb8e0');
    if (frameIdx >= 2) {
      dot(px, 13, 5, '#7bb8e0'); // dot of ?
    }
  }
}

function frame_excited(px, frameIdx) {
  // Rapid wiggle
  const offX = frameIdx % 2 === 0 ? -1 : 1;
  px.save();
  px.translate(offX, 0);
  drawBody(px);
  drawTail(px, frameIdx % 2 === 0 ? -1 : 1);
  drawPectoralFin(px, frameIdx);
  px.restore();
  // Exclamation mark
  dot(px, 13, 2, '#ffdd44');
  dot(px, 13, 3, '#ffdd44');
  dot(px, 13, 5, '#ffdd44');
}

function frame_wiggle(px, frameIdx) {
  const offX = [0, -1, 1][frameIdx] || 0;
  px.save();
  px.translate(offX, 0);
  drawBody(px);
  drawTail(px, frameIdx === 1 ? 1 : -1);
  drawPectoralFin(px, frameIdx);
  px.restore();
}

function frame_bubbleBlow(px, frameIdx) {
  drawBody(px, { mouthOpen: frameIdx < 3 });
  drawTail(px, 0);
  drawPectoralFin(px, frameIdx);
  // Growing bubble from mouth
  const sizes = [0, 1, 1.5, 2, 2.5];
  const r = sizes[frameIdx] || 0;
  if (r > 0) {
    const bx = 14;
    const by = 6 - frameIdx;
    px.strokeStyle = '#88ccee';
    px.lineWidth = 0.5;
    px.beginPath();
    px.arc(bx, by, r, 0, Math.PI * 2);
    px.stroke();
  }
}

function frame_turn(px, frameIdx) {
  // Transition frames: normal, slightly thinner, thin, flipped
  const scaleX = [1, 0.7, 0.3, 0.7][frameIdx] || 1;
  px.save();
  px.translate(8, 0);
  px.scale(scaleX, 1);
  px.translate(-8, 0);
  drawBody(px);
  drawTail(px, 0);
  drawPectoralFin(px, 0);
  px.restore();
}

// ============================================================
// Animation metadata
// ============================================================

const ANIMS = {
  idle_swim:     { fn: frame_idle,       frames: 4, fps: 5,  loop: true },
  talk:          { fn: frame_talk,       frames: 4, fps: 7,  loop: true },
  happy:         { fn: frame_happy,      frames: 4, fps: 7,  loop: true },
  sad:           { fn: frame_sad,        frames: 3, fps: 3,  loop: true },
  sleep:         { fn: frame_sleep,      frames: 4, fps: 1.5,loop: true },
  eat:           { fn: frame_eat,        frames: 4, fps: 5,  loop: false },
  bump_glass:    { fn: frame_bump,       frames: 4, fps: 5,  loop: false },
  forget:        { fn: frame_forget,     frames: 3, fps: 3,  loop: false },
  excited:       { fn: frame_excited,    frames: 4, fps: 9,  loop: true },
  wiggle:        { fn: frame_wiggle,     frames: 3, fps: 7,  loop: false },
  bubble_blow:   { fn: frame_bubbleBlow, frames: 5, fps: 4,  loop: false },
  turn_around:   { fn: frame_turn,       frames: 4, fps: 6,  loop: false },
};

// ============================================================
// SpriteEngine - renders and caches procedural frames
// ============================================================

export class SpriteEngine {
  constructor() {
    this._currentAnim = 'idle_swim';
    this._frameIdx = 0;
    this._elapsed = 0;
    this._finished = false;
    this._cache = new Map(); // "anim_frame" -> offscreen canvas
  }

  /**
   * Get or create a cached 16x16 offscreen canvas for a specific frame.
   * @returns {HTMLCanvasElement}
   */
  _getFrame(animName, frameIdx) {
    const key = `${animName}_${frameIdx}`;
    if (this._cache.has(key)) return this._cache.get(key);

    const off = document.createElement('canvas');
    off.width = CELL;
    off.height = CELL;
    const px = off.getContext('2d');
    px.imageSmoothingEnabled = false;
    px.clearRect(0, 0, CELL, CELL);

    const anim = ANIMS[animName];
    if (anim) anim.fn(px, frameIdx);

    this._cache.set(key, off);
    return off;
  }

  /** Switch to a different animation state. */
  play(stateName) {
    if (!ANIMS[stateName]) return;
    if (stateName === this._currentAnim) return;
    this._currentAnim = stateName;
    this._frameIdx = 0;
    this._elapsed = 0;
    this._finished = false;
  }

  /** Advance animation timer. */
  update(dt) {
    const anim = ANIMS[this._currentAnim];
    if (!anim || this._finished) return;

    this._elapsed += dt;
    const frameDuration = 1 / anim.fps;

    if (this._elapsed >= frameDuration) {
      this._elapsed -= frameDuration;
      this._frameIdx++;

      if (this._frameIdx >= anim.frames) {
        if (anim.loop) {
          this._frameIdx = 0;
        } else {
          this._frameIdx = anim.frames - 1;
          this._finished = true;
        }
      }
    }
  }

  /**
   * Render the current frame at the given position.
   * @param {CanvasRenderingContext2D} ctx - main canvas context
   * @param {number} x - center X
   * @param {number} y - center Y
   * @param {number} size - rendered size (e.g., 128)
   * @param {boolean} flipX - flip horizontally
   * @param {{ dx: number, dy: number } | null} [eyeLook] - normalized vector where the eye should look
   */
  render(ctx, x, y, size, flipX = false, eyeLook = null) {
    const frame = this._getFrame(this._currentAnim, this._frameIdx);
    const half = size / 2;

    ctx.save();
    ctx.imageSmoothingEnabled = false;
    ctx.translate(x, y);
    if (flipX) ctx.scale(-1, 1);
    ctx.drawImage(frame, -half, -half, size, size);
    ctx.restore();

    // Eye overlay with cursor tracking - only on states where the eye is open
    // and visible. Skip sleep/sad/some states.
    const eyeStates = ['idle_swim', 'talk', 'happy', 'excited', 'wiggle', 'bubble_blow', 'forget', 'bump_glass'];
    if (eyeLook && eyeStates.includes(this._currentAnim)) {
      this._renderEyeOverlay(ctx, x, y, size, flipX, eyeLook);
    }
  }

  /**
   * Draw an eye overlay with cursor tracking.
   * The base sprite has a 2x2 eye block at sprite coords (10-11, 6-7) with
   * the white highlight at (11, 6). We overdraw the whole eye area with
   * black (wiping the highlight) and place a 1 game-pixel white highlight
   * at a position that depends on the cursor direction - simulating the
   * eye looking at the cursor.
   *
   * When the fish is flipped (facing left), the eye is mirrored to
   * sprite coords (4-5, 6-7).
   */
  _renderEyeOverlay(ctx, x, y, size, flipX, eyeLook) {
    const pxScale = size / CELL;
    const pxSize = Math.max(1, Math.round(pxScale));

    // Eye block origin in sprite coords (2x2 block)
    // Facing right: eye at (10, 6). Facing left: mirrored to (4, 6).
    // Sprite center is at 8,8 so relative = (10-8, 6-8) = (2, -2) for right-facing
    const eyeLocalX = flipX ? (4 - 8) : (10 - 8);   // -4 or +2
    const eyeLocalY = 6 - 8;                         // -2

    // Canvas coords of eye top-left (first of the 2x2 block)
    const eyeX = Math.round(x + eyeLocalX * pxScale);
    const eyeY = Math.round(y + eyeLocalY * pxScale);

    // Draw 2x2 black block (wipes the white highlight)
    ctx.fillStyle = '#1a1a1a';
    ctx.fillRect(eyeX, eyeY, pxSize * 2, pxSize * 2);

    // Determine which corner gets the white highlight based on cursor direction
    // dx/dy are normalized (-1 to 1). When facing left, dx direction is flipped
    // in the sprite's local frame (because the sprite is mirrored).
    const localDx = flipX ? -eyeLook.dx : eyeLook.dx;
    const localDy = eyeLook.dy;

    // Pick corner: right half if localDx > 0, bottom half if localDy > 0
    // But we BIAS the default toward upper-right (as the base sprite shows)
    // Threshold for moving the pupil
    let hX = 1;  // default right
    let hY = 0;  // default top
    if (localDx < -0.25) hX = 0;
    else if (localDx > 0.25) hX = 1;
    if (localDy > 0.25) hY = 1;
    else if (localDy < -0.25) hY = 0;

    // Draw 1 game-pixel white highlight at the selected corner
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(eyeX + hX * pxSize, eyeY + hY * pxSize, pxSize, pxSize);
  }

  get currentAnimation() { return this._currentAnim; }
  get isFinished() { return this._finished; }
}

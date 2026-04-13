/**
 * GBA-style pixel-art fishbowl.
 *
 * Techniques: 8x8 tile patterns, ordered dithering, strict palette,
 * transition tiles, decorative details, caustic highlights.
 */

// ============================================================
// Dynamic palette - day/night cycle based on local time
// ============================================================
// 4 anchor palettes. Render blends between them based on hour.
// Water + bg + glass + foam change; gravel/plants/rocks stay static.

const PALETTES = {
  morning: { // 6-10: bright cool blue
    bg: '#0a1628', bgL: '#0e1a30',
    w1: '#4aacc8', w2: '#3c98b4', w3: '#3084a0', w4: '#24708c', w5: '#1c5c78', w6: '#144864',
    ws: '#5ac0dc', wd: '#0e3848',
    gl: '#164668', glH: '#3a98b8', glR: '#1c5478',
    foam: '#5ab4cc', foamH: '#7acce0',
  },
  day: { // 10-16: standard daylight (current palette)
    bg: '#080e1c', bgL: '#0c1428',
    w1: '#3690b0', w2: '#2c7c9c', w3: '#247088', w4: '#1c5e74', w5: '#164e64', w6: '#103e50',
    ws: '#48a8c8', wd: '#0c3040',
    gl: '#14384e', glH: '#2a6884', glR: '#1c4c66',
    foam: '#4aa0be', foamH: '#68bcd8',
  },
  evening: { // 16-20: warm golden-sunset tint
    bg: '#140e1c', bgL: '#181428',
    w1: '#4c7ca0', w2: '#406c8c', w3: '#345c78', w4: '#284c64', w5: '#1e3e54', w6: '#123044',
    ws: '#5e90b4', wd: '#0c2c40',
    gl: '#16304a', glH: '#3a5e7e', glR: '#1c425e',
    foam: '#4c84a8', foamH: '#649cc0',
  },
  night: { // 20-6: deep dark moody blue
    bg: '#04080f', bgL: '#060a18',
    w1: '#1e4664', w2: '#163c58', w3: '#12324c', w4: '#0e2a40', w5: '#0a2234', w6: '#061828',
    ws: '#2c688c', wd: '#04162a',
    gl: '#0a1e38', glH: '#1c4670', glR: '#102844',
    foam: '#2e5e7e', foamH: '#407898',
  },
};

const STATIC_COLORS = {
  g1: '#6e5c3a', g2: '#5a4a2c', g3: '#826a48', g4: '#4a3c22', gH: '#96845c',
  sand: '#8a7a56', sandD: '#6a5c3a',
  p1: '#185828', p2: '#247838', p3: '#34a050', p4: '#1a6830',
  rock: '#3a3a44', rockL: '#4e4e58', rockD: '#2a2a32',
};

/** Blend two hex colors. t=0 -> a, t=1 -> b. */
function blendHex(a, b, t) {
  const pa = parseInt(a.slice(1), 16), pb = parseInt(b.slice(1), 16);
  const ar = (pa >> 16) & 255, ag = (pa >> 8) & 255, ab = pa & 255;
  const br = (pb >> 16) & 255, bg = (pb >> 8) & 255, bb = pb & 255;
  const r = Math.round(ar + (br - ar) * t);
  const g = Math.round(ag + (bg - ag) * t);
  const bl = Math.round(ab + (bb - ab) * t);
  return '#' + ((r << 16) | (g << 8) | bl).toString(16).padStart(6, '0');
}

/** Get blended palette based on current local hour. */
function getCurrentPalette() {
  const h = new Date().getHours() + new Date().getMinutes() / 60;
  let a, b, t;
  if (h >= 6 && h < 10) { a = PALETTES.morning; b = PALETTES.day; t = (h - 6) / 4; }
  else if (h >= 10 && h < 16) { a = PALETTES.day; b = PALETTES.day; t = 0; }
  else if (h >= 16 && h < 20) { a = PALETTES.day; b = PALETTES.evening; t = (h - 16) / 4; }
  else if (h >= 20 && h < 22) { a = PALETTES.evening; b = PALETTES.night; t = (h - 20) / 2; }
  else if (h >= 22 || h < 4)  { a = PALETTES.night; b = PALETTES.night; t = 0; }
  else                         { a = PALETTES.night; b = PALETTES.morning; t = (h - 4) / 2; }

  const out = {};
  for (const k in a) out[k] = t === 0 ? a[k] : blendHex(a[k], b[k], t);
  return { ...out, ...STATIC_COLORS };
}

// Live palette, recomputed in render() so day/night cycles while open.
let P = { ...PALETTES.day, ...STATIC_COLORS };

// ============================================================
// Water tiles - richer pattern with diagonal waves + highlights
// ============================================================
// Shallow water (indices 1-3 -> w1, w2, w3)
const SHALLOW_A = [
  [1,1,2,2,2,1,1,2],
  [1,2,2,2,1,1,2,2],
  [2,2,2,3,2,1,2,3],
  [2,2,3,3,2,2,3,3],
  [2,3,3,2,2,3,3,2],
  [3,3,2,2,3,3,2,2],
  [3,2,2,1,3,2,2,1],
  [2,2,1,1,2,2,1,1],
];
const SHALLOW_B = [
  [2,1,1,2,2,1,1,2],
  [2,2,1,1,2,2,1,1],
  [2,2,2,1,2,2,2,1],
  [3,2,2,2,3,2,2,2],
  [3,3,2,2,3,3,2,2],
  [2,3,3,2,2,3,3,2],
  [2,2,3,3,2,2,3,3],
  [1,2,2,3,1,2,2,3],
];

// Mid water (indices 2-4 -> w2, w3, w4)
const MID_A = [
  [2,2,3,3,3,2,2,3],
  [2,3,3,3,2,2,3,3],
  [3,3,3,4,3,2,3,4],
  [3,3,4,4,3,3,4,4],
  [3,4,4,3,3,4,4,3],
  [4,4,3,3,4,4,3,3],
  [4,3,3,2,4,3,3,2],
  [3,3,2,2,3,3,2,2],
];
const MID_B = [
  [3,2,2,3,3,2,2,3],
  [3,3,2,2,3,3,2,2],
  [3,3,3,2,3,3,3,2],
  [4,3,3,3,4,3,3,3],
  [4,4,3,3,4,4,3,3],
  [3,4,4,3,3,4,4,3],
  [3,3,4,4,3,3,4,4],
  [2,3,3,4,2,3,3,4],
];

// Deep water (indices 4-6 -> w4, w5, w6)
const DEEP_A = [
  [4,4,5,5,5,4,4,5],
  [4,5,5,5,4,4,5,5],
  [5,5,5,6,5,4,5,6],
  [5,5,6,6,5,5,6,6],
  [5,6,6,5,5,6,6,5],
  [6,6,5,5,6,6,5,5],
  [6,5,5,4,6,5,5,4],
  [5,5,4,4,5,5,4,4],
];
const DEEP_B = [
  [5,4,4,5,5,4,4,5],
  [5,5,4,4,5,5,4,4],
  [5,5,5,4,5,5,5,4],
  [6,5,5,5,6,5,5,5],
  [6,6,5,5,6,6,5,5],
  [5,6,6,5,5,6,6,5],
  [5,5,6,6,5,5,6,6],
  [4,5,5,6,4,5,5,6],
];

let W = [null, P.w1, P.w2, P.w3, P.w4, P.w5, P.w6];

// Gravel tile
const GR = [
  [1,2,1,3,2,1,2,1],
  [3,1,2,1,1,3,1,2],
  [1,1,3,2,3,1,2,1],
  [2,3,1,1,2,1,3,2],
  [1,2,2,3,1,2,1,1],
  [3,1,1,2,1,3,2,3],
  [2,1,3,1,2,1,1,2],
  [1,2,1,2,3,2,3,1],
];
const GC = [null, P.g1, P.g2, P.g3, P.g4]; // gravel is static

// ============================================================
// Bowl class
// ============================================================
export class Bowl {
  constructor(canvas) {
    this._canvas = canvas;
    this._time = 0;
    this._frame = 0;
    this._frameTimer = 0;
    // Offscreen cache for static/semi-static elements (water tiles +
    // bowl shape + gravel + rocks + glass). Rebuilt only when something
    // actually changes (resize, palette update, water frame swap).
    // Animated elements (plants, foam, caustics, highlights) still
    // render live every frame.
    this._bgCanvas = null;
    this._bgCtx = null;
    this._bgDirty = true;
    this._lastBgW = 0;
    this._lastBgH = 0;
    this._lastBgFrame = -1;
    this._paletteTimer = 0;
    this._paletteInit = false;
  }

  getBounds() {
    const w = this._canvas.width;
    const h = this._canvas.height;
    const size = Math.min(w, h);
    return {
      cx: Math.round(w / 2),
      cy: Math.round(h * 0.46),
      rx: Math.round(size * 0.44),
      ry: Math.round(size * 0.50),
    };
  }

  getSwimBounds() {
    const b = this.getBounds();
    return {
      cx: b.cx,
      cy: Math.round(b.cy - b.ry * 0.02),
      rx: Math.round(b.rx * 0.72),
      ry: Math.round(b.ry * 0.60),
    };
  }

  isInSwimBounds(x, y) {
    const s = this.getSwimBounds();
    return ((x - s.cx) / s.rx) ** 2 + ((y - s.cy) / s.ry) ** 2 < 1;
  }

  distFromEdge(x, y) {
    const s = this.getSwimBounds();
    return 1 - Math.sqrt(((x - s.cx) / s.rx) ** 2 + ((y - s.cy) / s.ry) ** 2);
  }

  _inBowl(x, y, b) {
    return ((x - b.cx) / b.rx) ** 2 + ((y - b.cy) / b.ry) ** 2 <= 1;
  }

  _dist(x, y, b) {
    return Math.sqrt(((x - b.cx) / b.rx) ** 2 + ((y - b.cy) / b.ry) ** 2);
  }

  _depth(y, b) {
    return Math.max(0, Math.min(1, (y - (b.cy - b.ry * 0.85)) / (b.ry * 1.7)));
  }

  render(ctx, dt) {
    this._time += dt;
    this._frameTimer += dt;
    if (this._frameTimer > 0.6) {
      this._frameTimer -= 0.6;
      this._frame = 1 - this._frame;
      this._bgDirty = true; // water tiles changed
    }

    // Update palette every ~2 seconds based on time of day (day/night cycle)
    this._paletteTimer += dt;
    if (this._paletteTimer > 2 || !this._paletteInit) {
      this._paletteTimer = 0;
      this._paletteInit = true;
      const newP = getCurrentPalette();
      // Check if palette actually changed before invalidating cache
      if (!P || newP.w1 !== P.w1 || newP.bg !== P.bg) {
        P = newP;
        W = [null, P.w1, P.w2, P.w3, P.w4, P.w5, P.w6];
        this._bgDirty = true;
      }
    }

    const w = this._canvas.width;
    const h = this._canvas.height;

    // Re-init offscreen bg canvas on resize
    if (!this._bgCanvas || this._lastBgW !== w || this._lastBgH !== h) {
      this._bgCanvas = document.createElement('canvas');
      this._bgCanvas.width = w;
      this._bgCanvas.height = h;
      this._bgCtx = this._bgCanvas.getContext('2d');
      this._bgCtx.imageSmoothingEnabled = false;
      this._lastBgW = w;
      this._lastBgH = h;
      this._bgDirty = true;
    }

    const b = this.getBounds();

    // Rebuild bg cache only when dirty (resize, palette change, or frame swap)
    if (this._bgDirty) {
      this._rebuildBgCache(w, h, b);
      this._bgDirty = false;
    }

    // Blit the cached background every frame (cheap)
    ctx.drawImage(this._bgCanvas, 0, 0);

    // ---- Live per-frame elements (animated, cheap) ----

    // Caustic light on gravel (animated)
    this._renderCaustics(ctx, b);

    // Plants (animated sway)
    this._renderPlant(ctx, b.cx - Math.round(b.rx * 0.50), b.cy + Math.round(b.ry * 0.70), 20, 0);
    this._renderPlant(ctx, b.cx + Math.round(b.rx * 0.44), b.cy + Math.round(b.ry * 0.74), 15, 1);
    this._renderPlant(ctx, b.cx - Math.round(b.rx * 0.10), b.cy + Math.round(b.ry * 0.78), 10, 2);
    this._renderPlant(ctx, b.cx + Math.round(b.rx * 0.15), b.cy + Math.round(b.ry * 0.76), 12, 3);

    // Surface foam (animated)
    this._renderSurface(ctx, b);

    // Animated glass highlights (moving specular spots)
    this._renderHighlights(ctx, b);
  }

  /**
   * Build the cached background canvas. Called only on resize, palette
   * change, or water frame swap - NOT every frame.
   */
  _rebuildBgCache(w, h, b) {
    const ctx = this._bgCtx;
    ctx.clearRect(0, 0, w, h);

    // Background with subtle vertical gradient feel (dithered)
    for (let y = 0; y < h; y++) {
      ctx.fillStyle = (y % 2 === 0) ? P.bg : P.bgL;
      ctx.fillRect(0, y, w, 1);
    }

    // Water tiles (the expensive part - 40K fillRects worth)
    this._renderWater(ctx, b);

    // Edge shadow
    this._renderEdgeShadow(ctx, b);

    // Gravel
    this._renderGravel(ctx, b);

    // Decorative rocks
    this._renderRocks(ctx, b);

    // Castle (double-tower fortress, classic fishtank decoration)
    this._renderCastle(ctx, b);

    // Glass bowl border
    this._renderGlass(ctx, b);

    // Top rim highlight (static)
    this._renderRim(ctx, b);
  }

  _renderWater(ctx, b) {
    const sA = this._frame === 0 ? SHALLOW_A : SHALLOW_B;
    const mA = this._frame === 0 ? MID_A : MID_B;
    const dA = this._frame === 0 ? DEEP_A : DEEP_B;

    const top = b.cy - b.ry;
    const bot = b.cy + b.ry;
    const left = b.cx - b.rx;
    const right = b.cx + b.rx;

    for (let y = top; y < bot; y++) {
      for (let x = left; x < right; x++) {
        const d = this._dist(x, y, b);
        if (d > 0.97) continue;

        const depth = this._depth(y, b);
        const tx = ((x % 8) + 8) % 8;
        const ty = ((y % 8) + 8) % 8;

        let ci;
        if (depth < 0.30) {
          ci = sA[ty][tx];
        } else if (depth < 0.55) {
          ci = mA[ty][tx];
        } else {
          ci = dA[ty][tx];
        }

        ctx.fillStyle = W[ci];
        ctx.fillRect(x, y, 1, 1);
      }
    }
  }

  _renderEdgeShadow(ctx, b) {
    // Darken pixels near the bowl edge (glass refraction shadow)
    const top = b.cy - b.ry;
    const bot = b.cy + b.ry;
    const left = b.cx - b.rx;
    const right = b.cx + b.rx;

    ctx.fillStyle = P.wd;
    for (let y = top; y < bot; y++) {
      for (let x = left; x < right; x++) {
        const d = this._dist(x, y, b);
        if (d > 0.88 && d <= 0.97) {
          // Dithered shadow - only some pixels
          if ((x + y) % 3 === 0) {
            ctx.fillRect(x, y, 1, 1);
          }
        }
      }
    }
  }

  _renderGravel(ctx, b) {
    const gTop = b.cy + Math.round(b.ry * 0.76);
    const gBot = b.cy + b.ry;

    for (let y = gTop; y < gBot; y++) {
      const dy = (y - b.cy) / b.ry;
      const span = Math.sqrt(Math.max(0, 1 - dy * dy)) * b.rx;
      const x0 = Math.round(b.cx - span) + 2;
      const x1 = Math.round(b.cx + span) - 2;

      for (let x = x0; x < x1; x++) {
        const tx = ((x % 8) + 8) % 8;
        const ty = ((y % 8) + 8) % 8;
        ctx.fillStyle = GC[GR[ty][tx]];
        ctx.fillRect(x, y, 1, 1);
      }
    }

    // Sand transition (dithered top edge)
    for (let row = 0; row < 3; row++) {
      const y = gTop - row;
      const dy = (y - b.cy) / b.ry;
      const span = Math.sqrt(Math.max(0, 1 - dy * dy)) * b.rx;
      const x0 = Math.round(b.cx - span) + 3;
      const x1 = Math.round(b.cx + span) - 3;
      for (let x = x0; x < x1; x++) {
        if ((x + y + row) % (row + 2) === 0) {
          ctx.fillStyle = row === 0 ? P.sand : P.sandD;
          ctx.fillRect(x, y, 1, 1);
        }
      }
    }

    // Highlight pebbles (scattered bright spots)
    let seed = 99;
    const rand = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
    ctx.fillStyle = P.gH;
    for (let i = 0; i < 12; i++) {
      const rx = rand();
      const ry = rand();
      const py = gTop + Math.round(ry * (gBot - gTop - 3));
      const dy = (py - b.cy) / b.ry;
      const span = Math.sqrt(Math.max(0, 1 - dy * dy)) * b.rx;
      const px = Math.round(b.cx - span + rx * span * 2) ;
      ctx.fillRect(px, py, 1, 1);
    }
  }

  _renderCaustics(ctx, b) {
    // Animated light patterns on the gravel (refracted light through water)
    const gTop = b.cy + Math.round(b.ry * 0.72);
    const gBot = b.cy + Math.round(b.ry * 0.82);
    ctx.fillStyle = P.ws;

    for (let y = gTop; y < gBot; y++) {
      const dy = (y - b.cy) / b.ry;
      const span = Math.sqrt(Math.max(0, 1 - dy * dy)) * b.rx;
      const x0 = Math.round(b.cx - span) + 5;
      const x1 = Math.round(b.cx + span) - 5;

      for (let x = x0; x < x1; x++) {
        const v = Math.sin(x * 0.3 + this._time * 1.2) + Math.sin(y * 0.4 - this._time * 0.8);
        if (v > 1.5 && (x + y) % 2 === 0) {
          ctx.fillRect(x, y, 1, 1);
        }
      }
    }
  }

  _renderRocks(ctx, b) {
    // Small decorative rocks on the gravel
    const gY = b.cy + Math.round(b.ry * 0.78);
    this._drawRock(ctx, b.cx - Math.round(b.rx * 0.28), gY, 4, 3);
    this._drawRock(ctx, b.cx + Math.round(b.rx * 0.30), gY + 1, 3, 2);
  }

  _drawRock(ctx, x, y, w, h) {
    // Top
    ctx.fillStyle = P.rockL;
    ctx.fillRect(x + 1, y, w - 2, 1);
    // Body
    ctx.fillStyle = P.rock;
    ctx.fillRect(x, y + 1, w, h - 2);
    ctx.fillRect(x + 1, y, w - 2, h);
    // Bottom shadow
    ctx.fillStyle = P.rockD;
    ctx.fillRect(x + 1, y + h - 1, w - 2, 1);
    // Highlight pixel
    ctx.fillStyle = P.rockL;
    ctx.fillRect(x + 1, y + 1, 1, 1);
  }

  _renderPlant(ctx, baseX, baseY, height, variant) {
    const sway = Math.round(Math.sin(this._time * 0.6 + variant * 2.1) * 1.8);
    const colors = [
      [P.p1, P.p2, P.p3],
      [P.p4, P.p3, P.p2],
      [P.p2, P.p1, P.p3],
      [P.p1, P.p3, P.p4],
    ][variant % 4];

    // Stalk
    for (let i = 0; i < height; i++) {
      const t = i / height;
      const sx = Math.round(sway * t);
      ctx.fillStyle = colors[0];
      ctx.fillRect(baseX + sx, baseY - i, 1, 1);
      // Thicker base
      if (t < 0.3) {
        ctx.fillRect(baseX + sx + 1, baseY - i, 1, 1);
      }
    }

    // Leaves
    const leafCount = Math.max(2, Math.floor(height / 4));
    for (let j = 0; j < leafCount; j++) {
      const t = 0.2 + (j / leafCount) * 0.7;
      const ly = baseY - Math.round(height * t);
      const sx = Math.round(sway * t);
      const dir = j % 2 === 0 ? 1 : -1;
      const leafLen = 2 + Math.min(3, Math.floor(height * 0.2));

      ctx.fillStyle = colors[1 + (j % 2)];
      for (let k = 1; k <= leafLen; k++) {
        ctx.fillRect(baseX + sx + dir * k, ly, 1, 1);
        if (k > 1 && k < leafLen) {
          ctx.fillRect(baseX + sx + dir * k, ly - 1, 1, 1);
        }
      }
      // Leaf tip
      ctx.fillStyle = colors[2];
      ctx.fillRect(baseX + sx + dir * leafLen, ly, 1, 1);
    }

    // Top tuft
    const topSx = Math.round(sway);
    ctx.fillStyle = colors[2];
    ctx.fillRect(baseX + topSx - 1, baseY - height, 1, 1);
    ctx.fillRect(baseX + topSx + 1, baseY - height, 1, 1);
    ctx.fillRect(baseX + topSx, baseY - height - 1, 1, 1);
  }

  _renderGlass(ctx, b) {
    // 2px glass border
    const step = 0.012;
    for (let a = 0; a < Math.PI * 2; a += step) {
      const ca = Math.cos(a);
      const sa = Math.sin(a);
      // Outer edge (darker)
      ctx.fillStyle = P.gl;
      ctx.fillRect(Math.round(b.cx + ca * (b.rx + 1)), Math.round(b.cy + sa * (b.ry + 1)), 1, 1);
      // Inner edge (slightly lighter)
      ctx.fillStyle = P.glR;
      ctx.fillRect(Math.round(b.cx + ca * b.rx), Math.round(b.cy + sa * b.ry), 1, 1);
    }
  }

  _renderSurface(ctx, b) {
    const surfY = b.cy - Math.round(b.ry * 0.86);
    const dy = (surfY - b.cy) / b.ry;
    const span = Math.sqrt(Math.max(0, 1 - dy * dy)) * b.rx;
    const x0 = Math.round(b.cx - span) + 3;
    const x1 = Math.round(b.cx + span) - 3;

    for (let x = x0; x < x1; x++) {
      const wave = Math.round(Math.sin(x * 0.18 + this._time * 1.8) * 0.7);
      // Main foam line
      if ((x + this._frame) % 2 === 0) {
        ctx.fillStyle = P.foam;
        ctx.fillRect(x, surfY + wave, 1, 1);
      }
      // Bright highlight spots
      if ((x + this._frame * 3) % 7 === 0) {
        ctx.fillStyle = P.foamH;
        ctx.fillRect(x, surfY + wave - 1, 1, 1);
      }
    }
  }

  _renderHighlights(ctx, b) {
    // Glass shine arcs (left side)
    ctx.fillStyle = P.glH;
    for (let a = -2.1; a < -0.9; a += 0.035) {
      const px = Math.round(b.cx + Math.cos(a) * (b.rx - 3));
      const py = Math.round(b.cy + Math.sin(a) * (b.ry - 3));
      ctx.fillRect(px, py, 1, 1);
    }
    // Shorter inner highlight
    for (let a = -1.9; a < -1.2; a += 0.05) {
      const px = Math.round(b.cx + Math.cos(a) * (b.rx - 5));
      const py = Math.round(b.cy + Math.sin(a) * (b.ry - 5));
      ctx.fillRect(px, py, 1, 1);
    }

    // Specular water highlights (animated, scattered)
    ctx.fillStyle = P.ws;
    for (let i = 0; i < 4; i++) {
      const hx = b.cx - b.rx * 0.3 + Math.sin(this._time * 0.4 + i * 1.7) * b.rx * 0.4;
      const hy = b.cy - b.ry * 0.5 + Math.cos(this._time * 0.3 + i * 2.3) * b.ry * 0.2;
      if (this._inBowl(Math.round(hx), Math.round(hy), b)) {
        ctx.fillRect(Math.round(hx), Math.round(hy), 1, 1);
      }
    }
  }

  // ============================================================
  // Castle - double-tower fortress (classic fishtank decoration)
  // ============================================================
  _renderCastle(ctx, b) {
    const gTop = b.cy + Math.round(b.ry * 0.76);
    const castleW = 36;
    const castleH = 34;
    const cx = b.cx;              // centered horizontally
    const cy = gTop - castleH + 3; // sits on gravel

    // Check time for night mode (windows lit)
    const hour = new Date().getHours();
    const night = hour >= 20 || hour < 6;

    // Palette
    const sd = '#3a3a44';  // stone dark
    const sm = '#56565e';  // stone mid
    const sl = '#7a7a84';  // stone light
    const mr = '#2a2a34';  // mortar
    const wd = '#0c0c18';  // window dark
    const wl = '#ffd44a';  // window lit
    const wg = '#fff5aa';  // window glow
    const ws = '#dd9a20';  // window warm
    const db = '#5a3a20';  // door
    const do_ = '#2a1810'; // door outline
    const dh = '#7a5030';  // door highlight
    const ha = '#ddbb44';  // handle
    const fl = '#dd3d3d';  // flag
    const fp = '#444444';  // flag pole

    const x = Math.round(cx - castleW / 2);
    const y = cy;

    // --- Central wall (lower, between towers) ---
    const wallTop = y + 12;
    ctx.fillStyle = sd;
    ctx.fillRect(x + 8, wallTop, castleW - 16, gTop - wallTop + 2);
    ctx.fillStyle = sm;
    ctx.fillRect(x + 9, wallTop + 1, castleW - 18, gTop - wallTop);

    // Stone texture on wall
    ctx.fillStyle = sl;
    for (let row = 0; row < 16; row += 4) {
      const off = (row / 4) % 2 === 0 ? 0 : 3;
      for (let col = off; col < castleW - 18; col += 6) {
        ctx.fillRect(x + 9 + col, wallTop + 1 + row, 1, 1);
      }
    }

    // Wall battlements
    ctx.fillStyle = sd;
    for (let i = 0; i < castleW - 16; i += 4) {
      ctx.fillRect(x + 8 + i, wallTop - 2, 2, 2);
    }

    // Gate
    const gateX = x + castleW / 2 - 3;
    const gateY = gTop - 8;
    ctx.fillStyle = do_;
    ctx.fillRect(gateX, gateY, 6, 9);
    ctx.fillRect(gateX + 1, gateY - 1, 4, 1);
    ctx.fillStyle = db;
    ctx.fillRect(gateX + 1, gateY + 1, 4, 8);
    ctx.fillStyle = dh;
    ctx.fillRect(gateX + 1, gateY + 1, 1, 8);
    // Portcullis bars
    ctx.fillStyle = do_;
    ctx.fillRect(gateX + 2, gateY + 1, 1, 7);
    ctx.fillRect(gateX + 4, gateY + 1, 1, 7);

    // --- Left tower ---
    this._drawTower(ctx, x, y, 10, gTop - y + 2, night, fl, fp, sd, sm, sl, mr, wd, wl, wg, ws);

    // --- Right tower ---
    this._drawTower(ctx, x + castleW - 10, y, 10, gTop - y + 2, night, fl, fp, sd, sm, sl, mr, wd, wl, wg, ws);

    // Base detail
    ctx.fillStyle = sd;
    ctx.fillRect(x - 1, gTop, castleW + 2, 1);
  }

  _drawTower(ctx, tx, ty, tw, th, night, fl, fp, sd, sm, sl, mr, wd, wl, wg, ws) {
    // Tower body
    ctx.fillStyle = sd;
    ctx.fillRect(tx, ty + 4, tw, th - 4);
    ctx.fillStyle = sm;
    ctx.fillRect(tx + 1, ty + 5, tw - 2, th - 6);

    // Stone blocks
    ctx.fillStyle = sl;
    for (let row = 0; row < th - 6; row += 4) {
      for (let col = 0; col < tw - 2; col += 4) {
        const off = (row / 4) % 2 === 0 ? 0 : 2;
        ctx.fillRect(tx + 1 + col + off, ty + 5 + row, 1, 1);
      }
    }

    // Battlements
    ctx.fillStyle = sd;
    for (let i = 0; i < tw; i += 3) {
      ctx.fillRect(tx + i, ty + 2, 2, 2);
      ctx.fillRect(tx + i, ty, 2, 2);
    }
    ctx.fillStyle = sl;
    for (let i = 0; i < tw; i += 3) {
      ctx.fillRect(tx + i, ty, 1, 1);
    }

    // Window
    const wx = tx + Math.round(tw / 2) - 1;
    const wy = ty + Math.round(th / 2) - 2;
    const ww = 3;
    const wh = 4;
    ctx.fillStyle = sd;
    ctx.fillRect(wx - 1, wy - 1, ww + 2, wh + 2);
    ctx.fillStyle = mr;
    ctx.fillRect(wx, wy, ww, wh);

    if (night) {
      ctx.fillStyle = ws;
      ctx.fillRect(wx, wy, ww, wh);
      ctx.fillStyle = wl;
      ctx.fillRect(wx, wy + 1, ww, wh - 2);
      ctx.fillStyle = wg;
      ctx.fillRect(wx + 1, wy + 1, ww - 2, 1);
    } else {
      ctx.fillStyle = wd;
      ctx.fillRect(wx, wy, ww, wh);
      ctx.fillStyle = sd;
      ctx.fillRect(wx, wy + Math.floor(wh / 2), ww, 1);
      if (ww > 2) ctx.fillRect(wx + Math.floor(ww / 2), wy, 1, wh);
    }

    // Flag
    ctx.fillStyle = fp;
    ctx.fillRect(tx + Math.round(tw / 2), ty - 4, 1, 4);
    ctx.fillStyle = fl;
    ctx.fillRect(tx + Math.round(tw / 2) + 1, ty - 4, 2, 1);
    ctx.fillRect(tx + Math.round(tw / 2) + 1, ty - 3, 1, 1);
  }

  _renderRim(ctx, b) {
    // Top rim of the bowl - brighter glass highlight at the top
    ctx.fillStyle = P.glH;
    const rimY = b.cy - b.ry - 1;
    for (let a = -0.8; a > -2.3; a -= 0.025) {
      const px = Math.round(b.cx + Math.cos(a) * (b.rx + 2));
      const py = Math.round(b.cy + Math.sin(a) * (b.ry + 2));
      ctx.fillRect(px, py, 1, 1);
    }
  }
}

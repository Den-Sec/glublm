/**
 * Water quality overlay - progressive tinting and algae spots.
 * Extracted from app.js inline rendering for cleaner code.
 */
export class WaterOverlay {
  /** @param {import('/engine/bowl.js').Bowl} bowl */
  constructor(bowl) {
    this._bowl = bowl;
    this._quality = 1.0; // 0-1
    this._algaeSpots = [];  // generated when quality drops low
    this._lastAlgaeQuality = 1.0;
  }

  /** Set water quality (0 = filthy, 1 = pristine). */
  setQuality(q) {
    this._quality = Math.max(0, Math.min(1, q));
    // Regenerate algae spots when crossing the 20% threshold
    if (this._quality < 0.2 && this._lastAlgaeQuality >= 0.2) {
      this._generateAlgae();
    } else if (this._quality >= 0.2) {
      this._algaeSpots = [];
    }
    this._lastAlgaeQuality = this._quality;
  }

  get quality() { return this._quality; }

  _generateAlgae() {
    this._algaeSpots = [];
    const b = this._bowl.getBounds();
    const count = 12 + Math.floor(Math.random() * 7);
    for (let i = 0; i < count; i++) {
      // Place spots near the bowl rim (high edge distance)
      const angle = Math.random() * Math.PI * 2;
      const r = 0.88 + Math.random() * 0.10; // near edge
      this._algaeSpots.push({
        x: b.cx + Math.cos(angle) * b.rx * r,
        y: b.cy + Math.sin(angle) * b.ry * r,
        size: 2 + Math.floor(Math.random() * 2),
      });
    }
  }

  update(/* dt */) {
    // Static overlay - no animation
  }

  /** @param {CanvasRenderingContext2D} ctx */
  render(ctx) {
    if (this._quality >= 0.8) return;

    // Stronger overlay: up to 0.7 alpha when fully dirty
    const alpha = (1 - this._quality) * 0.7;
    ctx.save();
    ctx.globalAlpha = alpha;

    // Progressive tint: clear -> murky green -> brown-green
    if (this._quality < 0.2) {
      ctx.fillStyle = '#4a4a10'; // brown-green (very dirty)
    } else if (this._quality < 0.5) {
      ctx.fillStyle = '#2a4a10'; // dark green
    } else {
      ctx.fillStyle = '#1a2a18'; // slight murk
    }
    ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height);
    ctx.restore();

    // Algae spots on bowl rim when <20%
    if (this._algaeSpots.length > 0) {
      ctx.fillStyle = '#4a8030';
      ctx.globalAlpha = 0.7;
      for (const s of this._algaeSpots) {
        ctx.fillRect(Math.round(s.x), Math.round(s.y), s.size + 1, s.size + 1);
      }
      ctx.globalAlpha = 1;
    }
  }
}

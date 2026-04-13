/**
 * Water quality overlay - progressive tinting clipped to bowl ellipse,
 * plus algae spots that scale with degradation level.
 */
export class WaterOverlay {
  /** @param {import('/engine/bowl.js').Bowl} bowl */
  constructor(bowl) {
    this._bowl = bowl;
    this._quality = 1.0; // 0-1
    this._algaeSpots = [];
    this._algaeGenAt = -1; // quality level when algae were last generated
  }

  /** Set water quality (0 = filthy, 1 = pristine). */
  setQuality(q) {
    this._quality = Math.max(0, Math.min(1, q));
    if (this._quality >= 0.4) {
      this._algaeSpots = [];
      this._algaeGenAt = -1;
    } else if (this._algaeGenAt < 0 || Math.abs(this._quality - this._algaeGenAt) > 0.08) {
      // Only regenerate when quality changes by >8% or first time below 40%
      this._generateAlgae();
      this._algaeGenAt = this._quality;
    }
  }

  get quality() { return this._quality; }

  _generateAlgae() {
    this._algaeSpots = [];
    const b = this._bowl.getBounds();
    // More algae as water gets dirtier: 5 at 40%, up to 40+ at 0%
    const severity = 1 - (this._quality / 0.4); // 0 at 40%, 1 at 0%
    const count = Math.round(5 + severity * 35);
    for (let i = 0; i < count; i++) {
      // Spread algae across bowl: near rim at low severity, everywhere at high
      const angle = Math.random() * Math.PI * 2;
      const rMin = severity > 0.5 ? 0.3 : 0.6;
      const r = rMin + Math.random() * (0.98 - rMin);
      const size = 2 + Math.floor(Math.random() * (severity > 0.7 ? 4 : 2));
      this._algaeSpots.push({
        x: b.cx + Math.cos(angle) * b.rx * r,
        y: b.cy + Math.sin(angle) * b.ry * r,
        size,
        shade: Math.random() > 0.5 ? '#3a7020' : '#4a8830',
      });
    }
  }

  update(/* dt */) {}

  /** @param {CanvasRenderingContext2D} ctx */
  render(ctx) {
    if (this._quality >= 0.8) return;
    const b = this._bowl.getBounds();

    // Clip to bowl ellipse
    ctx.save();
    ctx.beginPath();
    ctx.ellipse(b.cx, b.cy, b.rx, b.ry, 0, 0, Math.PI * 2);
    ctx.clip();

    // Water tint overlay
    const alpha = (1 - this._quality) * 0.6;
    ctx.globalAlpha = alpha;
    if (this._quality < 0.15) {
      ctx.fillStyle = '#4a4010'; // brown-green (critical)
    } else if (this._quality < 0.3) {
      ctx.fillStyle = '#3a4a10'; // dark murky green
    } else if (this._quality < 0.5) {
      ctx.fillStyle = '#2a3a10'; // green
    } else {
      ctx.fillStyle = '#1a2a18'; // slight murk
    }
    ctx.fillRect(b.cx - b.rx, b.cy - b.ry, b.rx * 2, b.ry * 2);

    // Algae spots
    if (this._algaeSpots.length > 0) {
      const algaeAlpha = 0.4 + (1 - this._quality) * 0.4;
      ctx.globalAlpha = algaeAlpha;
      for (const s of this._algaeSpots) {
        ctx.fillStyle = s.shade;
        ctx.fillRect(Math.round(s.x), Math.round(s.y), s.size, s.size);
      }
    }

    ctx.restore();
  }
}

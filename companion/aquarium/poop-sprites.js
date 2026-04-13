/**
 * Poop sprite renderer - pixel art poop emoji on the gravel.
 * Dark body, no outline, sits directly on gravel tiles.
 */
export class PoopSprites {
  /** @param {import('/engine/bowl.js').Bowl} bowl */
  constructor(bowl) {
    this._bowl = bowl;
    /** @type {Map<string, {x: number, y: number}>} */
    this._poops = new Map();
  }

  add(id, nx, ny) { this._poops.set(id, { x: nx, y: ny }); }
  remove(id) { this._poops.delete(id); }
  clear() { this._poops.clear(); }

  handleMessage(msg) {
    switch (msg.action) {
      case 'add': this.add(msg.id, msg.x, msg.y); break;
      case 'remove': this.remove(msg.id); break;
      case 'clear': this.clear(); break;
    }
  }

  update() {}

  /** @param {CanvasRenderingContext2D} ctx */
  render(ctx) {
    if (this._poops.size === 0) return;
    const b = this._bowl.getBounds();

    // Base sits ON gravel tiles (gravel at ry*0.72 to ry*0.82)
    const gravelMid = b.cy + Math.round(b.ry * 0.76);

    // Visual cap: render max 100 poops to avoid performance issues
    let count = 0;
    for (const p of this._poops.values()) {
      if (++count > 100) break;
      const dy = (gravelMid - b.cy) / b.ry;
      const bowlHalfW = b.rx * Math.sqrt(Math.max(0, 1 - dy * dy));
      const safeHalfW = bowlHalfW * 0.75;

      const px = Math.round(b.cx - safeHalfW + p.x * safeHalfW * 2);
      const yOff = Math.round(((p.y - 0.82) / 0.06) * 4);
      const py = gravelMid + yOff;

      this._drawPoop(ctx, px, py);
    }
  }

  _drawPoop(ctx, x, y) {
    const dk = '#100800';
    const md = '#221008';
    const lt = '#38180c';

    // Compact swirl, no outline (8x8)
    _r(ctx, lt, x+3, y, 2, 1);
    _r(ctx, md, x+2, y+1, 4, 1);
    _r(ctx, md, x+1, y+2, 2, 1);
    _r(ctx, dk, x+4, y+2, 2, 1);
    _r(ctx, md, x+1, y+3, 6, 1);
    _r(ctx, lt, x+1, y+3, 2, 1);
    _r(ctx, dk, x, y+4, 2, 1);
    _r(ctx, md, x+3, y+4, 4, 1);
    _r(ctx, md, x, y+5, 7, 1);
    _r(ctx, lt, x+1, y+5, 2, 1);
    _r(ctx, dk, x, y+6, 7, 1);
    _r(ctx, md, x+1, y+6, 4, 1);
    _r(ctx, dk, x+1, y+7, 5, 1);
  }
}

function _r(ctx, color, x, y, w, h) {
  ctx.fillStyle = color;
  ctx.fillRect(x, y, w, h);
}

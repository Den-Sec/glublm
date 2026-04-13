/**
 * Poop sprite renderer - pixel art poop emoji on the gravel.
 * Classic swirl shape, GBA-style.
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
    const w = b.rx * 2;
    const h = b.ry * 2;
    const left = b.cx - b.rx;
    const top = b.cy - b.ry;

    for (const p of this._poops.values()) {
      const px = Math.round(left + p.x * w);
      const py = Math.round(top + p.y * h);
      this._drawPoop(ctx, px, py);
    }
  }

  _drawPoop(ctx, x, y) {
    const d = '#3a2010'; // dark outline/shadow
    const m = '#6a4420'; // medium brown body
    const l = '#8a6040'; // light highlight

    // Tip (swirl top)
    _r(ctx, m, x+3, y, 2, 1);
    _r(ctx, l, x+3, y, 1, 1);

    // Top coil
    _r(ctx, m, x+2, y+1, 4, 1);
    _r(ctx, l, x+2, y+1, 1, 1);

    // Swirl gap row 1
    _r(ctx, m, x+1, y+2, 2, 1);
    _r(ctx, l, x+1, y+2, 1, 1);
    _r(ctx, m, x+4, y+2, 2, 1);

    // Middle coil
    _r(ctx, m, x+1, y+3, 6, 1);
    _r(ctx, l, x+1, y+3, 2, 1);

    // Swirl gap row 2
    _r(ctx, m, x, y+4, 2, 1);
    _r(ctx, l, x, y+4, 1, 1);
    _r(ctx, m, x+3, y+4, 4, 1);

    // Wide body
    _r(ctx, m, x, y+5, 8, 1);
    _r(ctx, l, x, y+5, 2, 1);
    _r(ctx, d, x+6, y+5, 2, 1);

    // Lower body
    _r(ctx, m, x, y+6, 8, 1);
    _r(ctx, l, x+1, y+6, 1, 1);
    _r(ctx, d, x+7, y+6, 1, 1);

    // Base (rounded)
    _r(ctx, m, x+1, y+7, 6, 1);
    _r(ctx, d, x+1, y+7, 1, 1);
    _r(ctx, d, x+6, y+7, 1, 1);

    // Bottom
    _r(ctx, d, x+2, y+8, 4, 1);
  }
}

function _r(ctx, color, x, y, w, h) {
  ctx.fillStyle = color;
  ctx.fillRect(x, y, w, h);
}

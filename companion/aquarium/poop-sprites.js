/**
 * Poop sprite renderer - small brown dots on the gravel.
 * Handles WS poop messages: add, remove, clear.
 */
export class PoopSprites {
  /** @param {import('/engine/bowl.js').Bowl} bowl */
  constructor(bowl) {
    this._bowl = bowl;
    /** @type {Map<string, {x: number, y: number}>} */
    this._poops = new Map();
  }

  /** Add a poop at normalized position. */
  add(id, nx, ny) {
    this._poops.set(id, { x: nx, y: ny });
  }

  /** Remove poop by id. */
  remove(id) {
    this._poops.delete(id);
  }

  /** Remove all poops. */
  clear() {
    this._poops.clear();
  }

  /** Handle incoming WS poop message. */
  handleMessage(msg) {
    switch (msg.action) {
      case 'add': this.add(msg.id, msg.x, msg.y); break;
      case 'remove': this.remove(msg.id); break;
      case 'clear': this.clear(); break;
    }
  }

  update(/* dt */) {
    // Static sprites - no animation needed
  }

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

      // 3px brown circle: dark center with lighter rim
      ctx.fillStyle = '#4a3220';
      ctx.fillRect(px, py, 3, 3);
      ctx.fillStyle = '#5e4232';
      ctx.fillRect(px, py, 1, 1);         // top-left highlight
      ctx.fillStyle = '#3a2418';
      ctx.fillRect(px + 2, py + 2, 1, 1); // bottom-right shadow
    }
  }
}

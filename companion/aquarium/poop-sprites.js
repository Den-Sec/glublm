/**
 * Poop sprite renderer - small brown mounds on the gravel.
 * Handles WS poop messages: add, remove, clear.
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

      // Rounded mound shape - natural poop look
      // Bottom row (wide)
      ctx.fillStyle = '#3a2418';
      ctx.fillRect(px + 1, py + 4, 5, 2);
      // Middle body
      ctx.fillStyle = '#4a3220';
      ctx.fillRect(px, py + 2, 7, 2);
      // Top (narrower)
      ctx.fillStyle = '#5a4030';
      ctx.fillRect(px + 1, py + 1, 5, 1);
      ctx.fillRect(px + 2, py, 3, 1);
      // Highlight
      ctx.fillStyle = '#6a5040';
      ctx.fillRect(px + 2, py + 1, 1, 1);
      ctx.fillRect(px + 4, py + 2, 1, 1);
    }
  }
}

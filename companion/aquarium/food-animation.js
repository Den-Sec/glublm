/**
 * Food flake particle system - small flakes drift down from the surface.
 * Spawned on 'feed' message, similar to BubbleSystem but falling.
 */
export class FoodAnimation {
  /** @param {import('/engine/bowl.js').Bowl} bowl */
  constructor(bowl) {
    this._bowl = bowl;
    this._flakes = [];
  }

  /** Spawn a burst of food flakes at the water surface. */
  spawn(count = 5) {
    const swim = this._bowl.getSwimBounds();
    const surfaceY = swim.cy - swim.ry * 0.9;

    for (let i = 0; i < count; i++) {
      const bx = swim.cx + (Math.random() - 0.5) * swim.rx * 1.2;
      this._flakes.push({
        x: bx,
        baseX: bx,
        y: surfaceY + Math.random() * 4,
        speed: 8 + Math.random() * 6,       // slow fall
        wobbleTime: Math.random() * Math.PI * 2,
        life: 0,
        maxLife: 2.5 + Math.random() * 1.0,  // ~3s
        color: Math.random() > 0.5 ? '#c87830' : '#a86020', // orange/brown
        size: Math.random() > 0.4 ? 2 : 3,
      });
    }
  }

  /** @returns {{ x: number, y: number } | null} position of nearest active flake */
  getNearestFlake(fx, fy) {
    let best = null, bestDist = Infinity;
    for (const f of this._flakes) {
      const dx = f.x - fx, dy = f.y - fy;
      const d = dx * dx + dy * dy;
      if (d < bestDist) { bestDist = d; best = f; }
    }
    return best ? { x: best.x, y: best.y } : null;
  }

  update(dt) {
    const swim = this._bowl.getSwimBounds();
    const gravelY = swim.cy + swim.ry * 0.85;

    for (let i = this._flakes.length - 1; i >= 0; i--) {
      const f = this._flakes[i];
      f.y += f.speed * dt;
      f.wobbleTime += dt;
      f.x = f.baseX + Math.sin(f.wobbleTime * 2) * 2; // gentle wobble
      f.life += dt;

      // Remove when expired or hits gravel
      if (f.life >= f.maxLife || f.y >= gravelY) {
        this._flakes.splice(i, 1);
      }
    }
  }

  /** @param {CanvasRenderingContext2D} ctx */
  render(ctx) {
    for (const f of this._flakes) {
      const t = f.life / f.maxLife;
      ctx.globalAlpha = Math.max(0, 1 - t * t); // fade out near end
      ctx.fillStyle = f.color;
      ctx.fillRect(Math.round(f.x), Math.round(f.y), f.size, f.size);
    }
    ctx.globalAlpha = 1;
  }

  get hasFlakes() { return this._flakes.length > 0; }
}

/**
 * Pixel-art bubble particle system.
 * Bubbles are 1-2 pixel circles that rise through the water.
 */
export class BubbleSystem {
  /** @param {import('./bowl.js').Bowl} bowl */
  constructor(bowl) {
    this._bowl = bowl;
    this._bubbles = [];
    this._spawnTimer = 0;
    this._nextSpawn = 1 + Math.random() * 2;
  }

  update(dt) {
    this._spawnTimer += dt;
    if (this._spawnTimer >= this._nextSpawn && this._bubbles.length < 6) {
      this._spawn();
      this._spawnTimer = 0;
      this._nextSpawn = 2 + Math.random() * 5;
    }

    for (let i = this._bubbles.length - 1; i >= 0; i--) {
      const b = this._bubbles[i];
      b.y -= b.speed * dt;
      b.wobbleTime += dt;
      b.x = b.baseX + Math.round(Math.sin(b.wobbleTime * 1.5) * 1.5);
      b.life += dt;

      const bounds = this._bowl.getBounds();
      if (b.y < bounds.cy - bounds.ry * 0.88) {
        this._bubbles.splice(i, 1);
      }
    }
  }

  _spawn() {
    const swim = this._bowl.getSwimBounds();
    const bx = Math.round(swim.cx + (Math.random() - 0.5) * swim.rx * 1.2);
    this._bubbles.push({
      x: bx,
      baseX: bx,
      y: Math.round(swim.cy + swim.ry * (0.3 + Math.random() * 0.5)),
      size: Math.random() > 0.6 ? 2 : 1,
      speed: 6 + Math.random() * 10,
      wobbleTime: Math.random() * Math.PI * 2,
      opacity: 0.3 + Math.random() * 0.4,
      life: 0,
    });
  }

  /** @param {CanvasRenderingContext2D} ctx */
  render(ctx) {
    for (const b of this._bubbles) {
      const px = Math.round(b.x);
      const py = Math.round(b.y);
      ctx.globalAlpha = b.opacity;

      if (b.size === 1) {
        // Single pixel bubble
        ctx.fillStyle = '#5aaccc';
        ctx.fillRect(px, py, 1, 1);
      } else {
        // 2x2 pixel bubble with highlight
        ctx.fillStyle = '#4a9abb';
        ctx.fillRect(px, py, 2, 2);
        ctx.fillStyle = '#8ad4ee';
        ctx.fillRect(px, py, 1, 1); // highlight top-left
      }
    }
    ctx.globalAlpha = 1;
  }
}

/**
 * Splash particle system for click effects.
 * Short-lived pixel particles that burst outward.
 */
export class SplashSystem {
  constructor() {
    this._particles = [];
  }

  /** Spawn a splash burst at position. */
  burst(x, y, count = 8) {
    for (let i = 0; i < count; i++) {
      const angle = (i / count) * Math.PI * 2 + (Math.random() - 0.5) * 0.5;
      const speed = 15 + Math.random() * 25;
      this._particles.push({
        x, y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed - 8, // slight upward bias
        life: 0,
        maxLife: 0.3 + Math.random() * 0.3,
        color: Math.random() > 0.5 ? '#88ccee' : '#aaddff',
      });
    }
  }

  update(dt) {
    for (let i = this._particles.length - 1; i >= 0; i--) {
      const p = this._particles[i];
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vy += 30 * dt; // gravity
      p.life += dt;
      if (p.life >= p.maxLife) {
        this._particles.splice(i, 1);
      }
    }
  }

  render(ctx) {
    for (const p of this._particles) {
      const alpha = 1 - (p.life / p.maxLife);
      ctx.globalAlpha = alpha * 0.8;
      ctx.fillStyle = p.color;
      ctx.fillRect(Math.round(p.x), Math.round(p.y), 1, 1);
    }
    ctx.globalAlpha = 1;
  }

  get hasParticles() { return this._particles.length > 0; }
}

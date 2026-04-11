/**
 * Dissolve particle system - spawned when the fish finishes speaking,
 * visually representing the "forgetting" concept that is the core of
 * the product.
 *
 * The idea: when the speech bubble fades out, we emit tiny pixel
 * particles from the bubble region that drift outward and fade. It
 * looks like the words themselves are dispersing into the water as
 * the fish's memory clears.
 */
export class DissolveSystem {
  constructor() {
    this._particles = [];
  }

  /**
   * Spawn dissolve particles from a rectangular region (the old bubble).
   * @param {number} x - center x (internal pixel coords)
   * @param {number} y - center y
   * @param {number} w - bubble width
   * @param {number} h - bubble height
   * @param {number} [count=14]
   */
  burst(x, y, w, h, count = 14) {
    for (let i = 0; i < count; i++) {
      // Start inside the bubble bounds
      const px = x + (Math.random() - 0.5) * w;
      const py = y + (Math.random() - 0.5) * h;
      // Initial velocity: mostly upward with some outward spread
      const angle = -Math.PI / 2 + (Math.random() - 0.5) * 1.5;
      const speed = 6 + Math.random() * 12;
      this._particles.push({
        x: px,
        y: py,
        vx: Math.cos(angle) * speed + (Math.random() - 0.5) * 4,
        vy: Math.sin(angle) * speed,
        life: 0,
        maxLife: 0.8 + Math.random() * 0.6,
        // Pick a palette of "forgotten word" dust colors
        color: Math.random() > 0.5 ? '#8fc6e0' : (Math.random() > 0.5 ? '#b4d8ea' : '#5a9cbe'),
      });
    }
  }

  update(dt) {
    for (let i = this._particles.length - 1; i >= 0; i--) {
      const p = this._particles[i];
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      // Float physics - slight upward drift (words floating away)
      p.vy -= 8 * dt;
      // Tiny horizontal wobble
      p.vx += Math.sin(p.life * 12) * 2 * dt;
      p.life += dt;
      if (p.life >= p.maxLife) {
        this._particles.splice(i, 1);
      }
    }
  }

  render(ctx) {
    for (const p of this._particles) {
      const t = p.life / p.maxLife;
      // Fade out, stronger at the end
      const alpha = Math.max(0, 1 - t * t);
      ctx.globalAlpha = alpha * 0.7;
      ctx.fillStyle = p.color;
      ctx.fillRect(Math.round(p.x), Math.round(p.y), 1, 1);
    }
    ctx.globalAlpha = 1;
  }

  get hasParticles() { return this._particles.length > 0; }
}

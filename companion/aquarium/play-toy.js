/**
 * Play toy - a bouncing ball the fish chases during play animation.
 * GBA pixel-art aesthetic: 4px ball, bright colors, squash on landing.
 */
export class PlayToy {
  /** @param {import('/engine/bowl.js').Bowl} bowl */
  constructor(bowl) {
    this._bowl = bowl;
    this._x = 0;
    this._y = 0;
    this._active = false;
    this._bounceTimer = 0;
    this._bounceCount = 0;
    this._maxBounces = 4;
    this._bounceDuration = 0.8;
    this._squash = 0;         // 0 = round, 1 = squashed
    this._colorIdx = 0;
    this._splash = null;      // set externally for bounce effects
  }

  /** @param {SplashSystem} splash */
  setSplash(splash) { this._splash = splash; }

  /** Begin bouncing sequence. Returns first ball position. */
  start() {
    this._active = true;
    this._bounceCount = 0;
    this._bounceTimer = 0;
    this._colorIdx = 0;
    this._pickPosition();
    return { x: this._x, y: this._y };
  }

  /** Current ball position, or null if inactive. */
  getPosition() {
    return this._active ? { x: this._x, y: this._y } : null;
  }

  get isActive() { return this._active; }

  /** Pick a random position within swim bounds. */
  _pickPosition() {
    const s = this._bowl.getSwimBounds();
    const angle = Math.random() * Math.PI * 2;
    const r = 0.3 + Math.random() * 0.5;
    this._x = s.cx + Math.cos(angle) * s.rx * r;
    this._y = s.cy + Math.sin(angle) * s.ry * r;
  }

  update(dt) {
    if (!this._active) return;

    // Squash decay
    if (this._squash > 0) this._squash = Math.max(0, this._squash - dt * 5);

    this._bounceTimer += dt;
    if (this._bounceTimer >= this._bounceDuration) {
      this._bounceTimer -= this._bounceDuration;
      this._bounceCount++;

      if (this._bounceCount >= this._maxBounces) {
        this._active = false;
        return;
      }
      // Bounce to new position
      this._pickPosition();
      this._squash = 1;
      this._colorIdx ^= 1;
      if (this._splash) this._splash.burst(this._x, this._y, 4);
    }
  }

  /** @param {CanvasRenderingContext2D} ctx */
  render(ctx) {
    if (!this._active) return;

    const bx = Math.round(this._x);
    const by = Math.round(this._y);
    const color = this._colorIdx === 0 ? '#ff4444' : '#ffcc00';
    const h = this._squash > 0.3 ? 3 : 4;

    // Ball body
    ctx.fillStyle = color;
    ctx.fillRect(bx - 2, by - Math.floor(h / 2), 4, h);

    // Highlight pixel (top-left for 3D feel)
    ctx.fillStyle = '#ffffff';
    ctx.globalAlpha = 0.7;
    ctx.fillRect(bx - 1, by - Math.floor(h / 2), 1, 1);
    ctx.globalAlpha = 1;
  }
}

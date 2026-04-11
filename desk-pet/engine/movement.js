/**
 * Fish movement system - autonomous swimming within bowl bounds.
 */
export class FishMovement {
  /**
   * @param {import('./bowl.js').Bowl} bowl
   */
  constructor(bowl) {
    this._bowl = bowl;
    const swim = bowl.getSwimBounds();
    this._x = swim.cx;
    this._y = swim.cy;
    this._targetX = swim.cx;
    this._targetY = swim.cy;
    this._facingRight = true;
    this._speed = 40;
    this._paused = false;
    this._pauseTimer = 0;
    this._pauseDuration = 0;
    this._bobPhase = Math.random() * Math.PI * 2;
    this._bobOffset = 0;
    this._movementScale = 1; // can slow down for states like sleep

    // Cursor tracking
    this._cursorX = null;
    this._cursorY = null;
    this._cursorActive = false;
    this._cursorActiveTimer = 0;
  }

  /**
   * Update cursor position (in canvas internal coordinates).
   * Pass null to clear.
   */
  setCursor(x, y) {
    if (x === null || y === null) {
      this._cursorActive = false;
      return;
    }
    this._cursorX = x;
    this._cursorY = y;
    this._cursorActive = true;
    this._cursorActiveTimer = 0;
  }

  /** Pick a random target within the swim zone. */
  _pickTarget() {
    const swim = this._bowl.getSwimBounds();
    // Random angle + random radius within ellipse
    const angle = Math.random() * Math.PI * 2;
    const r = Math.sqrt(Math.random()) * 0.85; // sqrt for uniform distribution in ellipse
    this._targetX = swim.cx + Math.cos(angle) * swim.rx * r;
    this._targetY = swim.cy + Math.sin(angle) * swim.ry * r;
    // Bias slightly toward center-bottom (gravity-like)
    this._targetY += swim.ry * 0.1;
    // Speed variation
    this._speed = 30 + Math.random() * 30;
  }

  /** Pause movement for duration seconds. */
  pause(duration) {
    this._paused = true;
    this._pauseTimer = 0;
    this._pauseDuration = duration;
  }

  /** Override target temporarily (for following user click, etc.). */
  setTarget(x, y) {
    this._targetX = x;
    this._targetY = y;
    this._paused = false;
  }

  /** Stop all movement (for sleeping). */
  freeze() { this._movementScale = 0; }

  /** Resume normal movement. */
  unfreeze() { this._movementScale = 1; }

  /** Slow movement (for talking, etc.). */
  slowDown() { this._movementScale = 0.3; }

  update(dt) {
    // Bob animation (always active, even when paused)
    this._bobPhase += dt * 1.5;
    this._bobOffset = Math.sin(this._bobPhase) * 2;

    // Cursor tracking decay - cursor "fades" after 2 seconds of no movement
    if (this._cursorActive) {
      this._cursorActiveTimer += dt;
      if (this._cursorActiveTimer > 2) {
        this._cursorActive = false;
      }
    }

    // If cursor is active and within swim zone, subtly drift the target toward it
    // The fish gets curious about cursor proximity
    if (this._cursorActive && this._movementScale > 0.5) {
      const swim = this._bowl.getSwimBounds();
      if (this._bowl.isInSwimBounds(this._cursorX, this._cursorY)) {
        // Blend target toward cursor (30% weight = subtle interest, not aggressive follow)
        this._targetX = this._targetX * 0.97 + this._cursorX * 0.03;
        this._targetY = this._targetY * 0.97 + this._cursorY * 0.03;
      }
    }

    // Handle pause
    if (this._paused) {
      this._pauseTimer += dt;
      if (this._pauseTimer >= this._pauseDuration) {
        this._paused = false;
        this._pickTarget();
      }
      return;
    }

    // Move toward target
    const dx = this._targetX - this._x;
    const dy = this._targetY - this._y;
    const dist = Math.sqrt(dx * dx + dy * dy);

    if (dist < 5) {
      // Reached target - pause then pick new one
      this.pause(1 + Math.random() * 2);
      return;
    }

    // Direction tracking (only update when actually moving)
    if (Math.abs(dx) > 2) {
      this._facingRight = dx > 0;
    }

    // Lerp toward target
    const moveSpeed = this._speed * this._movementScale;
    const step = Math.min(moveSpeed * dt, dist);
    this._x += (dx / dist) * step;
    this._y += (dy / dist) * step;

    // Clamp to swim bounds
    const swim = this._bowl.getSwimBounds();
    const norm = ((this._x - swim.cx) / swim.rx) ** 2 + ((this._y - swim.cy) / swim.ry) ** 2;
    if (norm > 0.95) {
      // Push back toward center
      this._x += (swim.cx - this._x) * 0.05;
      this._y += (swim.cy - this._y) * 0.05;
    }
  }

  get x() { return this._x; }
  get y() { return this._y + this._bobOffset; }
  get rawY() { return this._y; } // without bob
  get facingRight() { return this._facingRight; }

  get isAtEdge() {
    return this._bowl.distFromEdge(this._x, this._y) < 0.15;
  }

  get isPaused() { return this._paused; }

  /**
   * Get the "look at" direction - returns a normalized (dx, dy) vector for
   * where the fish eye should look. Returns null if not tracking cursor.
   * @returns {null | { dx: number, dy: number }}
   */
  getEyeLook() {
    if (!this._cursorActive) return null;
    const dx = this._cursorX - this._x;
    const dy = this._cursorY - this._y;
    const d = Math.sqrt(dx * dx + dy * dy);
    if (d < 1) return null;
    return { dx: dx / d, dy: dy / d };
  }
}


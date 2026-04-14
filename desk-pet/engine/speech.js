/**
 * GBA-style speech bubble renderer.
 * Rendered at SCREEN resolution for readable text, but styled to match
 * the pixel-art aesthetic: sharp corners, pixel-scaled borders, solid fill.
 *
 * Looks like a Pokemon/GBA dialog box, not a modern tooltip.
 */
export class SpeechBubble {
  constructor() {
    this._text = '';
    this._visible = false;
    this._opacity = 0;
    this._timer = 0;
    this._duration = 5;
    this._phase = 'hidden';
    this._type = 'fish';
    this._lastBubbleRect = null; // { cx, cy, w, h } in screen px, set on render
    this._onFadeOutStart = null;
    this._fadeOutFired = false;
  }

  /** Register a callback fired once when the bubble transitions to fadeOut. */
  onFadeOutStart(fn) { this._onFadeOutStart = fn; }

  /** Last rendered bubble rect in screen coordinates. */
  get lastRect() { return this._lastBubbleRect; }

  show(text, { duration, type = 'fish' } = {}) {
    this._text = text;
    this._type = type;
    this._duration = duration || SpeechBubble.calcDuration(text);
    this._phase = 'fadeIn';
    this._opacity = 0;
    this._timer = 0;
    this._visible = true;
    this._fadeOutFired = false;

    // Mirror to the screen-reader live region (canvas content is invisible to AT).
    // Prefix with speaker so SR users know who said what.
    if (typeof document !== 'undefined') {
      const mirror = document.getElementById('sr-speech');
      if (mirror) {
        const speaker = type === 'fish' ? 'glub says' : 'you say';
        mirror.textContent = `${speaker}: ${text}`;
      }
    }
  }

  /**
   * Reading-time estimate for a given text, used to size both the bubble's
   * own visible window and the FSM TALKING state so animation and bubble
   * stay in sync. ~12 chars/sec with min 5s, cap 28s (long replies stay
   * readable instead of being truncated mid-sentence).
   */
  static calcDuration(text) {
    return Math.max(5, Math.min(28, (text?.length || 0) * 0.12 + 3));
  }

  dismiss() {
    if (this._visible) this._phase = 'fadeOut';
  }

  /** Get the current quote text (empty string if nothing visible). */
  get text() { return this._visible && this._phase === 'visible' ? this._text : ''; }

  /** Get the type of the current bubble ('fish' | 'user'). */
  get type() { return this._type; }

  /** True only when the fish is speaking (not user bubble) and bubble is visible. */
  get isFishSpeaking() {
    return this._visible && this._type === 'fish' && this._text.length > 0;
  }

  update(dt) {
    if (!this._visible) return;
    switch (this._phase) {
      case 'fadeIn':
        this._opacity = Math.min(1, this._opacity + dt * 6);
        if (this._opacity >= 1) { this._phase = 'visible'; this._timer = 0; }
        break;
      case 'visible':
        this._timer += dt;
        if (this._timer >= this._duration) {
          this._phase = 'fadeOut';
          if (this._onFadeOutStart && !this._fadeOutFired && this._type === 'fish') {
            this._fadeOutFired = true;
            this._onFadeOutStart(this._lastBubbleRect, this._text);
          }
        }
        break;
      case 'fadeOut':
        this._opacity = Math.max(0, this._opacity - dt * 1.5);
        if (this._opacity <= 0) { this._visible = false; this._phase = 'hidden'; }
        break;
    }
  }

  /**
   * Render at screen resolution, GBA textbox style.
   * @param {CanvasRenderingContext2D} ctx - SCREEN context
   * @param {number} fishScreenX
   * @param {number} fishScreenY
   * @param {number} screenW
   * @param {number} screenH
   */
  render(ctx, fishScreenX, fishScreenY, screenW, screenH) {
    if (!this._visible || this._opacity <= 0) return;

    // Pixel scale: how many screen pixels = 1 game pixel
    const px = Math.max(2, Math.round(screenW / 240));

    ctx.save();
    ctx.globalAlpha = this._opacity;

    // Font: monospace for pixel feel, sized to be readable
    const fontSize = Math.max(12, Math.min(16, px * 3));
    ctx.font = `${fontSize}px "Courier New", "Consolas", monospace`;

    const maxTextW = Math.min(screenW * 0.5, 360);
    const padX = px * 3;
    const padY = px * 2;
    const lineH = fontSize + px;
    const border = px;       // border thickness = 1 game pixel
    const border2 = px * 2;  // outer border

    // Word wrap
    const lines = this._wrapText(ctx, this._text, maxTextW);
    const textW = Math.min(
      maxTextW,
      Math.max(...lines.map(l => Math.ceil(ctx.measureText(l).width)))
    );
    const boxW = textW + padX * 2;
    const boxH = lines.length * lineH + padY * 2;

    // Position (snap to pixel grid)
    let bx, by;
    if (this._type === 'fish') {
      bx = fishScreenX - boxW / 2;
      by = fishScreenY - screenH * 0.1 - boxH - px * 3;
    } else {
      bx = screenW / 2 - boxW / 2;
      by = screenH - px * 16 - boxH;
    }
    bx = Math.round(Math.max(px * 2, Math.min(screenW - boxW - px * 2, bx)) / px) * px;
    by = Math.round(Math.max(px * 2, by) / px) * px;

    // Remember rect for dissolve particles (in screen coords)
    this._lastBubbleRect = { cx: bx + boxW / 2, cy: by + boxH / 2, w: boxW, h: boxH };

    // Pointer position (snapped)
    const ptrX = Math.round(Math.max(bx + px * 4, Math.min(bx + boxW - px * 4, fishScreenX)) / px) * px;

    // ---- Draw GBA-style textbox ----

    // Drop shadow (offset 2 game pixels down-right)
    ctx.fillStyle = '#040810';
    ctx.fillRect(bx + border2, by + border2, boxW, boxH);
    // Shadow for pointer
    if (this._type === 'fish') {
      ctx.fillRect(ptrX - px + border2, by + boxH + border2, px * 3, px * 2);
      ctx.fillRect(ptrX + border2, by + boxH + px * 2 + border2, px, px);
    }

    // Outer border (bright edge - like GBA dialog frame)
    ctx.fillStyle = this._type === 'fish' ? '#4a9abe' : '#cc8844';
    ctx.fillRect(bx - border, by - border, boxW + border * 2, boxH + border * 2);

    // Inner fill (dark solid - no transparency)
    ctx.fillStyle = '#0c1e30';
    ctx.fillRect(bx, by, boxW, boxH);

    // Inner border highlight (1px inside, lighter)
    ctx.fillStyle = this._type === 'fish' ? '#1c3a52' : '#2a1c10';
    // Top
    ctx.fillRect(bx + border, by + border, boxW - border * 2, border);
    // Left
    ctx.fillRect(bx + border, by + border, border, boxH - border * 2);

    // Inner border shadow (1px inside, bottom/right, darker)
    ctx.fillStyle = '#081420';
    // Bottom
    ctx.fillRect(bx + border, by + boxH - border * 2, boxW - border * 2, border);
    // Right
    ctx.fillRect(bx + boxW - border * 2, by + border, border, boxH - border * 2);

    // Pointer (pixel triangle pointing down toward fish)
    if (this._type === 'fish') {
      // Outer border of pointer
      ctx.fillStyle = this._type === 'fish' ? '#4a9abe' : '#cc8844';
      ctx.fillRect(ptrX - px * 2, by + boxH, px * 5, border);
      ctx.fillRect(ptrX - px, by + boxH + border, px * 3, px);
      ctx.fillRect(ptrX, by + boxH + border + px, px, px);

      // Inner fill of pointer
      ctx.fillStyle = '#0c1e30';
      ctx.fillRect(ptrX - px, by + boxH, px * 3, px);
      ctx.fillRect(ptrX, by + boxH + px, px, px);
    }

    // Text with pixel-shadow (GBA style: dark shadow offset 1px down-right)
    ctx.textBaseline = 'top';
    for (let i = 0; i < lines.length; i++) {
      const tx = bx + padX;
      const ty = by + padY + i * lineH;
      // Shadow
      ctx.fillStyle = '#040810';
      ctx.fillText(lines[i], tx + 1, ty + 1);
      // Text
      ctx.fillStyle = this._type === 'fish' ? '#c0e4f4' : '#ffd088';
      ctx.fillText(lines[i], tx, ty);
    }

    ctx.restore();
  }

  _wrapText(ctx, text, maxWidth) {
    const words = text.split(' ');
    const lines = [];
    let line = '';
    for (const word of words) {
      const test = line ? line + ' ' + word : word;
      if (ctx.measureText(test).width > maxWidth && line) {
        lines.push(line);
        line = word;
      } else {
        line = test;
      }
    }
    if (line) lines.push(line);
    return lines.length > 0 ? lines : [''];
  }

  get isVisible() { return this._visible; }
}

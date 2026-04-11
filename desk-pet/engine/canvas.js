/**
 * Canvas manager with GBA-style pixel buffer.
 * Internal resolution ~240px wide (GBA native), integer-scaled to viewport.
 */

const INTERNAL_W = 240;

export class CanvasManager {
  /** @param {HTMLCanvasElement} el */
  constructor(el) {
    this._el = el;
    this._screenCtx = el.getContext('2d');
    this._raf = 0;
    this._lastTs = 0;
    this._renderFn = null;
    this._screenW = 0;
    this._screenH = 0;
    this._scale = 1;

    this._off = document.createElement('canvas');
    this._ctx = this._off.getContext('2d');
    this._w = INTERNAL_W;
    this._h = INTERNAL_W;

    this.resize();
    window.addEventListener('resize', () => this.resize());
  }

  resize() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    const dpr = window.devicePixelRatio || 1;

    this._el.width = w * dpr;
    this._el.height = h * dpr;
    this._el.style.width = w + 'px';
    this._el.style.height = h + 'px';
    this._screenCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this._screenW = w;
    this._screenH = h;

    // Internal buffer: fixed width, proportional height
    this._w = INTERNAL_W;
    this._h = Math.round(INTERNAL_W * (h / w));
    this._off.width = this._w;
    this._off.height = this._h;
    this._ctx.imageSmoothingEnabled = false;

    // Integer scale factor
    this._scale = Math.max(1, Math.floor(w / this._w));
  }

  clear() { this._ctx.clearRect(0, 0, this._w, this._h); }

  present() {
    this._screenCtx.imageSmoothingEnabled = false;
    this._screenCtx.drawImage(this._off, 0, 0, this._screenW, this._screenH);
  }

  screenToInternal(screenX, screenY) {
    const rect = this._el.getBoundingClientRect();
    return {
      x: ((screenX - rect.left) / rect.width) * this._w,
      y: ((screenY - rect.top) / rect.height) * this._h,
    };
  }

  internalToScreen(ix, iy) {
    return {
      x: (ix / this._w) * this._screenW,
      y: (iy / this._h) * this._screenH,
    };
  }

  startLoop(fn) {
    this._renderFn = fn;
    this._lastTs = performance.now();
    const tick = (ts) => {
      const dt = Math.min((ts - this._lastTs) / 1000, 0.1);
      this._lastTs = ts;
      this._renderFn(dt);
      this._raf = requestAnimationFrame(tick);
    };
    this._raf = requestAnimationFrame(tick);
  }

  stopLoop() { cancelAnimationFrame(this._raf); }

  get ctx() { return this._ctx; }
  get screenCtx() { return this._screenCtx; }
  get width() { return this._w; }
  get height() { return this._h; }
  get screenWidth() { return this._screenW; }
  get screenHeight() { return this._screenH; }
  get el() { return this._el; }
}

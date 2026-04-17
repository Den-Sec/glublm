/**
 * Optional sprite-atlas loader for the goldfish.
 *
 * If `fish-atlas.png` + `fish-atlas.json` are present under
 * `desk-pet/assets/sprites/`, the renderer uses them. If either fetch
 * fails (404, parse error, offline), the loader enters the 'failed'
 * state and `sprites.js` silently falls back to the procedural path.
 *
 * JSON format follows Aseprite's "hash" export — see CONTRIBUTING-ART.md.
 */

export class SpriteAtlasLoader {
  constructor() {
    this._image = null;
    this._frames = {};
    this._status = 'idle'; // 'idle' | 'loading' | 'loaded' | 'failed'
  }

  /**
   * Load the atlas. Never throws — sets status='failed' on error so that
   * callers can branch on isReady without try/catch scaffolding.
   * @returns {Promise<boolean>} true on success, false on any failure.
   */
  async load(pngUrl, jsonUrl) {
    this._status = 'loading';
    try {
      const [bitmap, meta] = await Promise.all([
        fetch(pngUrl).then((r) => {
          if (!r.ok) throw new Error(`png ${r.status}`);
          return r.blob();
        }).then((blob) => createImageBitmap(blob)),
        fetch(jsonUrl).then((r) => {
          if (!r.ok) throw new Error(`json ${r.status}`);
          return r.json();
        }),
      ]);
      this._image = bitmap;
      this._frames = (meta && meta.frames) || {};
      this._status = 'loaded';
      return true;
    } catch (e) {
      console.warn('[sprite-loader] atlas not loaded (running procedural fallback):', e.message);
      this._image = null;
      this._frames = {};
      this._status = 'failed';
      return false;
    }
  }

  /**
   * Return source rect + image handle for a named pose, or null.
   * Accepts Aseprite's hash format entries { frame: { x, y, w, h } }.
   */
  getFrame(poseName) {
    if (!this.isReady) return null;
    const entry = this._frames[poseName];
    const f = entry && entry.frame;
    if (!f) return null;
    return { image: this._image, sx: f.x, sy: f.y, sw: f.w, sh: f.h };
  }

  get isReady() {
    return this._status === 'loaded' && this._image !== null;
  }

  get status() {
    return this._status;
  }
}

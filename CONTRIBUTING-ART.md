# Contributing pixel-art sprites

Want to redesign the goldfish? You don't need to touch any rendering code —
drop two files into `desk-pet/assets/sprites/` and the engine picks them up
at load time. If anything fails to load, the original procedural renderer
runs and nothing breaks.

## Recommended tools

- **[Aseprite](https://www.aseprite.org/)** (paid, one-time purchase) — ideal:
  has a first-class spritesheet exporter that writes the exact JSON format
  the loader expects.
- **[Piskel](https://www.piskelapp.com/)** (free, web or desktop) — works,
  but the JSON file has to be hand-written (short — see example below).

Whatever you use, disable anti-aliasing and stick to integer pixels.

## Sprite spec

- **Frame size**: 16 × 16 pixels, each pose in its own cell along a
  single row.
- **Orientation**: fish faces **right** in every pose. The engine mirrors
  horizontally at render time (`ctx.scale(-1, 1)`) when the fish is
  swimming left.
- **Palette** (matches the procedural renderer so overlays line up):
  | role | hex |
  |---|---|
  | body | `#ff8b3d` |
  | outline (dark orange) | `#d45a1a` |
  | belly highlight | `#ffb870` |
  | tail / fins | `#ff6b2d` |
  | tail dark | `#cc4a10` |
  | eye | `#1a1a1a` |
  | eye highlight | `#ffffff` |
  | mouth | `#cc3300` |

  Leave these colors untouched for the state overlays (Z bubbles,
  sparkles, question marks, bubble blow arc) — those get drawn on top by
  the engine in `#7bb8e0`, `#ffdd44`, `#88ccee`, `#8B4513` respectively
  and assume the base sprite doesn't already use those hues.

## Poses

Fill the atlas in this order (x positions 0 / 16 / 32 / 48):

| pose | used by | notes |
|---|---|---|
| `fish_neutral` | idle_swim, wiggle, forget, excited, bump_glass, sad, turn_around, happy (fallback) | required |
| `fish_mouth_open` | talk (even frames), eat (first half), bubble_blow (first three frames) | required |
| `fish_eyes_closed` | sleep | required; Z bubbles drawn procedurally |
| `fish_smile` | happy | optional; if absent, happy falls back to `fish_neutral` + sparkle overlay |

## File layout

```
desk-pet/assets/sprites/
  fish-atlas.png     # 64 × 16 PNG (or 48 × 16 if you skip fish_smile)
  fish-atlas.json    # hash-format metadata, see below
```

## JSON format (Aseprite "hash")

```json
{
  "frames": {
    "fish_neutral":     { "frame": { "x":  0, "y": 0, "w": 16, "h": 16 } },
    "fish_mouth_open":  { "frame": { "x": 16, "y": 0, "w": 16, "h": 16 } },
    "fish_eyes_closed": { "frame": { "x": 32, "y": 0, "w": 16, "h": 16 } },
    "fish_smile":       { "frame": { "x": 48, "y": 0, "w": 16, "h": 16 } }
  },
  "meta": { "size": { "w": 64, "h": 16 }, "scale": "1" }
}
```

The engine only reads `frames[pose].frame.{x,y,w,h}`. Everything else in
the JSON is optional metadata.

## Export workflow

### Aseprite

1. Arrange your four poses left-to-right as tagged animation frames, or
   simply as four separate frames in one file.
2. **File → Export Spritesheet…**
3. Layout: **By Rows**. Constraints: **None** (keep 16×16 per cell).
4. Output: **Output File** `desk-pet/assets/sprites/fish-atlas.png`.
5. **JSON Data**: enable; **Hash** format; filename
   `desk-pet/assets/sprites/fish-atlas.json`.
6. Frame tags / Item filename pattern: `{tag}` — and **set each frame's
   tag** to one of `fish_neutral`, `fish_mouth_open`, etc. so the
   resulting JSON uses pose names instead of numeric indices.

### Piskel

1. Export → **Spritesheet** → PNG, 1× scale. Save as
   `desk-pet/assets/sprites/fish-atlas.png`.
2. Create `desk-pet/assets/sprites/fish-atlas.json` by hand, copying
   the template above and adjusting `x` / `w` if your cells aren't all
   16 px.

## Testing your sprite

1. From the repo root:
   ```bash
   python -m http.server --directory desk-pet 8002
   ```
2. Open `http://localhost:8002/` in Chrome. DevTools console should show
   **no** `[sprite-loader] atlas not loaded` warning — if you do see it,
   double-check the filenames (`fish-atlas.png`, `fish-atlas.json`) and
   that they're both under `desk-pet/assets/sprites/`.
3. Watch the fish for ~30 seconds. It will cycle through states (talk,
   happy, excited, sleep if you wait long enough). Any state that looks
   off points at either the pose it uses or the overlay colors colliding
   with your art.

## Limitations (known)

- The 4-frame tail wiggle in `idle_swim` currently gets approximated as a
  1px vertical body bob when the atlas is active — a static atlas frame
  can't reproduce per-pixel tail offset. If you want a real per-frame
  tail, add poses like `fish_tail_up` / `fish_tail_neutral` /
  `fish_tail_down` and open an issue; we'd extend the renderer to cycle
  through them.
- The `sad` and `turn_around` states stay procedural regardless of atlas
  presence — they rely on effects (limp tail drop, horizontal squash)
  that need the flat-pixel renderer.

## Contributing the art back

Open a PR with:
- the two files in `desk-pet/assets/sprites/`
- a `before/after` screenshot or a short GIF (the
  [`tools/video-to-gif.sh`](tools/video-to-gif.sh) script packages a
  screen recording for you)
- your name in the PR description so credit goes in the commit trailer

Small style diffs welcome too. The goldfish is supposed to feel a little
hand-made.

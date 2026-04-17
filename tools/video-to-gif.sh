#!/usr/bin/env bash
# video-to-gif.sh - convert a screen-recorded video to an optimized GIF
#
# Usage:
#   ./tools/video-to-gif.sh INPUT.mp4 OUTPUT.gif [fps=15] [size=480]
#
# Requires `ffmpeg` in PATH. On Windows, Dennis has ffmpeg at
# C:/Users/Dennis/Downloads/ffmpeg-7z-extract/ffmpeg-.../bin/ffmpeg.exe —
# add that directory to PATH in your shell before invoking this script.
#
# Two-pass palette optimization (128 colors) + lanczos scaling + bayer dither
# typically keeps 8-12 seconds of pixel art under 2 MB.

set -euo pipefail

INPUT="${1:?input video required (e.g. recording.mp4)}"
OUTPUT="${2:?output gif path required (e.g. hero-idle.gif)}"
FPS="${3:-15}"
SIZE="${4:-480}"

if ! command -v ffmpeg >/dev/null 2>&1; then
  echo "error: ffmpeg not found in PATH" >&2
  echo "  on Windows, add the ffmpeg bin directory to PATH first" >&2
  exit 1
fi

if [[ ! -f "$INPUT" ]]; then
  echo "error: input file not found: $INPUT" >&2
  exit 1
fi

PALETTE=$(mktemp --suffix=.png)
trap 'rm -f "$PALETTE"' EXIT

echo "[1/2] generating palette (${FPS}fps, width=${SIZE}, 128 colors)..."
ffmpeg -v error -y -i "$INPUT" \
  -vf "fps=${FPS},scale=${SIZE}:-1:flags=lanczos,palettegen=max_colors=128" \
  "$PALETTE"

echo "[2/2] applying palette + bayer dither..."
ffmpeg -v error -y -i "$INPUT" -i "$PALETTE" \
  -filter_complex "fps=${FPS},scale=${SIZE}:-1:flags=lanczos [x]; [x][1:v] paletteuse=dither=bayer:bayer_scale=5" \
  "$OUTPUT"

SIZE_BYTES=$(wc -c < "$OUTPUT")
printf 'done: %s (%.1f KB)\n' "$OUTPUT" "$(awk "BEGIN { print $SIZE_BYTES / 1024 }")"

// gen-hero-gif.js
// Generate marketing GIFs of the GlubLM Desk Pet from its local HTML.
//
// Usage:
//   cd tools && npm install
//   node gen-hero-gif.js
//
// Requires FFmpeg on PATH. If missing, the script prints install instructions
// and exits without failing.
//
// Outputs:
//   desk-pet/assets/screenshots/hero-idle.gif  (5s, 30fps idle swim)
//   desk-pet/assets/screenshots/hero-chat.gif  (~8s, type + response + bubble)
//
// hero-daynight.gif is intentionally skipped - the desk-pet engine derives
// palettes from `new Date().getHours()` with no runtime override hook, and
// we are not allowed to modify engine code.

import { chromium } from 'playwright';
import { spawnSync } from 'child_process';
import { mkdirSync, rmSync, existsSync, readdirSync, statSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { dirname, join, resolve } from 'path';
import { fileURLToPath, pathToFileURL } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, '..');
const PWA_HTML = resolve(REPO_ROOT, 'desk-pet', 'index.html');
const OUT_DIR = resolve(REPO_ROOT, 'desk-pet', 'assets', 'screenshots');

// 480x480 is a sane square that matches the canvas aspect for social cards.
const VIEWPORT = { width: 480, height: 480 };
const FPS = 30;

function log(msg) { console.log(`[gen-hero-gif] ${msg}`); }
function warn(msg) { console.warn(`[gen-hero-gif] WARN: ${msg}`); }
function err(msg)  { console.error(`[gen-hero-gif] ERROR: ${msg}`); }

function checkFfmpeg() {
  const r = spawnSync('ffmpeg', ['-version'], { encoding: 'utf8', shell: false });
  if (r.error || r.status !== 0) {
    return false;
  }
  return true;
}

function printFfmpegHelp() {
  console.log('');
  console.log('FFmpeg not found on PATH. Install one of:');
  console.log('');
  console.log('  Windows (winget):  winget install Gyan.FFmpeg');
  console.log('  Windows (choco) :  choco install ffmpeg');
  console.log('  macOS   (brew)  :  brew install ffmpeg');
  console.log('  Linux   (apt)   :  sudo apt-get install -y ffmpeg');
  console.log('');
  console.log('Then re-run: node tools/gen-hero-gif.js');
}

function freshFrameDir(label) {
  const dir = join(tmpdir(), `glub-frames-${label}-${Date.now()}`);
  if (existsSync(dir)) rmSync(dir, { recursive: true, force: true });
  mkdirSync(dir, { recursive: true });
  return dir;
}

function encodeGif(frameDir, outFile, fps = FPS) {
  // Use a 2-pass palettegen/paletteuse for decent quality.
  const palette = join(frameDir, 'palette.png');
  const common = ['-y', '-framerate', String(fps), '-i', join(frameDir, 'f_%04d.png')];

  const genArgs = [...common, '-vf', `fps=${fps},scale=480:-1:flags=neighbor,palettegen=max_colors=128`, palette];
  let r = spawnSync('ffmpeg', genArgs, { stdio: 'inherit' });
  if (r.status !== 0) throw new Error(`ffmpeg palettegen exited ${r.status}`);

  const useArgs = [
    ...common,
    '-i', palette,
    '-filter_complex', `fps=${fps},scale=480:-1:flags=neighbor[v];[v][1:v]paletteuse=dither=bayer:bayer_scale=5`,
    '-loop', '0',
    outFile,
  ];
  r = spawnSync('ffmpeg', useArgs, { stdio: 'inherit' });
  if (r.status !== 0) throw new Error(`ffmpeg paletteuse exited ${r.status}`);
}

async function waitForFishReady(page) {
  // Loading overlay gets `fade-out` class once ORT session + tokenizer are up.
  try {
    await page.waitForSelector('#loading.fade-out', { timeout: 15000 });
    log('loading screen faded out');
  } catch {
    warn('loading.fade-out not seen in 15s - continuing anyway');
  }
  // Let the state machine settle into idle swim for a beat.
  await page.waitForTimeout(1200);
}

async function captureFrames(page, frameDir, durationMs, fps = FPS) {
  const total = Math.round((durationMs / 1000) * fps);
  const period = 1000 / fps;
  const started = Date.now();
  for (let i = 0; i < total; i++) {
    const target = started + i * period;
    const delay = target - Date.now();
    if (delay > 0) await page.waitForTimeout(delay);
    const name = `f_${String(i + 1).padStart(4, '0')}.png`;
    await page.screenshot({ path: join(frameDir, name), type: 'png' });
  }
  return total;
}

async function renderVariant(browser, label, durationMs, interact) {
  log(`-- variant ${label} (${durationMs}ms) --`);
  const context = await browser.newContext({
    viewport: VIEWPORT,
    deviceScaleFactor: 1,
    // Local file: no network; still want a stable UA.
    userAgent: 'Mozilla/5.0 (glublm-hero-gif)'
  });
  const page = await context.newPage();
  const url = pathToFileURL(PWA_HTML).toString();
  await page.goto(url, { waitUntil: 'load' });
  await waitForFishReady(page);

  if (interact) {
    try { await interact(page); }
    catch (e) { warn(`interact() threw: ${e.message}`); }
  }

  const frameDir = freshFrameDir(label);
  const frames = await captureFrames(page, frameDir, durationMs);
  log(`${label}: captured ${frames} frames -> ${frameDir}`);

  await context.close();

  const outFile = join(OUT_DIR, `hero-${label}.gif`);
  encodeGif(frameDir, outFile);

  // Cleanup temp frames - they can be hundreds of MBs.
  rmSync(frameDir, { recursive: true, force: true });

  const size = statSync(outFile).size;
  log(`${label}: wrote ${outFile} (${(size / 1024).toFixed(1)} KB)`);
  return { label, file: outFile, size };
}

async function main() {
  if (!existsSync(PWA_HTML)) {
    err(`PWA html not found at ${PWA_HTML}`);
    process.exit(1);
  }
  mkdirSync(OUT_DIR, { recursive: true });

  const hasFfmpeg = checkFfmpeg();
  if (!hasFfmpeg) {
    err('FFmpeg is not available.');
    printFfmpegHelp();
    process.exit(2);
  }

  log(`using PWA html: ${PWA_HTML}`);
  log(`output dir    : ${OUT_DIR}`);

  const browser = await chromium.launch({ headless: true });
  const results = [];
  try {
    // 1) hero-idle - pure idle swim, 5s.
    results.push(await renderVariant(browser, 'idle', 5000, null));

    // 2) hero-chat - type "hi", submit, watch response + speech bubble.
    results.push(await renderVariant(browser, 'chat', 8000, async (page) => {
      const prompt = await page.waitForSelector('#prompt:not([disabled])', { timeout: 20000 });
      await prompt.click();
      await page.keyboard.type('hi', { delay: 120 });
      await page.keyboard.press('Enter');
      // Immediately yield to the page so the first typed frames show the word
      // before the model replies.
      await page.waitForTimeout(150);
    }));

    // 3) hero-daynight - skipped by design. The engine uses
    // `new Date().getHours()` directly and exposes no runtime hook, and we
    // are scoped out of engine edits. Documented in the task report.
  } finally {
    await browser.close();
  }

  log('done.');
  for (const r of results) {
    log(`  ${r.label}: ${r.file} (${(r.size / 1024).toFixed(1)} KB)`);
  }
}

main().catch((e) => {
  err(e.stack || e.message);
  process.exit(1);
});

# GlubLM Desk Pet - Ultraplan (Master Implementation Roadmap)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build GlubLM Desk Pet - an interactive pixel-art goldfish companion running GlubLM v0.3.1 (35M params, ONNX 40MB) entirely in the browser. Offline-capable PWA with idle behaviors, speech bubbles, push notifications, zero server.

**Architecture:** Canvas 2D rendering engine, sprite-based animation, finite state machine, ONNX Runtime Web for inference, Service Worker for offline/PWA, Notification API for push. No build tools, no framework - pure vanilla JS ES modules.

**Tech Stack:** HTML5 Canvas, vanilla JavaScript (ES modules), CSS, ONNX Runtime Web 1.19.x (CDN), Service Worker API, Web App Manifest, Notifications API.

**Spec:** [`../specs/2026-04-10-deskpet-design.md`](../specs/2026-04-10-deskpet-design.md)

**Parent project:** [GlubLM v0.3.1](../specs/2026-04-09-glublm-design.md) | [Original ultraplan](2026-04-09-glublm-ultraplan.md)

---

## Phase Overview

| Phase | Sub-plan | Tasks | Est. steps | Deliverable |
|-------|----------|-------|------------|-------------|
| **1. Core Engine** | [`2026-04-10-deskpet-phase-1-engine.md`](2026-04-10-deskpet-phase-1-engine.md) | 15 | ~90 | Canvas bowl, sprite animation, state machine, fish movement, click interaction, placeholder sprites |
| **2. Intelligence** | [`2026-04-10-deskpet-phase-2-intelligence.md`](2026-04-10-deskpet-phase-2-intelligence.md) | 12 | ~75 | ONNX inference, speech bubbles, chat input, 500+ idle phrases, time-aware scheduling |
| **3. PWA + Polish** | [`2026-04-10-deskpet-phase-3-pwa.md`](2026-04-10-deskpet-phase-3-pwa.md) | 11 | ~65 | Service Worker, offline caching, PWA install, notifications, settings, mobile polish, deploy |

**Total:** 38 tasks / ~230 steps across 3 phases.

---

## Execution Dependencies

```
┌──────────────────────────────────────────────────┐
│              Phase 1: Core Engine                │
│  (canvas, sprites, state machine, bowl,          │
│   movement, click - NO model dependency)         │
└────────────────────┬─────────────────────────────┘
                     │
                     │ exports: canvas renderer, state machine,
                     │          sprite engine, movement system
                     │
        ┌────────────┴────────────────────┐
        │                                 │
        ▼                                 ▼
┌───────────────────────┐    ┌────────────────────────┐
│ Phase 2: Intelligence │    │ Phase 3: PWA + Polish  │
│ (inference, chat,     │    │ (SW, offline, notifs,  │
│  idle phrases,        │    │  install, settings)    │
│  speech bubbles)      │    │                        │
└───────────┬───────────┘    └────────────┬───────────┘
            │                             │
            │   Phase 3 can start after   │
            │   Phase 1, but needs Phase  │
            │   2 for notification content│
            │                             │
            └──────────┬──────────────────┘
                       │
                       ▼
              ┌─────────────────┐
              │  Final Deploy   │
              │  (GH Pages,    │
              │   mobile test)  │
              └─────────────────┘
```

- Phase 1 can start immediately (no external dependencies)
- Phase 2 requires Phase 1 (needs canvas renderer + state machine)
- Phase 3 core (SW, manifest) can start after Phase 1
- Phase 3 notifications need Phase 2 idle phrases
- Deploy requires both Phase 2 and Phase 3

---

## Global Conventions

### Directory Structure

```
desk-pet/                       # New top-level directory
├── index.html                  # PWA shell
├── manifest.json               # Web app manifest
├── sw.js                       # Service Worker
├── style.css                   # Minimal CSS
├── app.js                      # Entry point
├── engine/                     # Rendering + logic
│   ├── canvas.js               # Canvas manager
│   ├── sprites.js              # Sprite sheet + animation
│   ├── state-machine.js        # Fish FSM
│   ├── movement.js             # Position + velocity + bounds
│   ├── bowl.js                 # Bowl background renderer
│   ├── bubbles.js              # Ambient bubble particles
│   ├── speech.js               # Speech bubble renderer
│   └── idle.js                 # Idle phrase scheduler
├── inference/                  # ONNX model
│   ├── model.js                # OnnxModel wrapper
│   └── tokenizer.js            # SimpleBPE
├── data/
│   └── idle-phrases.json       # 500+ phrases
├── assets/
│   ├── sprites.png             # Sprite sheet
│   ├── sprite-meta.js          # Animation metadata
│   └── icons/
│       ├── icon-192.png
│       └── icon-512.png
├── model.onnx                  # Copied from web/
└── tokenizer.json              # Copied from web/
```

### Commits

- One commit per task
- Format: `feat(desk-pet): <description>`
- Types: feat, test, fix, chore, docs, refactor
- Trailer: `Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>`

### Testing

- Manual browser testing (no jest/vitest - it's pure canvas + browser APIs)
- Each phase ends with a manual checklist verification
- Test on: Chrome desktop, Chrome mobile (Android), Safari mobile (iOS if available)
- Console must be error-free
- Performance: check DevTools Performance tab for frame drops

### Code Quality

- ES modules with named exports
- JSDoc on every public class/function
- No bare `catch`, no `var`, no `==`
- `const` by default, `let` only when reassignment needed
- Max line 100 chars
- No build step - files are served as-is

### Secrets

- None. Zero server, zero API keys. Everything runs client-side.

---

## Milestones

| Milestone | Phase | Criteria |
|-----------|-------|----------|
| **M1: Empty bowl renders** | 1 | Canvas shows bowl with water gradient, gravel, plants. Responsive to viewport. |
| **M2: Fish swims** | 1 | Placeholder sprite moves smoothly within bowl bounds, flips on direction change. |
| **M3: Fish reacts** | 1 | Click → wiggle, double-click → excited, long-press → happy. State machine transitions work. |
| **M4: Fish talks (idle)** | 2 | Speech bubble appears with idle phrase, auto-dismisses, time-aware selection. |
| **M5: Fish responds** | 2 | User types → ONNX generates → response in speech bubble. Full inference pipeline. |
| **M6: Works offline** | 3 | After first load, airplane mode → everything still works. Model cached. |
| **M7: Installable** | 3 | PWA install prompt works on Chrome/Edge. App opens standalone. |
| **M8: Notifications** | 3 | Background tab → "hey where did you go?" notification appears. |
| **M9: Deployed** | 3 | Live on GitHub Pages, accessible at `den-sec.github.io/glublm/desk-pet/` (or root). |

---

## Risk Tracking

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| Canvas performance on low-end mobile | Low | Medium | Throttle animation FPS, reduce bubble particles, lazy-render background |
| ONNX Runtime 40MB + canvas = high memory | Medium | Medium | Profile memory, unload model if tab is hidden for >30min |
| Pixel art quality (placeholder vs final) | Medium | Low | Engine is sprite-agnostic; swap sheet anytime. Ship with placeholder, iterate art. |
| Service Worker cache 40MB model | Low | Medium | Streaming cache with progress feedback. Fallback: direct fetch if SW fails. |
| Notification API denied by user | High | Low | App works fine without notifications. Gentle re-prompt after 3 sessions. |
| iOS Safari PWA limitations | Medium | Medium | Notifications not supported on iOS PWA. Document limitation. Core experience still works. |
| Browser kills Service Worker | Medium | Low | Notifications stop but resume on next visit. Not critical. |

---

## Sprite Sheet Placeholder Specification

For development, we create simple placeholder sprites:
- 16x16 grid, orange oval (fish body) with black dot (eye)
- Different states distinguished by:
  - `idle_swim`: tail position changes (4 frames)
  - `talk`: mouth opens/closes (4 frames)
  - `happy`: bounces up/down (4 frames)
  - `sad`: droops down (3 frames)
  - `sleep`: eyes closed, Zzz (4 frames)
  - `eat`: mouth snap (4 frames)
  - `bump_glass`: squish animation (4 frames)
  - `forget`: question mark above (3 frames)
  - `excited`: rapid wiggle (4 frames)
  - `wiggle`: side-to-side (3 frames)
  - `bubble_blow`: bubble grows from mouth (5 frames)
  - `turn_around`: flip transition (4 frames)

**Sheet layout**: 5 columns x 12 rows = 80x192 pixels
**File**: `desk-pet/assets/sprites.png`

Placeholder can be procedurally generated via a small canvas script during Phase 1, or hand-drawn in Piskel.

---

## How to Execute

**For a fresh engineer:**

1. Read the spec: [`../specs/2026-04-10-deskpet-design.md`](../specs/2026-04-10-deskpet-design.md)
2. Read this ultraplan entirely
3. Start Phase 1: [`2026-04-10-deskpet-phase-1-engine.md`](2026-04-10-deskpet-phase-1-engine.md)
4. Execute task-by-task
5. Serve with any static server: `python -m http.server 8000 --directory desk-pet/`
6. Test in browser after every task
7. Phase 2 after Phase 1 is complete
8. Phase 3 can overlap with Phase 2 (SW + manifest don't need inference)
9. Final deploy after both Phase 2 and Phase 3 complete

**Serving for development:**
```bash
cd L:/Dennis/Projects/glublm
python -m http.server 8000 --directory desk-pet
# Open http://localhost:8000
```

**Recommended executor:** `superpowers:subagent-driven-development` with `model=opus`. Fresh subagent per task, reviewer loop. Each subagent serves the page and verifies visually (or at minimum checks console for errors).

---

## Non-Goals (reminder from spec)

- No chat history / conversation log
- No cloud sync / accounts
- No build tools / bundlers
- No framework (React/Vue/etc.)
- No backend / server
- No hardware port (evaluated separately)
- No sound effects (future consideration)
- No fish customization / skins
- No multi-turn memory (that's the point)

---

*End of master ultraplan. Open `2026-04-10-deskpet-phase-1-engine.md` to begin execution.*

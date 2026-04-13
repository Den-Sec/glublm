# GlubLM Companion - Design Spec

> A virtual pet companion system with needs, personality, and multi-device architecture.
>
> Date: 2026-04-13
> Status: Draft

## Overview

GlubLM Companion evolves the existing Desk Pet from a standalone browser demo into a full virtual pet with biological needs, personality growth, and a split-screen architecture that separates the aquarium display from the care controls.

The fish lives on a server. Clients are viewers. The pet continues to exist (and get hungry) whether anyone is watching or not.

## Architecture

### Server + Thin Clients (chosen approach)

A lightweight server process manages all pet state, runs AI inference, and broadcasts updates to connected clients via WebSocket.

```
                    +-------------------+
                    |     Server        |
                    |  - Pet state      |
                    |  - Needs engine   |
                    |  - AI inference   |
                    |  - Personality    |
                    |  - Persistence    |
                    +--------+----------+
                             |
                        WebSocket
                    +--------+----------+
                    |        |          |
              +-----+--+ +--+-----+ +--+------+
              |Aquarium| |Control| |Aquarium |
              |Monitor | |Phone  | |Tablet   |
              +--------+ +-------+ +---------+
```

**Server**: Node.js process. Runs on any machine (PC, homelab CT, Raspberry Pi, future dedicated hardware). Handles ONNX inference, pet simulation ticks, state persistence to disk (JSON). Exposes WebSocket for real-time sync + REST API for state queries.

**Aquarium viewer**: Full-screen bowl rendering. Reuses `desk-pet/engine/` modules (canvas, bowl, sprites, movement, bubbles, speech, dissolve). Display-only, no controls except click/touch interactions with the fish. Designed for a dedicated monitor in kiosk mode, or a browser tab.

**Controller**: Care interface. Status bars, fish quote, mini bowl preview, action buttons, chat input. Designed mobile-first for phone use. Actions send commands to server, server broadcasts state changes to all clients.

### Communication protocol

All clients connect via WebSocket to the server:

- **Server -> clients**: state updates (needs changed, fish spoke, animation trigger, mood shift)
- **Controller -> server**: actions (feed, clean, chat message, play)
- **Aquarium -> server**: interaction events (click on fish, cursor position)

State updates are delta-based (only changed fields), with full state sync on connect.

### Relationship with desk-pet/

The existing `desk-pet/` PWA remains as the "lite" version - standalone, offline, no needs system, no server required. It continues to be deployed on GitHub Pages.

The `companion/` system imports rendering modules from `desk-pet/engine/` to avoid duplication. The engine modules are pure (no side effects, no global state) and work in both contexts.

```
glublm/
  desk-pet/              # Standalone PWA (unchanged, GitHub Pages)
    engine/              # Shared rendering modules
    inference/           # Browser-side ONNX (used by desk-pet only)
    app.js, index.html   # Standalone entry point
  companion/             # NEW - full companion system
    server/              # Node.js server
      index.js           # Entry point
      pet-state.js       # Pet simulation engine
      needs-engine.js    # Hunger, cleanliness, health decay
      personality.js     # 3-layer personality system
      inference.js       # Server-side ONNX inference
      ws-server.js       # WebSocket broadcast
      persistence.js     # JSON state save/load
    aquarium/            # Viewer client
      index.html
      app.js             # Imports from desk-pet/engine/
    controller/          # Care UI client
      index.html
      app.js
      style.css
```

## Needs System

### Stats

Four tracked values, all 0-100 float:

| Stat | Decay rate | Critical threshold | Visual cue |
|------|-----------|-------------------|------------|
| **Hunger** | 100 -> 0 in ~24h (~4.17/hr) | <15% = starving | Fish slows down, mouth opens looking for food |
| **Cleanliness** | 100 -> 0 in ~72-96h (~1.1-1.4/hr) | <20% = filthy | Water tint shifts clear -> murky -> green/brown, algae on glass |
| **Happiness** | Derived from hunger + cleanliness + interactions | <25% = depressed | Fish hangs near bottom, muted colors, fewer bubbles |
| **Health** | Derived from sustained hunger + cleanliness deficits | <10% = critical (belly-up) | Fish floats upside down, barely moves |

**Bond** is a separate long-term stat (see Personality section). Not displayed as a "need" but visible in the controller.

### Decay model

Needs decay continuously on the server (tick-based, ~1 tick/second). Decay is linear with these modifiers:

- **Hunger**: base rate ~4.17/hr. Increased by 20% if water is dirty (<30% cleanliness) because stress increases metabolism.
- **Cleanliness**: base rate ~1.2/hr. Increased by each poop on the gravel (each poop adds +0.3/hr to decay). Cleaning poop removes the modifier. Water change resets to 100%.
- **Happiness**: no independent decay. Calculated as: `(hunger * 0.35) + (cleanliness * 0.25) + (interaction_bonus * 0.25) + (health * 0.15)`. Interaction bonus is a short-term boost from feeding, cleaning, chatting, playing - decays over ~2 hours.
- **Health**: no independent decay. Moves toward a target: if hunger > 40% AND cleanliness > 30%, health slowly recovers (+2/hr). If hunger < 15% OR cleanliness < 15%, health drops (-3/hr). If BOTH are critical, health drops fast (-6/hr). Health is the slow stat - it takes sustained neglect to damage, and sustained care to restore.

### Actions

**Feed**: drops food flakes into the bowl (visual animation). Hunger += 40 (capped at 100). Cooldown: 30 minutes between feeds. If fed more than 3 times in 4 hours, fish becomes bloated (happiness -15, extra poop generated, 2 hour recovery). The goldfish forgets it already ate and may ask for food even when full.

**Clean poop**: removes visible poop from the gravel (visual: poop sprites disappear one by one). Each poop removed reduces the cleanliness decay modifier. Quick action, no cooldown.

**Change water**: full cleanliness reset to 100%. Slower action (visual: water drains and refills over ~3 seconds). Cooldown: 4 hours (can't spam water changes).

**Play**: trigger a toy/interaction in the bowl (bubble wand, light pointer, etc.). Happiness interaction bonus += 20. Short cooldown (5 min). The fish chases/reacts to the toy.

**Talk** (chat): send a text message. Server runs ONNX inference with the current pet state injected into the prompt context. Response appears as speech bubble on aquarium + quote on controller.

### Poop cycle

After feeding, a poop event is scheduled 2-4 hours later (randomized). The poop appears as a small sprite on the gravel. Poop accumulates - if not cleaned, multiple poops pile up. Each poop accelerates water quality decay. Visual: small brown dots on the gravel, increasing in number.

### State escalation

```
Happy (all stats >60%)
  -> Hungry (hunger <50%) - fish mentions food in idle phrases
    -> Very hungry (hunger <25%) - fish visibly slow, sad expressions
      -> Starving (hunger <15%) - fish barely moves
        -> Critical (health <10%) - belly-up float
          -> Always recoverable: feed + clean = slow recovery
```

The fish never dies permanently. At belly-up, feeding and cleaning start a slow recovery sequence (health climbs back at +1/hr, fish gradually rights itself over ~30 min).

## Personality System

### Layer 1: Core trait (immutable)

The goldfish forgets. This never changes. Every conversation starts fresh. The fish does not remember previous chats, previous meals, or previous cleanings. This is hardcoded in the prompt template and the 96-token context window.

### Layer 2: Current mood (minutes to hours)

Driven by the needs system. Mood affects:
- **Idle phrase selection**: weighted by category. Happy fish picks from cheerful/philosophical. Hungry fish picks from hungry/confused. Dirty water fish picks from uncomfortable/existential.
- **Chat response tone**: the prompt template includes current mood context: "you are feeling [hungry/content/uncomfortable/scared]. you don't know why."
- **Animation behavior**: swim speed, bubble frequency, tail wag rate, eye openness.
- **Speech frequency**: happy fish talks more (every 30-90s). Sad fish talks rarely (every 2-5min). Critical fish barely speaks (every 10min, short phrases).

### Layer 3: Bond (weeks to months)

A persistent float 0-100 that represents the fish's unconscious comfort level with its owner. The fish does not know this value exists.

**Bond increases from**:
- Feeding when hungry (+0.5 per feed, max +2/day)
- Cleaning when dirty (+0.3 per clean)
- Chatting (+0.2 per conversation)
- Consistent daily care (+1 bonus if all stats stayed above 50% for 24h)

**Bond decreases from**:
- Sustained neglect (-0.5/day if any stat below 25%)
- Reaching critical state (-2 per belly-up event)
- Long absence (-0.1/day if no interaction for 48h+)

**Bond affects behavior**:
- **0-20 (stranger)**: fish avoids cursor, hides near castle, short responses, skittish animations
- **20-50 (familiar)**: neutral behavior, fish acknowledges presence without enthusiasm
- **50-75 (comfortable)**: fish swims toward cursor, longer responses, playful animations, approaches when controller opens
- **75-100 (bonded)**: fish excitedly wiggles when owner appears, has "habits" (favorite corner, feeding time anticipation), occasionally says things that hint at unconscious memory ("i feel like something good happens around this time...")

Bond is saved to persistent state and survives server restarts.

## AI Integration

### Prompt engineering

The server constructs the prompt for ONNX inference by injecting the current pet state:

```
[mood:hungry] [water:dirty] {user_message} ->
```

The mood/state prefix must be extremely compact because GlubLM has a hard 96-token context window with no separate system prompt. Every token of context eats into the response budget. The prefix is ~5-10 tokens max. Examples:

- Happy + clean: `[mood:happy] hello -> `
- Hungry + dirty: `[mood:hungry] [water:dirty] hello -> `
- Critical: `[mood:dying] hello -> `

This requires fine-tuning or prompt-tuning the model to understand these compact state tags. Alternative: select from pre-generated response pools for extreme states (critical fish doesn't need inference, just short canned phrases) and only use inference for normal/happy states where quality matters.

### Idle phrase modulation

The existing 530 idle phrases are categorized. The needs engine selects categories with weighted probability:

| State | Favored categories | Suppressed categories |
|-------|-------------------|----------------------|
| Happy + fed | cheerful, philosophical, meta | hungry, existential |
| Hungry | hungry, confused, forgetful | cheerful |
| Dirty water | uncomfortable, existential | cheerful, meta |
| Critical | minimal (short, quiet phrases only) | all except existential |
| High bond | affectionate subset, routine hints | skittish |
| Low bond | cautious, brief | affectionate |

New phrase categories needed for the companion (generated via Claude sub-agent, same pipeline as existing 530):
- `hungry` - "my tummy feels like... wait do i have a tummy?"
- `uncomfortable` - "the water is... thick today"
- `affectionate` - "oh! the big shape! i like when the big shape comes"
- `cautious` - "who's there. i'll just stay behind this rock."
- `critical` - "..." / "blub." / "everything is heavy"
- `routine_hints` - "i feel like something nice happens around now" (high bond only)

Target: ~200 new phrases across these categories.

## Controller UI

### Layout (mobile-first)

Single scrollable screen, GBA pixel aesthetic consistent with desk-pet:

1. **Header**: fish name + age counter + status indicator ("needs attention" / time)
2. **Quote box**: latest fish phrase, border color reflects mood (blue=ok, orange=needs, red=critical)
3. **Status bars**: hunger, water, happiness, bond. Color-coded green/orange/red. GBA-style striped fill.
4. **Mini bowl preview**: small live-rendered canvas showing the fish. Simplified renderer (static bowl background, fish sprite only, no particles) to keep mobile performance acceptable. Hidden on phone viewport to save space.
5. **Action buttons**: dynamic layout based on urgency
   - All stats OK: 2x2 grid, equal weight, muted colors
   - One stat urgent: that action becomes full-width, colored, top of list. Others compress below
   - Multiple urgent: stack by urgency, most critical on top
6. **Chat input**: text field + send button, always at bottom

### Responsive behavior

- **Phone (< 480px)**: single column, everything stacks, mini preview hidden (save space, you're looking at the real bowl on the monitor)
- **Tablet/desktop (> 480px)**: mini preview visible, wider action buttons

## Feature Non-Dependency

Core principle: every hardware/network feature is an optional enhancement. The system works fully without any of them.

### Core (always works)
- Pet state simulation (needs, mood, personality)
- AI inference (ONNX on server CPU)
- Aquarium rendering (browser canvas)
- Controller UI (browser)
- WebSocket sync (LAN)
- Persistence (JSON to disk)

### Optional enhancements (when available)
- **WiFi/Internet**: real-world time for day/night cycle (fallback: system clock). Weather data affects bowl ambiance (rainy day = darker water tint). Notification push to phone when pet needs attention.
- **Accelerometer/gyroscope** (future hardware): shake device = bowl water sloshes, fish startles. Tilt = fish slides to one side.
- **Light sensor** (future hardware): room brightness affects bowl lighting, fish sleeps in the dark.
- **Speaker** (future hardware): blub sounds on interactions, ambient water sounds.
- **Physical buttons** (future hardware): dedicated feed/clean buttons on the device.

Each enhancement is a plugin-style module that registers with the server. The server exposes a capability API - clients query what's available and adapt their UI (e.g., show "shake to play" prompt only if accelerometer is present).

## Aquarium Viewer

### Reused from desk-pet/engine/

All rendering modules are imported directly:
- `canvas.js` - pixel buffer + screen compositing
- `bowl.js` - water tiles, gravel, plants, castle, caustics, day/night palette
- `sprites.js` - procedural fish animation (12 states)
- `movement.js` - swim behavior, cursor tracking
- `bubbles.js` + `dissolve.js` - particle systems
- `speech.js` - GBA-style speech bubbles

### New visual elements

- **Poop sprites**: small brown dots on the gravel. Accumulate over time. Disappear with cleaning animation.
- **Dirty water overlay**: progressive tinting from clear to murky green. Implemented as a semi-transparent overlay layer that increases opacity as cleanliness drops.
- **Algae on glass**: at very low cleanliness (<20%), green spots appear on the bowl rim.
- **Food flakes**: falling particle animation when feeding. Fish swims to catch them.
- **Bloated fish**: slightly wider sprite + slower movement when overfed.
- **Belly-up state**: fish rotates 180 degrees, floats to surface, minimal movement. Eyes half-closed.
- **Recovery animation**: slow rotation back to normal over ~30 seconds when health improves past 15%.
- **Bond indicators**: high-bond fish wiggles excitedly on controller connect. Low-bond fish retreats to castle.

### Differences from desk-pet/

The aquarium viewer does NOT run ONNX inference locally. All inference happens on the server. The viewer receives text to display and animation commands via WebSocket:

```json
{"type": "speech", "text": "blub blub", "speaker": "fish", "mood": "happy"}
{"type": "animation", "state": "excited", "duration": 2}
{"type": "feed", "flakes": 5}
{"type": "poop", "action": "add", "position": {"x": 0.3, "y": 0.85}}
{"type": "water_quality", "level": 0.45}
```

## Tech Stack

- **Server**: Node.js (single process, no framework). ONNX Runtime Node for inference. `ws` library for WebSocket. State persistence to JSON file.
- **Clients**: Vanilla JS ES modules (consistent with desk-pet). No build step. Canvas 2D rendering.
- **Protocol**: WebSocket (real-time) + simple REST endpoints for initial state load.
- **Deployment**: runs anywhere Node.js runs. Docker optional. Homelab CT, Pi, local machine.

## Project Structure

```
glublm/
  desk-pet/                 # Standalone PWA (unchanged)
    engine/                 # Shared rendering - imported by companion
  companion/                # Full companion system
    server/
      index.js              # Entry: HTTP server + WebSocket + tick loop
      pet-state.js          # Central state object + serialization
      needs-engine.js       # Hunger/cleanliness/health decay + actions
      personality.js        # Mood calculation + bond tracking
      inference.js          # ONNX Runtime Node wrapper
      prompt-builder.js     # Constructs prompts from pet state
      phrase-selector.js    # Weighted idle phrase selection by mood
      ws-server.js          # WebSocket connection manager + broadcast
      persistence.js        # JSON save/load + auto-save interval
      capabilities.js       # Optional feature registry
    aquarium/
      index.html
      app.js                # Canvas setup + WebSocket client + render loop
      water-overlay.js      # Dirty water visual effect
      poop-sprites.js       # Poop rendering + animation
      food-animation.js     # Feeding flakes particle effect
    controller/
      index.html
      app.js                # UI state + WebSocket client
      style.css             # GBA-style controller theme
      status-bars.js        # Animated need bars
      action-buttons.js     # Dynamic urgency-based layout
    shared/
      protocol.js           # WebSocket message types + validation
      constants.js          # Shared timing constants, thresholds
    data/
      idle-phrases.json     # Extended phrase pool (~730: 530 existing + 200 new)
    package.json
    README.md
```

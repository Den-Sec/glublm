# Desk Pet Phase 2: Intelligence

> **Spec:** [`../specs/2026-04-10-deskpet-design.md`](../specs/2026-04-10-deskpet-design.md)
> **Ultraplan:** [`2026-04-10-deskpet-ultraplan.md`](2026-04-10-deskpet-ultraplan.md)
> **Depends on:** Phase 1 complete (canvas, sprites, state machine, movement)
> **Phase focus:** ONNX inference integration, speech bubbles, chat UI, 500+ idle phrases, time-aware scheduling

---

## Task 1: Refactor inference code from glub.js into ES modules

**Goal:** Extract SimpleBPE and inference logic from the existing `web/glub.js` into reusable modules.

- [ ] Step 1: Create `desk-pet/inference/tokenizer.js`:
  - Copy `SimpleBPE` class from `web/glub.js` (lines 38-150)
  - Export as `export class SimpleBPE { ... }`
  - Add JSDoc to public methods
  - No logic changes - exact same code, just modularized
- [ ] Step 2: Create `desk-pet/inference/model.js`:
  - Extract sampling and generation logic from `web/glub.js`
  - Wrap in a class:
    ```javascript
    export class OnnxModel {
      constructor({ maxCtx, maxNewTokens, minNewTokens, temperature, topK })
      async load(modelUrl, tokenizerUrl, onProgress)
      async generate(promptText)
      get isReady()
      get isGenerating()
    }
    ```
  - `load()`: fetches model + tokenizer, creates ONNX session, reports progress
  - `generate()`: encodes prompt, runs inference loop, returns decoded text
  - Move constants (MAX_CTX=96, MAX_NEW_TOKENS=32, etc.) to constructor params with defaults
- [ ] Step 3: Test: import in `app.js`, verify model loads and generates (quick smoke test in console)
- [ ] Step 4: Handle loading progress:
  - `onProgress(stage, percent)` callback in `load()`
  - Stages: 'downloading_model', 'downloading_tokenizer', 'loading_runtime', 'ready'
  - Model download progress via `Response.body` stream with `Content-Length`

**Files:** `desk-pet/inference/tokenizer.js`, `desk-pet/inference/model.js`

---

## Task 2: Copy model assets

**Goal:** Make ONNX model and tokenizer available to the desk pet.

- [ ] Step 1: Copy `web/model.onnx` to `desk-pet/model.onnx`
- [ ] Step 2: Copy `web/tokenizer.json` to `desk-pet/tokenizer.json`
- [ ] Step 3: Add ONNX Runtime Web script tag to `index.html`:
  ```html
  <script src="https://cdn.jsdelivr.net/npm/onnxruntime-web@1.19.2/dist/ort.min.js"></script>
  ```
- [ ] Step 4: Verify: model loads in desk-pet context, generate returns text

**Note:** These are large files (40MB model). We copy rather than symlink because desk-pet may deploy independently. The service worker will cache them.

**Files:** `desk-pet/model.onnx`, `desk-pet/tokenizer.json`, `desk-pet/index.html`

---

## Task 3: Speech bubble renderer

**Goal:** Render pixel-art style speech bubbles on the canvas.

- [ ] Step 1: Create `desk-pet/engine/speech.js`:
  ```javascript
  export class SpeechBubble {
    constructor(canvasManager)
    show(text, { x, y, duration, type })  // type: 'fish' | 'user'
    update(dt)                             // handle fade timer
    render(ctx)                            // draw bubble + text
    get isVisible()
    dismiss()                              // immediately hide
  }
  ```
- [ ] Step 2: Implement bubble shape:
  - Rounded rectangle with pixel-art border (1px dark outline, white fill)
  - Small triangular pointer at bottom pointing toward fish
  - Position: above fish, centered horizontally with clamping to bowl edges
  - Max width: 60% of bowl width
- [ ] Step 3: Implement text rendering:
  - Use canvas `fillText` with a small monospace font (12-14px)
  - Word wrapping: split text into lines that fit max width
  - Padding: 6px inside bubble
  - Color: dark blue (#2a4a6b)
- [ ] Step 4: Implement lifecycle:
  - Fade in: 200ms opacity transition
  - Visible: duration based on text length (min 3s, max 8s, ~50ms per char)
  - Fade out: 300ms opacity transition
  - Auto-dismiss after duration
- [ ] Step 5: Support two bubble types:
  - `fish`: appears above the fish, pointer down
  - `user`: appears at bottom of bowl, different style (slightly transparent)
- [ ] Step 6: Wire into render pipeline (Layer 4, after fish, before glass)
- [ ] Step 7: Verify: trigger `speechBubble.show("blub blub blub!", ...)` from console, see bubble appear and fade

**Files:** `desk-pet/engine/speech.js`, `desk-pet/app.js`

---

## Task 4: Chat input integration

**Goal:** User can type a message and get a response from the fish.

- [ ] Step 1: Enable the text input in `index.html`:
  - Input field: `<input id="prompt" type="text" placeholder="say something to the goldfish...">`
  - Send button: `<button id="send">></button>` (or just Enter key)
  - Style: semi-transparent background, positioned at bottom of viewport
  - Initially disabled (enabled when model loads)
- [ ] Step 2: Implement chat flow in `app.js`:
  ```javascript
  async function handleChat(userText) {
    // 1. Show user text as user speech bubble (brief, 2-3s)
    // 2. Transition fish to TALKING state
    // 3. Run inference: model.generate(userText)
    // 4. Show response as fish speech bubble
    // 5. Transition to contextual state (HAPPY, FORGETTING, etc.)
    // 6. Update last interaction time
    // 7. Re-enable input
  }
  ```
- [ ] Step 3: Disable input during generation (prevent double-submit):
  - Input disabled + placeholder changes to "thinking..." while generating
  - Re-enabled after response shown
- [ ] Step 4: Handle Enter key submit + button click
- [ ] Step 5: Handle empty input (ignore) and very long input (truncate to reasonable length)
- [ ] Step 6: Post-chat state transition:
  - After response, 70% chance → HAPPY, 20% → FORGETTING, 10% → EXCITED
  - Transition happens after speech bubble is shown (not during)
- [ ] Step 7: Mobile: auto-focus input on tap, blur on submit (hides keyboard)
- [ ] Step 8: Verify: type "hello" → fish talks → response appears → state transitions

**Files:** `desk-pet/app.js`, `desk-pet/index.html`, `desk-pet/style.css`

---

## Task 5: Loading progress with model download

**Goal:** Show download progress while the 40MB model loads.

- [ ] Step 1: Update loading sequence in `app.js`:
  ```
  Phase 1 assets loaded → "finding the fish..." (instant)
  Model downloading → "adopting goldfish... 42%" (progress bar)
  Model loaded → "glub!" → transition to bowl
  ```
- [ ] Step 2: Implement progress bar on canvas:
  - Centered horizontally
  - Simple pixel-art style bar (outline + fill)
  - Percentage text above
  - Uses `onProgress` callback from OnnxModel.load()
- [ ] Step 3: Handle stalled download:
  - If no progress for 30 seconds, show "the goldfish is swimming slowly..."
  - Allow user to refresh
- [ ] Step 4: Smart loading: if model is already cached (SW), skip progress bar, show "glub!" immediately
- [ ] Step 5: Verify: clear cache, reload, see progress bar during download. Then reload with cache, see instant load.

**Files:** `desk-pet/app.js`

---

## Task 6: Generate idle phrases (500+)

**Goal:** Create the idle phrase pool using Claude to match GlubLM's tone.

- [ ] Step 1: Create a generation prompt that captures GlubLM's voice:
  - Lowercase, no punctuation except periods and question marks
  - Forgetful mid-sentence ("wait what was i saying")
  - Naive about the world outside the bowl
  - Philosophical about small things
  - Cheerful and present-moment focused
  - Examples from the dataset as reference
- [ ] Step 2: Generate phrases by category:
  - morning: 40+ phrases
  - afternoon: 40+ phrases
  - evening: 40+ phrases
  - night: 30+ phrases
  - bored: 50+ phrases
  - hungry: 30+ phrases
  - post_chat: 40+ phrases
  - long_silence: 30+ phrases
  - existential: 50+ phrases
  - meta: 40+ phrases
  - cheerful: 50+ phrases
  - forgetful: 60+ phrases
  - Total target: 500-600 phrases
- [ ] Step 3: Review and deduplicate:
  - Remove near-duplicates (edit distance < 5)
  - Remove any that break character (too smart, too long, references outside world too much)
  - Ensure variety within each category
- [ ] Step 4: Create `desk-pet/data/idle-phrases.json`:
  ```json
  {
    "version": 1,
    "phrases": [
      { "text": "...", "category": "morning", "weight": 1.0 },
      ...
    ]
  }
  ```
- [ ] Step 5: Also tag a subset (~30 phrases) with `"notification": true` for push notifications:
  - These should work as standalone notifications without context
  - e.g., "hey! where did you go?" or "the water is nice today" or "i forgot what i was going to say"
- [ ] Step 6: Verify: load JSON, count > 500, all categories have >= 30 entries

**Files:** `desk-pet/data/idle-phrases.json`

---

## Task 7: Idle phrase scheduler

**Goal:** Fish periodically says things on its own, selected by time and context.

- [ ] Step 1: Create `desk-pet/engine/idle.js`:
  ```javascript
  export class IdleScheduler {
    constructor(phrases)         // loaded from idle-phrases.json
    update(dt, context)          // check if it's time to speak
    getNextPhrase()              // select phrase based on context
    get isTimeToSpeak()
    markSpoken(phrase)           // track recently shown
    setContext(key, value)       // e.g., 'lastChatTime', 'silenceDuration'
  }
  ```
- [ ] Step 2: Implement time-of-day filtering:
  - Get current hour
  - Include category matching current time-of-day
  - Always include time-neutral categories (cheerful, forgetful, meta, existential)
  - Weight time-specific categories higher (2x)
- [ ] Step 3: Implement context filtering:
  - If last chat was < 2 min ago → include `post_chat`, exclude `long_silence`
  - If silence > 10 min → include `long_silence`, boost `bored`
  - If no recent interaction → include `bored` with higher weight
  - Random chance (10%) for `hungry` → also trigger EATING state
- [ ] Step 4: Implement weighted random selection:
  - Build filtered pool with weights
  - Roulette wheel selection
  - Exclude last 20 shown phrases (circular buffer of IDs/text hashes)
- [ ] Step 5: Implement timing:
  - Interval: random between 30-120 seconds (Poisson-like)
  - Timer resets after each phrase
  - Timer pauses when fish is SLEEPING
  - Timer pauses when fish is TALKING (from chat)
- [ ] Step 6: Wire into `app.js`:
  - When `idleScheduler.isTimeToSpeak` and fish is IDLE:
    - Get phrase from scheduler
    - Show speech bubble with phrase text
    - Transition to TALKING (priority 2)
    - After bubble auto-dismisses, back to IDLE
- [ ] Step 7: Verify: wait 30-120s, fish says something appropriate for time of day. Different phrases each time. No repeats.

**Files:** `desk-pet/engine/idle.js`, `desk-pet/app.js`

---

## Task 8: Context-aware state transitions

**Goal:** Fish state transitions reflect what just happened.

- [ ] Step 1: After user chat response:
  - 70% HAPPY (2s) → IDLE
  - 20% FORGETTING (2s) → IDLE (with "?" animation)
  - 10% EXCITED (1.5s) → IDLE
- [ ] Step 2: After idle phrase about food:
  - Always transition to EATING (2s) → IDLE
  - If phrase category is `hungry`, play EATING animation
- [ ] Step 3: After long silence phrase:
  - 50% stay IDLE (just speech bubble)
  - 50% FORGETTING → IDLE
- [ ] Step 4: After existential phrase:
  - Brief pause (fish stops moving) during speech bubble
  - Resume normal movement after bubble dismisses
- [ ] Step 5: After being poked (WIGGLING):
  - If poked 3+ times in 10 seconds → trigger EXCITED
  - If poked while SLEEPING → EXCITED (startled wake)
- [ ] Step 6: Verify: interact in various ways, observe contextually appropriate transitions

**Files:** `desk-pet/app.js`, `desk-pet/engine/state-machine.js`

---

## Task 9: Input styling and UX polish

**Goal:** Make the text input feel native to the bowl aesthetic.

- [ ] Step 1: Style the input field:
  - Semi-transparent white background (rgba(255,255,255,0.7))
  - Rounded corners matching pixel-art aesthetic
  - Subtle border matching bowl water color
  - Placeholder text: "say something to the goldfish..."
  - Font: inherit from body (system font)
  - Focus: border color changes to fish orange
- [ ] Step 2: Style the send button:
  - Small, circular, fish orange (#ff8b3d)
  - ">" icon or fish bubble icon
  - Hover: darker orange
  - Disabled state: grey, no cursor
- [ ] Step 3: Position input at bottom of viewport:
  - Fixed position, full width with padding
  - Above the canvas but below the bowl visually
  - Mobile: doesn't overlap with bowl content
- [ ] Step 4: Mobile input behavior:
  - On focus: viewport adjusts (keyboard pushes content up)
  - On submit: blur input (dismiss keyboard)
  - Prevent zoom on input focus (font-size >= 16px)
- [ ] Step 5: Add subtle animation when model is generating:
  - Input placeholder: "thinking..." with animated dots
  - Or: fish animation shows TALKING with mouth movement
- [ ] Step 6: Verify: input looks good on desktop and mobile, focus/blur works smoothly

**Files:** `desk-pet/style.css`, `desk-pet/index.html`

---

## Task 10: First-run experience

**Goal:** Onboarding for new users.

- [ ] Step 1: Detect first visit (check localStorage key `glub_visited`):
  - If not set: show tutorial overlay after model loads
  - Set key after tutorial dismissed
- [ ] Step 2: Tutorial overlay (DOM, not canvas):
  - Semi-transparent dark overlay
  - 3 brief tips:
    - "tap the fish to poke it"
    - "type to talk to it"
    - "it will forget everything"
  - Single "got it" button to dismiss
  - Simple fade-in animation
- [ ] Step 3: After tutorial: fish does an EXCITED animation (greeting the new owner)
- [ ] Step 4: Verify: clear localStorage, reload, see tutorial. Reload again, no tutorial.

**Files:** `desk-pet/app.js`, `desk-pet/style.css`, `desk-pet/index.html`

---

## Task 11: Phase 2 integration test

**Goal:** Full verification of all intelligence features.

- [ ] Step 1: Manual test checklist:
  - [ ] Model loads with progress bar
  - [ ] Cached model loads instantly
  - [ ] Type message → fish talks → response in speech bubble
  - [ ] Speech bubble auto-dismisses
  - [ ] Input disables during generation
  - [ ] Idle phrases appear every 30-120 seconds
  - [ ] Phrases are time-appropriate (check morning/evening)
  - [ ] No immediate phrase repeats
  - [ ] Post-chat phrases appear after conversation
  - [ ] Context-aware state transitions work (happy/forget after chat)
  - [ ] Food phrases trigger eating animation
  - [ ] Multiple pokes → excited
  - [ ] First-run tutorial appears on fresh visit
  - [ ] Mobile: input works, keyboard shows/hides properly
  - [ ] No console errors
- [ ] Step 2: Clean up debug code
- [ ] Step 3: Ensure JSDoc on all new public classes/functions
- [ ] Step 4: Commit: `feat(desk-pet): phase 2 intelligence complete`

**Files:** All desk-pet/ files

---

## Task 12: Idle phrase quality review

**Goal:** Manual review pass on the generated phrases for quality and character consistency.

- [ ] Step 1: Read through all 500+ phrases
- [ ] Step 2: Remove any that:
  - Are too long (> 80 chars)
  - Use capitalization (everything should be lowercase)
  - Reference the real world too specifically (cities, people, technology)
  - Sound too smart or articulate for a goldfish
  - Are repetitive with other phrases
- [ ] Step 3: Ensure distribution is balanced across categories
- [ ] Step 4: Add any missing categories or fill gaps
- [ ] Step 5: Final count: should be 480+ after culling

**Files:** `desk-pet/data/idle-phrases.json`

---

## Phase 2 Exit Criteria

1. ONNX model loads and generates responses client-side
2. Speech bubbles render correctly (position, text wrap, fade)
3. User chat: type → response → contextual transition
4. 480+ idle phrases in JSON, categorized and quality-reviewed
5. Idle scheduler fires time-appropriate phrases every 30-120s
6. Context-aware transitions (post-chat, poke combos, food, silence)
7. First-run tutorial works
8. Input UX polished for desktop and mobile
9. Model download shows progress bar
10. Zero console errors

---

*End of Phase 2 plan. After completion, proceed to [`2026-04-10-deskpet-phase-3-pwa.md`](2026-04-10-deskpet-phase-3-pwa.md).*

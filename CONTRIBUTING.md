# Contributing to GlubLM

First off - thanks for considering contributing. The goldfish is excited. It won't remember you in 10 seconds, but the excitement is real.

## Before you start

If you're planning anything larger than a typo fix, **open an issue first**. This lets us discuss the approach before you invest time. The project is small enough that one person can understand all of it, so we should coordinate.

## Ground rules

- **Be kind**. See [the code of conduct](CODE_OF_CONDUCT.md).
- **One concern per PR**. Split unrelated changes into separate PRs.
- **Tests matter**. The Python side has 77 tests. Don't break them. Add new ones for new behavior.
- **The goldfish persona is load-bearing**. If you add dataset samples, idle phrases, or prompts, they must stay in-character: naive, forgetful, present-moment-focused, no references to football / coaches / Ted Lasso characters / the real world beyond the bowl.

## Ways to contribute

### Good first issues

- **Add idle phrases**. Edit `desk-pet/data/idle-phrases.json`. Pick a category, match the existing tone. ~530 phrases right now, room for more in every category.
- **Draw pixel art**. The sprites are currently procedural. A hand-drawn 16x16 goldfish sprite sheet would be a huge improvement. See `desk-pet/engine/sprites.js` for the current animation state table.
- **Translate**. Italian variant (`PesceRossoLM`) is on the roadmap. A translated dataset would unblock it.
- **File iOS PWA bugs**. The notification permission flow is unclear on iOS Safari. Test it and tell us what you see.
- **Write JS tests**. The `desk-pet/` directory has zero automated tests. Pick a module and add vitest coverage.

### Intermediate

- **New animation states**. The FSM in `desk-pet/engine/state-machine.js` has 12 states. Want to add `yawning`? `sneezing`? `chasing tail`? Add the state, wire the sprite, connect a trigger, open a PR.
- **Secondary rendering backends**. The canvas engine is deliberately decoupled from rendering. A WebGL or WebGPU backend would be welcome. The procedural sprite renderer should be swappable with a PNG sprite sheet without changing game code.
- **Accessibility**. The canvas is invisible to screen readers right now. An aria-live region that mirrors the speech bubbles would help.

### Advanced

- **Cloudflare Worker push relay**. Real background notifications need a push server. A minimal CF Worker that proxies [web-push](https://github.com/web-push-libs/web-push) subscriptions would enable notifications when the tab is closed.
- **Raspberry Pi build**. Same engine, same state machine, same sprite renderer - with a framebuffer or LCD backend instead of canvas. Keep the JS code portable.
- **Fine-tuned variants**. Grumpy goldfish, poet goldfish, philosopher goldfish. Fork the dataset, re-train, ship a new checkpoint.
- **Model improvements**. If you can show a sub-40M model that improves on persona coherence without losing the 96-token constraint, that's a paper, not a PR.

## Development setup

### Python side

```bash
git clone https://github.com/Den-Sec/glublm
cd glublm
pip install -e ".[dev,deploy]"

# Run the full test suite
pytest tests/

# Lint
ruff check src/ tests/

# Train on a tiny fixture
glublm train --data tests/fixtures/tiny_dataset.json --epochs 3 --batch-size 16
```

### Desk Pet side

```bash
cd desk-pet
python -m http.server 8000
```

Open `http://localhost:8000`. Change a file in `engine/`, save, refresh. No build step, no watcher, no hot reload. It's a static site.

When you change the model or want to test service worker changes:

```bash
# Chrome DevTools -> Application -> Storage -> Clear site data
# Then hard reload
```

## Style

### Python

- Type hints on every public function (PEP 585 native types)
- Google-style docstrings
- `from __future__ import annotations` at the top of every module
- Ruff config in `pyproject.toml` - run `ruff check` before committing
- Max line 100 chars

### JavaScript

- ES modules, named exports
- JSDoc on every public class/function
- `const` by default, `let` only when reassignment is needed
- No `var`, no `==`, no bare `catch`
- Max line 100 chars
- No framework, no transpiler, no build step. Vanilla JS only.

### Commit messages

Conventional commits:
- `feat(scope): description` for new features
- `fix(scope): description` for bug fixes
- `docs(scope): description` for doc changes
- `test(scope): description` for test changes
- `refactor(scope): description` for refactors without behavior change
- `chore(scope): description` for tooling, CI, housekeeping

Scopes: `core`, `datagen`, `deploy`, `desk-pet`, `docs`, `ci`, `pages`.

Example: `feat(desk-pet): add yawning animation state`

## Pull requests

- Fork, branch from `master`, commit, push, open a PR
- PRs should pass CI (pytest + ruff)
- Describe the change in the PR body - what and why, not just what
- Screenshots or GIFs welcome for UI changes
- One reviewer approval required before merge

## Questions

Open a GitHub Discussion (or an issue if you prefer). The goldfish reads every one of them and then immediately forgets.

Thank you!

# GlubLM Ultraplan — Master Implementation Roadmap

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build GlubLM — a 15M-parameter transformer-based language model with goldfish persona and hard 48-token context, trained on an LLM-generated dataset, shipped across GitHub, HuggingFace Hub, browser, HF Space, and PyPI.

**Architecture:** Modern decoder-only transformer (8 layers, hidden 448, RoPE + SwiGLU + RMSNorm), BPE tokenizer, PyTorch training on RTX 3060, multi-agent Claude dataset pipeline, ONNX quantization for browser, Gradio Space for HF demo.

**Tech Stack:** Python 3.12, uv, PyTorch 2.x, tokenizers (HF), click, Anthropic SDK, ONNX Runtime, Gradio, pytest, ruff.

**Spec:** [`../specs/2026-04-09-glublm-design.md`](../specs/2026-04-09-glublm-design.md)

---

## Phase Overview

| Phase | Sub-plan | Tasks | Est. steps | Deliverable |
|-------|----------|-------|------------|-------------|
| **1. Core** | [`2026-04-09-glublm-phase-1-core.md`](2026-04-09-glublm-phase-1-core.md) | 19 | ~110 | Trained model on dummy data, CLI works, tests green |
| **2. Data Generation** | [`2026-04-09-glublm-phase-2-datagen.md`](2026-04-09-glublm-phase-2-datagen.md) | 20 | ~95 | Real 30K dataset JSON + HF-ready card |
| **3. Deployment** | [`2026-04-09-glublm-phase-3-deploy.md`](2026-04-09-glublm-phase-3-deploy.md) | 21 | ~110 | HF model + dataset live, browser demo, HF Space, PyPI release |

**Total:** 60 tasks / ~315 steps across 3 phases.

---

## Execution Dependencies

```
                  ┌─────────────────┐
                  │ Phase 1: Core   │
                  │ (scaffold,      │
                  │  model, train)  │
                  └────┬────────────┘
                       │ (exposes train.py, inference.py)
                       │
          ┌────────────┴─────────────┐
          │                          │
          ▼                          ▼
┌──────────────────┐     ┌────────────────────┐
│ Phase 2: DataGen │     │ Phase 1 re-train   │
│ (agent team)     │────▶│ with real 30K data │
└──────────────────┘     └──────────┬─────────┘
                                    │
                                    ▼
                         ┌────────────────────┐
                         │ Phase 3: Deploy    │
                         │ (ONNX, browser,    │
                         │  HF, pip)          │
                         └────────────────────┘
```

- Phase 1 can start immediately with fixture data (`tests/fixtures/tiny_dataset.json`)
- Phase 2 can start in parallel with Phase 1 (different files, no code conflicts)
- After both Phases 1 and 2 complete, re-run Phase 1's training on the real Phase 2 dataset
- Phase 3 starts after the real-data training completes

---

## Global Conventions

### Commits
- One commit per task (not per step) unless a task explicitly contains multiple commits
- Commit message format: `<type>(<phase>): <description>` where `type ∈ {feat, test, docs, chore, refactor, fix}`
  - Example: `feat(core): add RoPE layer with tests`
  - Example: `chore(datagen): add team config yaml`
- Trailer: `Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>`

### Testing
- TDD: test first, implementation second, always
- `pytest tests/ -v` must pass before any commit
- `ruff check src/ tests/` must return clean before any commit
- Each ML layer has a shape test + a functional test
- Golden outputs fixed with `torch.manual_seed(0)` for determinism

### Code Quality
- Type hints on every public function (PEP 585 native types)
- Docstrings (Google style) on every public class/function
- No bare `except`, no wildcard imports
- Max line 100 chars (`ruff` config)
- `from __future__ import annotations` at top of every `.py` file

### Branching
- All work on `master` branch (single-developer project)
- Tags: `v0.1.0-core` after Phase 1, `v0.1.0-data` after Phase 2, `v0.1.0` after Phase 3

### Secrets
- `ANTHROPIC_API_KEY` in `.env` (gitignored), loaded via `python-dotenv`
- `HF_TOKEN` in `.env`, never committed
- `.env.example` checked in with placeholder values

---

## Milestones

| Milestone | Phase | Criteria |
|-----------|-------|----------|
| **M1: Scaffolding complete** | 1 | `uv sync` works, `pytest` runs (even if empty), `ruff` clean, GH Actions green |
| **M2: Model forward pass works** | 1 | `model(torch.randint(...))` returns logits with correct shape, gradient flows |
| **M3: Tiny training converges** | 1 | Overfit a single batch of 16 samples to <0.1 loss |
| **M4: CLI demo works** | 1 | `uv run glublm chat --prompt "hello"` returns in-persona text from fixture-trained model |
| **M5: Agent pipeline valid** | 2 | 100-sample dry run, manually inspected, zero forbidden tokens, ≥90% in-persona |
| **M6: Pilot dataset ready** | 2 | 10K samples, quality report ≥85% persona, zero forbidden tokens |
| **M7: Full dataset ready** | 2 | 30K samples, train/test split, HF dataset card complete |
| **M8: Production model trained** | 1+2 | Model trained on real 30K, eval perplexity + persona score recorded |
| **M9: Browser demo live** | 3 | GitHub Pages serves `index.html`, ONNX loads, chat generates text on mobile |
| **M10: HF live** | 3 | Model + dataset pages visible at `huggingface.co/Den-Sec/glublm-15m` and `huggingface.co/datasets/Den-Sec/glublm-30k-ted` |
| **M11: HF Space live** | 3 | Gradio chat deployed and reachable |
| **M12: PyPI release** | 3 | `pip install glublm` works from a fresh venv, `glublm chat` runs |
| **M13: COMPARISONS.md published** | 3 | Empirical comparison GlubLM vs GuppyLM with tables |

---

## Risk Tracking (live)

| Risk | Status | Mitigation |
|------|--------|------------|
| RoPE ONNX export issues | Open | Validated in Phase 3 Task 1-3 with numerical equivalence check |
| 3060 VRAM OOM | Open | `torch.cuda.empty_cache()` + gradient accumulation fallback in Phase 1 Task 19 |
| API cost overrun | Open | Hard cap $100 in Phase 2 orchestrator |
| Persona drift at 15M | Open | Measured after Phase 1 Task 26 (smoke test) |
| 48 tok too restrictive | Open | Decision gate after Phase 2 pilot — can raise to 64 if stunted |

---

## How to Execute

**For a fresh engineer:**

1. Read the spec: [`../specs/2026-04-09-glublm-design.md`](../specs/2026-04-09-glublm-design.md)
2. Read this ultraplan entirely (you're doing it)
3. Start Phase 1: [`2026-04-09-glublm-phase-1-core.md`](2026-04-09-glublm-phase-1-core.md)
4. Execute task-by-task with checkbox tracking
5. Commit after every task (not every step)
6. Run `pytest` + `ruff` before every commit
7. When Phase 1 is done, start Phase 2 in parallel
8. Re-train on real data after Phase 2
9. Finish with Phase 3

**Recommended executor:** `superpowers:subagent-driven-development` (fresh subagent per task, reviewer loop). For inline execution use `superpowers:executing-plans` with checkpoints after each Phase.

---

## Non-Goals (reminder from spec)

- ❌ Multi-turn memory — this is the whole point of the project
- ❌ Multilingual single-model — Italian is a separate v2 project
- ❌ RLHF / fine-tuning — static pre-training only
- ❌ Direct Ted Lasso references (football, coaches, team, character names)
- ❌ Web backend — browser demo is 100% client-side
- ❌ State-of-the-art quality — this is a toy, intentionally

---

*End of master ultraplan. Open `2026-04-09-glublm-phase-1-core.md` to begin execution.*

# GlubLM — Design Specification

| Field | Value |
|-------|-------|
| **Project** | GlubLM |
| **Author** | Dennis Sepede ([@Den-Sec](https://github.com/Den-Sec)) |
| **Designer** | Claude (Opus 4.6) |
| **Date** | 2026-04-09 |
| **Status** | Draft — awaiting user review |
| **Inspired by** | [GuppyLM](https://github.com/arman-bd/guppylm) by Arman BD, and Ted Lasso's "be a goldfish" wisdom |
| **License** | AGPL-3.0 |
| **Repo (local)** | `L:/Dennis/Projects/glublm` |
| **Repo (remote)** | `github.com/Den-Sec/glublm` (to be created) |

---

## 1. Executive Summary

**GlubLM** is a 15M-parameter language model that pretends to be a goldfish with a 10-second memory. Unlike its inspiration [GuppyLM](https://github.com/arman-bd/guppylm) (which uses vanilla transformer components at 9M params and a 60K template-composed dataset), GlubLM uses **modern transformer ops** (RoPE + SwiGLU + RMSNorm), a **hard 48-token context window** to make "10-second memory" a physical constraint (not just metaphor), and an **LLM-generated dataset** produced by a coordinated team of Claude agents instead of hand-authored templates.

The persona borrows from Ted Lasso's meditation on the goldfish as "the happiest animal on earth" — GlubLM embraces relentless optimism, kindness, forgiveness, curiosity, humility, and the act of forgetting as a feature, not a bug. All without any direct references to football, coaches, or teams (those are filtered out by a dedicated persona-guardian agent during dataset generation).

**Delivery scope**: GitHub repo, HuggingFace Hub (model + dataset), standalone ONNX browser demo, HuggingFace Gradio Space, and pip-installable CLI package.

---

## 2. Identity

- **Name**: `GlubLM`
- **Pronunciation**: "glub-L-M" — "glub" is the iconic English onomatopoeia for a fish underwater (cartoons, comics)
- **Tagline**: *"the language model that already forgot this sentence"*
- **Mascot** (future): stylized orange goldfish blowing a bubble containing "LM"
- **Philosophy**: Ted Lasso's "be a goldfish" — the happiest animal, 10-second memory, always in the present moment, forgives every past mistake instantly

### 2.1 Why this name

Evaluated alternatives: `GoldfishLM` (too flat), `BeAFishLM` (direct Ted Lasso quote but awkward pronunciation, culturally dated), `CarpeDiemLM` (clever double meaning but unapproachable), `BlubLM` (similar vibe but "blub" connotes crying in English). `GlubLM` won for: universal English fish-sound recognition, evergreen (does not depend on TV reference), short + brand-friendly, clean HuggingFace slug (`glub-lm`), zero ambiguity for non-Ted-Lasso fans.

### 2.2 Ted Lasso reference strategy

- **README**: explicit credit to Ted Lasso as philosophical inspiration, including the "be a goldfish" quote
- **Code**: subtle easter eggs only (e.g. a docstring or comment) — nothing invasive or required for understanding
- **Error messages / CLI output**: goldfish-themed but not Lasso-themed
- **Training data**: Lasso *wisdom* filtered into the persona (kindness, optimism, forgiveness) but **zero direct mention** of football, coaches, teams, Richmond, Rebecca, or any character names — enforced by the persona-guardian agent

---

## 3. Differentiators vs GuppyLM

| Dimension | GuppyLM | **GlubLM** |
|-----------|---------|------------|
| Parameters | 9M | **~15M** |
| Layers | 6 | **8** |
| Hidden dim | 384 | **448** |
| Attention heads | 6 | **7** (64 per head) |
| FFN dim | 768 | **896** (×2 for SwiGLU → 1792 effective) |
| Activation | ReLU | **SwiGLU** |
| Normalization | LayerNorm | **RMSNorm** |
| Position encoding | Learned embeddings | **Rotary (RoPE)** |
| Vocabulary (BPE) | 4,096 | **5,120** |
| Max context | 128 tokens | **48 tokens** (physical 10-second memory) |
| Dataset size | 60K samples | **30K** (phased: 10K pilot → 30K → optional scale) |
| Dataset generation | Template composition (~16K unique outputs) | **LLM-generated via multi-agent Claude team** |
| Topics | 60 | **80+** (goldfish physical world + Ted Lasso wisdom) |
| Language | English | English (Italian version considered as v2 if successful) |
| Training infra | Colab T4 | **RTX 3060 12GB local** (primary) + Colab T4 (secondary) |
| License | MIT | **AGPL-3.0** |
| Deployment | GitHub + HF + browser demo | **GitHub + HF (model & dataset) + browser + HF Space + pip package** |

---

## 4. Technical Architecture

### 4.1 Model spec

```
GlubLM Transformer
├── Token embedding   (vocab=5120, dim=448) ─┐
│                                            │ weight-tied
├── 8× TransformerBlock                      │
│   ├── RMSNorm                              │
│   ├── Multi-Head Attention                 │
│   │     heads=7, head_dim=64               │
│   │     RoPE applied to Q and K            │
│   │     no bias                            │
│   ├── Residual                             │
│   ├── RMSNorm                              │
│   ├── SwiGLU FFN                           │
│   │     gate_proj: 448 → 896               │
│   │     up_proj:   448 → 896               │
│   │     down_proj: 896 → 448               │
│   │     silu(gate) * up                    │
│   └── Residual                             │
├── Final RMSNorm                            │
└── LM head ◄──────────────────────────────── (tied to embedding)

Total params: ~15M
Max sequence length: 48 tokens (hard cap)
Dtype: BF16 for training, FP32 for export, INT8 for browser
```

### 4.2 Design rationale

| Choice | Rationale |
|--------|-----------|
| **15M params** | Enough capacity for 80+ topics + Ted Lasso wisdom filtering, still browser-viable (~18 MB uint8 ONNX) |
| **RoPE** | Better length generalization, standard in Llama/Mistral. Explicit disagreement with GuppyLM's claim that modern ops "don't help at 9M scale" — we will measure this empirically at 15M in `docs/COMPARISONS.md` |
| **SwiGLU** | Empirically +10-15% quality over ReLU at similar parameter counts (Shazeer 2020), used by Llama/PaLM |
| **RMSNorm** | Faster, no bias terms, standard in Llama-family |
| **Weight-tied LM head** | Saves parameters, standard practice for small LMs |
| **48-token context** | "10 seconds of human speech" ≈ 15-25 English words ≈ 25-50 BPE tokens. 48 is the hard architectural cap enforcing "one or two short utterances before total forgetting" |
| **No attention biases** | Standard modern choice, slight speedup |
| **BF16 training** | RTX 3060 Ampere supports BF16 natively; better numerical stability than FP16 for small models |

### 4.3 Why 48 tokens (not 32, not 128)

- **32**: too short; truncates mid-word, unable to express even one full sentence
- **48**: comfortably fits "what is your favorite food? [EOS] flakes. small flakes. best flakes." (~25-35 tokens) with margin
- **64**: starts approaching multi-turn territory, undermines the "literal 10s memory" story
- **128** (Guppy): allows 3-4 turns of multi-turn conversation, defeats the premise

**48 tokens is the sweet spot**: enough for rich single-turn interaction, too short for any meaningful memory across turns.

---

## 5. Dataset Pipeline

### 5.1 Generation strategy: multi-agent Claude team

Rather than hand-authored templates (GuppyLM approach, which produced ~16K unique outputs from 60K samples), GlubLM uses a coordinated team of Claude agents via `TeamCreate`. This yields natural linguistic diversity impossible with templates.

### 5.2 Agent roster

| Agent | Model | Role | Output |
|-------|-------|------|--------|
| **generator-agent** | Haiku 4.5 | Generates conversations in batches (50 samples per API call), given a topic and persona system prompt. Returns JSON array of `{input, output, category}`. | Raw samples |
| **critic-agent** | Sonnet 4.6 | Reviews each sample: is it in persona? language quality? topic coherent? Returns verdict `{accept|reject|fix}` with reason. | Filtered samples |
| **diversifier-agent** | Haiku 4.5 | Analyzes accepted-batch vocabulary and flags n-gram repetition. Suggests lexical variations to avoid mode collapse. | Diversity suggestions |
| **persona-guardian** | Sonnet 4.6 | Hard enforcement: scans every sample for forbidden tokens/concepts (football, coach, team, Richmond, Rebecca, named TV-show characters). Also checks Ted Lasso wisdom is expressed through goldfish naiveté (e.g. "i don't know what a coach is but my water is warm today"). | Final filter |

### 5.3 Generation flow

```
topics.yaml (80+ topics)
     │
     ▼
┌────────────────────┐
│  generator-agent   │  for each topic, generate 50-sample batch
└─────────┬──────────┘
          ▼
┌────────────────────┐
│   critic-agent     │  review → accept/reject/fix
└─────────┬──────────┘
          ▼
┌────────────────────┐
│ diversifier-agent  │  (periodic, every 1K samples)
└─────────┬──────────┘
          ▼
┌────────────────────┐
│  persona-guardian  │  final filter: zero football refs
└─────────┬──────────┘
          ▼
     final dataset JSON
     (input, output, category)
```

### 5.4 Phased scaling

1. **Pilot — 10K samples** (~$15 API)
   - Validate end-to-end pipeline
   - Manually inspect 50 random samples for quality
   - Measure: persona consistency rate, forbidden-token leakage rate, topic distribution
   - Decision gate: proceed only if quality metrics pass
2. **Main — scale to 30K** (+$30 API)
   - Fill remaining topics to target count per category
   - Re-run diversifier across full corpus
3. **Optional expansion — 60K or 100K**
   - Triggered only by clear underfit signal post-training (perplexity plateau, lack of diversity in generated outputs)
   - Decision made *with the agent team* (not unilaterally by me)

### 5.5 Dataset format

```json
{
  "samples": [
    {
      "input": "what do you eat?",
      "output": "flakes. tiny orange flakes. best thing in the whole bowl. oh, what was the question?",
      "category": "food",
      "group": "goldfish_physical"
    },
    {
      "input": "tell me about forgiveness",
      "output": "forgive? i already forgot. that's the best part. every moment is new!",
      "category": "forgiveness",
      "group": "ted_lasso_wisdom"
    }
  ]
}
```

Split: 90% train / 10% test (held out, never seen during training).

### 5.6 Topics (80+)

**Goldfish physical world (~45 topics):**
bowl, water, bubbles, food, flakes, orange color, fins, reflection, round glass, light, shadow, temperature, filter hum, plants, gravel, air, breathing, swimming, floating, resting, hunger, taste, noise, vibration, visitors, hands, cat outside, sleep, dreams, day, night, morning, evening, rain, sun, waking, tired, wiggling, turning, corners, top, bottom, middle, clean water, old water

**Ted Lasso wisdom filtered (~35 topics, zero football/coach/team):**
kindness, belief, forgiveness, curiosity, humility, optimism, present moment, small acts, goodbye, hello, being happy, not judging, listening, being seen, being lost, being found, remembering, forgetting (meta!), hope, gentleness, vulnerability, bad jokes, dad humor, biscuits, patience, starting over, letting go, being yourself, being brave, being scared, being silly, wonder, gratitude, being old, being young

### 5.7 Cost estimate

| Phase | Samples | Agents touched | Est. tokens | Est. cost (Haiku + Sonnet mix) |
|-------|---------|----------------|-------------|--------------------------------|
| Pilot | 10K | all 4 | ~15M total | ~$15 |
| Main expansion | +20K | all 4 | ~30M total | ~$30 |
| **Subtotal** | **30K** | | **~45M** | **~$45** |
| Optional +30K | | | ~45M | +$45 |
| Optional +70K | | | ~105M | +$105 |

All costs are rough estimates based on Haiku 4.5 input $0.80/1M + output $4.00/1M and Sonnet 4.6 at 3x Haiku pricing.

---

## 6. Training Strategy

### 6.1 Infrastructure

- **Primary**: RTX 3060 12GB local (Dennis's desktop)
  - CUDA 13.1, Python 3.12, PyTorch 2.x
  - VRAM budget: ~3 GB used, ~8 GB headroom
  - Estimated run time: 8-15 minutes per full training
- **Secondary**: Colab T4 notebook, committed to `notebooks/train_colab.ipynb` for reproducibility by the community

### 6.2 Hyperparameters (initial estimates, refined in plan phase)

| Hyperparameter | Value |
|----------------|-------|
| Optimizer | AdamW (β1=0.9, β2=0.95) |
| Learning rate | 3e-4 peak |
| LR schedule | Cosine with 5% warmup |
| Weight decay | 0.1 |
| Batch size | 64 (3060 can easily handle more, but 64 keeps gradient estimates stable) |
| Epochs | 3-5 with early stop on val loss plateau |
| Mixed precision | BF16 (Ampere native) |
| Gradient clipping | 1.0 |
| Dropout | 0.1 |
| `torch.compile` | enabled |

### 6.3 Evaluation

- **Perplexity** on held-out 10% split
- **Persona consistency**: run generation on 100 held-out eval cases, manually score (or auto-score via a Claude critic) for persona adherence
- **Forbidden-token check**: scan all generated outputs for forbidden tokens (football etc.) — should be zero
- **Forgetting verification**: feed multi-turn context → confirm degradation at turn 2+
- **Speed benchmark**: tokens/sec on 3060, T4, and browser WASM

---

## 7. Deployment

### 7.1 Deliverables

1. **GitHub repo** (`github.com/Den-Sec/glublm`)
   - AGPL-3.0 license
   - CI via GitHub Actions (pytest, ruff lint)
   - README with story + quickstart + comparison
2. **HuggingFace Hub**
   - Model: `Den-Sec/glublm-15m` — weights (safetensors), tokenizer, model card, ONNX export
   - Dataset: `Den-Sec/glublm-30k-ted` — JSON dataset, dataset card with generation methodology
3. **Browser demo** (`docs/index.html`)
   - Standalone HTML/JS/CSS
   - ONNX Runtime Web loading `model.onnx` (uint8 quantized, ~18 MB)
   - Deploy via GitHub Pages (`gh-pages` branch or `/docs` folder)
4. **HuggingFace Space**
   - Gradio interactive chat
   - Auto-deploys from repo
5. **pip package** (`pip install glublm`)
   - CLI entry points:
     - `glublm chat [--prompt TEXT]` — interactive or one-shot
     - `glublm train` — training runner
     - `glublm generate-data` — dataset generation orchestrator
   - PyPI release workflow in GH Actions

### 7.2 Deploy workflow (high level)

```
local training → weights.pt
     │
     ├─→ export_onnx.py → model.onnx (fp32) → quantize → model.onnx (uint8)
     │                                                         │
     │                                                         ▼
     │                                                 web/model.onnx
     │                                                         │
     │                                                         ▼
     │                                                 GitHub Pages (/docs)
     │
     ├─→ export_hf.py → push to HF model repo (safetensors + tokenizer + card)
     │                                                         │
     │                                                         ▼
     │                                                 HF Space auto-deploy
     │
     └─→ pyproject.toml + GH Actions release → PyPI
```

---

## 8. Repository Structure

```
L:/Dennis/Projects/glublm/
├── pyproject.toml                  # uv + Python 3.12 + deps + entry points
├── uv.lock                         # lockfile
├── README.md                       # story + quickstart + comparison
├── LICENSE                         # AGPL-3.0
├── .python-version                 # 3.12
├── .gitignore
├── .github/
│   └── workflows/
│       ├── test.yml                # pytest + ruff
│       ├── deploy-pages.yml        # browser demo to GH Pages
│       └── release.yml             # PyPI release on tag
├── src/
│   └── glublm/
│       ├── __init__.py
│       ├── config.py               # ModelConfig, TrainConfig dataclasses
│       ├── model.py                # main Transformer
│       ├── layers/
│       │   ├── __init__.py
│       │   ├── rope.py             # rotary position embedding
│       │   ├── rmsnorm.py
│       │   ├── swiglu.py
│       │   └── attention.py
│       ├── tokenizer.py            # BPE wrapper (tokenizers lib)
│       ├── dataset.py              # PyTorch Dataset + DataLoader
│       ├── train.py                # training loop
│       ├── inference.py            # generation / chat
│       └── cli.py                  # Click-based CLI entry
├── data_gen/
│   ├── __init__.py
│   ├── team_config.yaml            # agent team definition
│   ├── generate.py                 # orchestrator
│   ├── topics.yaml                 # 80+ topic definitions
│   ├── prompts/
│   │   ├── generator.md            # generator-agent prompt
│   │   ├── critic.md               # critic-agent prompt
│   │   ├── diversifier.md          # diversifier-agent prompt
│   │   └── persona_guardian.md     # persona-guardian prompt
│   ├── validate.py                 # quality metrics on generated data
│   └── forbidden_tokens.txt        # zero-tolerance list (football etc.)
├── notebooks/
│   ├── train_colab.ipynb           # Colab T4 notebook (reproducibility)
│   └── generate_data.ipynb         # dataset gen walkthrough
├── web/                            # served by GH Pages as /docs/
│   ├── index.html
│   ├── glub.js                     # ONNX Runtime Web glue
│   ├── style.css
│   ├── model.onnx                  # quantized weights (deployed)
│   ├── tokenizer.json              # deployed
│   └── assets/
│       ├── logo.svg
│       └── mascot.png
├── space/
│   ├── app.py                      # Gradio interface
│   ├── requirements.txt
│   └── README.md                   # HF Space card
├── tools/
│   ├── export_onnx.py              # PT → ONNX → quantize
│   ├── export_hf.py                # push to HF Hub
│   ├── benchmark.py                # perplexity + speed + vs Guppy
│   └── eval_cases.py               # held-out persona tests
├── tests/
│   ├── test_model.py               # shape tests, RoPE correctness
│   ├── test_dataset.py             # loading, tokenization
│   ├── test_inference.py           # generation smoke test
│   └── test_data_gen.py            # mock agent team
└── docs/
    ├── ARCHITECTURE.md             # deep dive model
    ├── DATASET.md                  # generation methodology
    ├── TRAINING.md                 # hyperparams, runs, logs
    ├── COMPARISONS.md              # GlubLM vs GuppyLM empirical
    └── superpowers/
        └── specs/
            └── 2026-04-09-glublm-design.md  ← THIS FILE
```

---

## 9. Success Criteria

### 9.1 Must-haves (MVP)

- [ ] Model trains to convergence without NaN/divergence
- [ ] Generated dataset passes all 4 agents' quality gates (0 forbidden tokens, persona consistency ≥ 85%)
- [ ] Browser demo loads and generates text in <5 seconds on modern mobile
- [ ] Model weights published on HuggingFace Hub
- [ ] Dataset published on HuggingFace Hub
- [ ] pip package installs cleanly and `glublm chat` works
- [ ] README has clear story + quickstart + comparison table
- [ ] AGPL-3.0 license file present

### 9.2 Stretch goals

- [ ] HF Space live with Gradio UI
- [ ] Empirical comparison document (`docs/COMPARISONS.md`) showing perplexity and qualitative differences vs GuppyLM
- [ ] Mascot logo/artwork
- [ ] Italian variant ("PesceRossoLM") in a follow-up release
- [ ] >100 GitHub stars within 30 days of release (vanity metric but motivating)

### 9.3 Non-goals (explicit)

- ❌ Multi-turn memory (the whole point is that it *can't*)
- ❌ Multilingual single-model (Italian is a separate repo if it happens)
- ❌ RLHF / fine-tuning pipelines (static pre-training only)
- ❌ Any reference to football, coaches, or named Ted Lasso characters
- ❌ Web backend (browser demo is 100% client-side)
- ❌ State-of-the-art quality (this is a toy, intentionally)

---

## 10. Open Questions (resolve in plan phase)

1. **Exact BPE training**: train tokenizer on full 30K dataset, or on the 10K pilot first?
2. **Warmup steps**: depends on total training steps (= epochs × batches). Finalize after seeing dataset size
3. **Should we use `transformers.js` or `onnxruntime-web` for browser?** — `onnxruntime-web` is lower-level, smaller footprint; `transformers.js` is higher-level, easier. Lean toward `onnxruntime-web` for size but verify
4. **Model card content**: biases disclosure, limitations, intended use cases
5. **README mascot**: commission art, AI-generate, or text-only?
6. **PyPI publish timing**: first release as `0.1.0` immediately after training, or only after browser demo + HF Space are live?
7. **Colab notebook**: duplicate `train.py` logic, or import from installed package? (impacts Colab first-run UX)

---

## 11. Risks & Mitigations

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| Dataset quality too low at 30K | Medium | High | Phased pilot (10K) with manual inspection before scaling |
| Model underfits or shows persona drift | Medium | High | Scale dataset to 60K+, tune LR, more epochs |
| RoPE ONNX export tricky | Low-Medium | Medium | Well-known solved problem, fallback to standard attention mask if needed |
| API cost overrun on multi-agent gen | Low | Medium | Hard cost cap in orchestrator, phased spending |
| AGPL-3.0 discourages adopters | Medium | Low | Acceptable trade-off per Dennis's explicit choice |
| 3060 VRAM OOM at batch > 64 | Low | Low | Gradient accumulation fallback |
| Context window of 48 too restrictive to express anything interesting | Low-Medium | High | Pilot validates this; fall back to 64 if outputs are stunted |

---

## 12. References

- [GuppyLM](https://github.com/arman-bd/guppylm) — inspiration and baseline
- [Ted Lasso S1E1](https://en.wikipedia.org/wiki/Ted_Lasso) — "be a goldfish" wisdom
- [RoFormer (RoPE paper)](https://arxiv.org/abs/2104.09864) — Su et al., 2021
- [GLU Variants (SwiGLU)](https://arxiv.org/abs/2002.05202) — Shazeer, 2020
- [Root Mean Square Layer Normalization](https://arxiv.org/abs/1910.07467) — Zhang & Sennrich, 2019
- [Llama 2](https://arxiv.org/abs/2307.09288) — architectural reference for modern transformer stack
- [ONNX Runtime Web](https://onnxruntime.ai/docs/tutorials/web/) — browser inference
- [HuggingFace Tokenizers](https://github.com/huggingface/tokenizers) — BPE implementation

---

*End of design specification. Next step: user review → `writing-plans` skill invocation to produce the detailed implementation plan.*

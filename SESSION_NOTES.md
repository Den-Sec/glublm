# GlubLM Session Handoff

> Questo file aiuta la prossima sessione Claude (o un nuovo engineer) a riprendere l'esecuzione del plan senza dover ricostruire il contesto dalla sessione precedente.
>
> **Aggiornato**: 2026-04-10 da Claude Opus 4.6 (1M context) - Phase 1 + Phase 2 COMPLETE

## Stato corrente

### Completato
- [x] Brainstorming + design decisions (spec committata in [`docs/superpowers/specs/2026-04-09-glublm-design.md`](docs/superpowers/specs/2026-04-09-glublm-design.md))
- [x] Ultraplan + 3 phase plans ([`docs/superpowers/plans/`](docs/superpowers/plans/))
- [x] **Phase 1 Tasks 1-7**: Scaffolding completo (pyproject.toml, .python-version, .gitignore, .env.example, LICENSE AGPL-3.0, README skeleton, GitHub Actions CI stub, src/ layout, tests/conftest.py, uv.lock)
- [x] **Phase 1 Task 8**: ModelConfig + TrainConfig dataclasses
- [x] **Phase 1 Task 9**: RMSNorm layer
- [x] **Phase 1 Task 10**: Rotary Position Embedding (RoPE)
- [x] **Phase 1 Task 11**: SwiGLU feed-forward
- [x] **Phase 1 Task 12**: Causal self-attention con RoPE
- [x] **Phase 1 Task 13**: GlubLM transformer (18.4M params default, overfit-single-batch test green)
- [x] **Phase 1 Task 14**: BPE tokenizer wrapper (con decoder ByteLevel)
- [x] **Phase 1 Task 15**: GlubDataset + tiny fixture
- [x] **Phase 1 Task 16**: Training loop (cosine schedule + warmup + AdamW)
- [x] **Phase 1 Task 17**: Inference sampling + generate
- [x] **Phase 1 Task 18**: Click CLI (`glublm train` e `glublm chat`)
- [x] **Phase 1 Task 19**: End-to-end smoke test + tag `v0.1.0-core`

**Phase 1 = COMPLETE.** 48 test verdi, ruff clean, tag `v0.1.0-core` creato localmente (non pushato).

### Exit criteria Phase 1 verificati
1. `pytest tests/` 48 passed
2. `ruff check src/ tests/` clean
3. `glublm train` su fixture funziona su GPU (16.1M params vocab dinamico, loss 6.8 -> 4.1 in 3 epoch)
4. `glublm chat` su GPU produce output ASCII-safe
5. `v0.1.0-core` tag esistente
6. `ModelConfig()` default = 18.4M params (nel target 10M-25M)

### Bug/fix trovati durante esecuzione (rispetto al plan)
- **Plan warmup formula**: `(step+1)/warmup_steps` contraddice il test `assert lr < 1e-4 @ step=0`. Fix: `step/warmup_steps`. Commit `ca05b91`.
- **Plan test generate max_new_tokens**: `prompt_len = len(tok.encode("a"))` ma `generate()` encoda `"a ->"`. Fix test a `tok.encode("a ->")`. Commit `46a9da5`.
- **Plan tokenizer**: manca `decoders.ByteLevel()` -> il decode lascia marker `U+0120` che crasha CLI su Windows cp1252. Fix in `src/glublm/tokenizer.py`. Commit `4457a4d`.
- **Plan pyproject**: ruff N812 blocca l'idioma PyTorch `import torch.nn.functional as F`. Aggiunto N812 all'ignore. Commit `9a783c7`.
- **Plan RUF059**: `b, t = ids.shape` con `b` unused fa fallire ruff. Cambiato in `_, t = ids.shape` in `model.py`.
- **Plan SIM401**: `state["model"] if "model" in state else state` sostituito con `state.get("model", state)` in `cli.py`.

### Phase 2 completata (2026-04-10)
- [x] data_gen package: 4 agent prompts, client (claude -p subprocess), orchestrator con parallelism
- [x] **60837 sample** generati via Claude Max sub (zero costi API)
- [x] Distribuzione **49.4% goldfish / 50.6% ted_lasso** (perfettamente bilanciata)
- [x] 100% unique, zero forbidden violations
- [x] 3 run: pilot 10K + supplemental 10.8K ted_lasso + supplemental 40K misto (round-robin)
- [x] Train/test split: 54754 train / 6083 test
- [x] **Retrained 15 epoch** su 60K: loss 3.18 -> 1.64, perplexity test 12.14
- [x] Chat funzionante, persona goldfish convincente
- [x] Tag `v0.1.0-data`
- [x] GitHub repo pushato: https://github.com/Den-Sec/glublm

### Key fixes Phase 2
- Plan: Sonnet pricing $5/$15 -> $3/$15 (reale)
- Orchestrator: round-robin tra gruppi invece di sequential (fix sbilanciamento 87/13)
- Guardian: ammorbidito per non rigettare topic emotivi legittimi (belief, vulnerability, forgiveness)
- Client: rewritten da API a `claude -p` subprocess (usa sub Max, zero costi extra)
- Diversifier: cap sample a 50 per evitare WinError 206 (Windows cmdline limit)
- NAS disconnect: staging su C: locale per evitare data loss

### Modello reale
- **18,357,696 params** (18.4M, non 15M come nel plan originale - stima imprecisa)
- **8 transformer blocks** (non 10)
- d_model=448, n_heads=7, ffn_hidden=896, max_seq_len=48, vocab_size=5120
- RoPE + SwiGLU + RMSNorm + weight-tied LM head
- Checkpoint finale: `checkpoints/glublm_60k_15ep.pt` (211MB) + `checkpoints/tokenizer_60k.json`

### Prossimo da fare
- [ ] **Phase 3**: deploy HF Hub + PyPI + GH Pages demo
  - `.env` ha HF_TOKEN e PYPI_TOKEN pronti
  - GitHub repo pushato con tag
  - Plan: `docs/superpowers/plans/2026-04-09-glublm-phase-3-deploy.md` (21 task)

## Setup venv — IMPORTANTE

**Il venv NON vive nel progetto** (su NAS L:\Dennis\Projects\glublm\.venv) perche' Windows non carica DLL PyTorch da path UNC/SMB (`LoadLibrary` fallisce su c10.dll con WinError 87).

Il venv vive su **C:\Users\Dennis\.venv-glublm** e viene usato tramite la variabile d'ambiente `UV_PROJECT_ENVIRONMENT`.

### Verifica che sia attiva

```powershell
echo $env:UV_PROJECT_ENVIRONMENT
# atteso: C:\Users\Dennis\.venv-glublm
```

Se vuota, settala:
```powershell
$env:UV_PROJECT_ENVIRONMENT = "C:\Users\Dennis\.venv-glublm"
# persistente per user:
[System.Environment]::SetEnvironmentVariable('UV_PROJECT_ENVIRONMENT', 'C:\Users\Dennis\.venv-glublm', 'User')
```

### Verifica torch CUDA

```powershell
& "C:\Users\Dennis\.venv-glublm\Scripts\python.exe" -c "import torch; print('cuda=', torch.cuda.is_available(), torch.cuda.get_device_name(0))"
# atteso: cuda= True NVIDIA GeForce RTX 3060
```

### Se il venv e' rotto, ricreatalo

```powershell
cd L:\Dennis\Projects\glublm
Remove-Item -Recurse -Force C:\Users\Dennis\.venv-glublm -ErrorAction SilentlyContinue
$env:UV_PROJECT_ENVIRONMENT = "C:\Users\Dennis\.venv-glublm"
python -m uv sync --all-extras
```

**Non lanciare mai 2 uv sync in parallelo** — si pestano sui piedi e lasciano il venv in stato corrotto.

## Come riprendere

### Opzione A: Esegui dalla shell di Dennis
```powershell
cd L:\Dennis\Projects\glublm
$env:UV_PROJECT_ENVIRONMENT = "C:\Users\Dennis\.venv-glublm"
# poi tutti i comandi del plan funzionano normalmente:
uv run pytest tests/ -v
uv run ruff check src/ tests/
uv run glublm --help
```

### Opzione B: Nuova sessione Claude
Apri una nuova sessione Claude Code e dille:

> "Riprendi l'esecuzione del plan GlubLM Phase 1 dal Task 8. Il plan e' in `L:/Dennis/Projects/glublm/docs/superpowers/plans/2026-04-09-glublm-phase-1-core.md`. Lo SESSION_NOTES.md ha il setup venv corrente. Usa subagent-driven-development con model=opus. Task 1-7 sono gia' fatti. Task 2 e' gia' completato (uv sync fatto, venv su C:\Users\Dennis\.venv-glublm)."

## Gotchas da non ripetere

1. **UNC path su Windows**: vedi sopra. Il venv DEVE stare su C:, non su L: (o qualsiasi NAS drive).
2. **Processi uv doppi**: mai lanciare un secondo `uv sync` finche' il primo non e' finito. Usa `tasklist | findstr uv` per controllare.
3. **File lock Windows**: se un `rm -rf .venv` fallisce silenziosamente, chiudi tutte le shell aperte nella directory del progetto prima di riprovare.
4. **Sonnet subagent**: Dennis preferisce **solo Opus** per i subagent (feedback salvato in memory). Sonnet e' inaffidabile per task ML dettagliati.
5. **Nessun emoji** nei commit/codice a meno che il plan lo richieda esplicitamente.

## Dipendenze chiave

Da `pyproject.toml`:
- Core: torch>=2.3, tokenizers>=0.19, click>=8.1, pyyaml, python-dotenv, tqdm
- Dev: pytest>=8, pytest-cov, ruff>=0.6
- Datagen: anthropic>=0.40
- Deploy: onnx>=1.17, onnxruntime>=1.19, huggingface-hub>=0.25, safetensors>=0.4

Il `[tool.uv.sources]` override forza torch da `https://download.pytorch.org/whl/cu121` per avere CUDA 12.1 (compatibile con il driver 13.1 della 3060).

## Tags e milestone

- `v0.1.0-core` (commit `4457a4d`) - Phase 1 completa. Locale, non pushato.
- Next tag: `v0.2.0-datagen` dopo Phase 2 (30K dataset generato)

## File strutturali presenti

```
glublm/
├── .env.example              # committed
├── .env.local                # gitignored - ha UV_PROJECT_ENVIRONMENT export per bash
├── .gitignore
├── .python-version           # "3.12"
├── .github/workflows/test.yml
├── LICENSE                   # AGPL-3.0 full text
├── README.md                 # skeleton, Phase 3 lo espande
├── SESSION_NOTES.md          # questo file
├── pyproject.toml            # uv + ruff + pytest config + deps
├── uv.lock                   # committed (Task 2)
├── docs/
│   └── superpowers/
│       ├── specs/2026-04-09-glublm-design.md
│       └── plans/
│           ├── 2026-04-09-glublm-ultraplan.md
│           ├── 2026-04-09-glublm-phase-1-core.md
│           ├── 2026-04-09-glublm-phase-2-datagen.md
│           └── 2026-04-09-glublm-phase-3-deploy.md
├── src/glublm/
│   ├── __init__.py           # __version__ = "0.1.0"
│   ├── config.py             # ModelConfig + TrainConfig
│   ├── model.py              # GlubLM transformer (18.4M params default)
│   ├── tokenizer.py          # GlubTokenizer (BPE ByteLevel + decoder)
│   ├── dataset.py            # GlubDataset + load_samples
│   ├── train.py              # cosine_schedule + train_one_epoch + checkpoints
│   ├── inference.py          # top_k_top_p_sample + generate
│   ├── cli.py                # Click group: train + chat
│   └── layers/
│       ├── __init__.py
│       ├── rmsnorm.py
│       ├── rope.py
│       ├── swiglu.py
│       └── attention.py
└── tests/
    ├── __init__.py
    ├── conftest.py           # seed_everything + device fixture
    ├── fixtures/
    │   ├── __init__.py
    │   └── tiny_dataset.json # 8 sample goldfish/ted-lasso
    ├── test_config.py        # 3 tests
    ├── test_rmsnorm.py       # 4 tests
    ├── test_rope.py          # 5 tests
    ├── test_swiglu.py        # 4 tests
    ├── test_attention.py     # 4 tests
    ├── test_model.py         # 7 tests (incluso overfit-single-batch)
    ├── test_tokenizer.py     # 4 tests
    ├── test_dataset.py       # 5 tests
    ├── test_train.py         # 2 tests
    ├── test_inference.py     # 4 tests
    ├── test_cli.py           # 4 tests
    └── test_end_to_end.py    # 2 tests (train+chat via CliRunner)
```

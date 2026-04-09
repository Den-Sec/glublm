# GlubLM Session Handoff

> Questo file aiuta la prossima sessione Claude (o un nuovo engineer) a riprendere l'esecuzione del plan senza dover ricostruire il contesto dalla sessione precedente.
>
> **Aggiornato**: 2026-04-09 da Claude Opus 4.6 (1M context)

## Stato corrente

### Completato
- [x] Brainstorming + design decisions (spec committata in [`docs/superpowers/specs/2026-04-09-glublm-design.md`](docs/superpowers/specs/2026-04-09-glublm-design.md))
- [x] Ultraplan + 3 phase plans ([`docs/superpowers/plans/`](docs/superpowers/plans/))
- [x] **Phase 1 Tasks 1, 3-7**: Scaffolding completo (pyproject.toml, .python-version, .gitignore, .env.example, LICENSE AGPL-3.0, README skeleton, GitHub Actions CI stub, src/ layout, tests/conftest.py)
- [x] **Phase 1 Task 2**: `uv sync --all-extras` (ma con caveat, vedi sotto)

### Prossimo da fare
- [ ] **Phase 1 Task 8**: `ModelConfig` + `TrainConfig` dataclasses con test
- [ ] Task 9-19 a seguire (vedi [`docs/superpowers/plans/2026-04-09-glublm-phase-1-core.md`](docs/superpowers/plans/2026-04-09-glublm-phase-1-core.md) dal Task 8 in poi)

### Phase 2 e 3
Non ancora iniziate. Phase 2 costa ~$45 in API credits Claude. Phase 3 richiede HF + PyPI + GH Pages credenziali. Sessioni separate quando sei pronto.

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

- Nessun tag ancora creato
- Next tag: `v0.1.0-core` dopo Task 19 (end-to-end smoke test + ruff + pytest green)

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
│   └── layers/__init__.py
└── tests/
    ├── __init__.py
    ├── conftest.py           # seed_everything + device fixture
    └── fixtures/__init__.py
```

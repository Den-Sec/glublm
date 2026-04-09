# GlubLM Phase 1 — Core Model Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the GlubLM model, tokenizer, dataset loader, training loop, inference, and CLI — all tested, all lint-clean, ready to consume the real dataset produced by Phase 2.

**Architecture:** Decoder-only transformer, 8 layers × hidden 448 × 7 heads, RoPE position encoding, SwiGLU FFN, RMSNorm, weight-tied LM head, 48-token hard context, BPE tokenizer (vocab 5120).

**Tech Stack:** Python 3.12, uv, PyTorch 2.x with CUDA, `tokenizers` (HuggingFace), click, pytest, ruff, BF16 training on RTX 3060.

**Spec reference:** [`../specs/2026-04-09-glublm-design.md`](../specs/2026-04-09-glublm-design.md) sections 4, 6, 8

---

## File Structure (created in this phase)

```
L:/Dennis/Projects/glublm/
├── pyproject.toml              # Task 1
├── uv.lock                     # Task 2 (auto-generated)
├── .python-version             # Task 1
├── .gitignore                  # Task 3
├── .env.example                # Task 3
├── LICENSE                     # Task 4
├── README.md                   # Task 5 (skeleton; final version in Phase 3)
├── .github/workflows/test.yml  # Task 6
├── src/glublm/
│   ├── __init__.py             # Task 7
│   ├── config.py               # Task 8
│   ├── layers/
│   │   ├── __init__.py         # Task 9
│   │   ├── rmsnorm.py          # Task 9
│   │   ├── rope.py             # Task 10
│   │   ├── swiglu.py           # Task 11
│   │   └── attention.py        # Task 12
│   ├── model.py                # Task 13
│   ├── tokenizer.py            # Task 14
│   ├── dataset.py              # Task 15
│   ├── train.py                # Task 16
│   ├── inference.py            # Task 17
│   └── cli.py                  # Task 18
├── tests/
│   ├── __init__.py             # Task 7
│   ├── conftest.py             # Task 7
│   ├── fixtures/
│   │   └── tiny_dataset.json   # Task 15
│   ├── test_config.py          # Task 8
│   ├── test_rmsnorm.py         # Task 9
│   ├── test_rope.py            # Task 10
│   ├── test_swiglu.py          # Task 11
│   ├── test_attention.py       # Task 12
│   ├── test_model.py           # Task 13
│   ├── test_tokenizer.py       # Task 14
│   ├── test_dataset.py         # Task 15
│   ├── test_train.py           # Task 16
│   ├── test_inference.py       # Task 17
│   ├── test_cli.py             # Task 18
│   └── test_end_to_end.py      # Task 19
```

---

## Task 1: Initialize uv project with Python 3.12

**Files:**
- Create: `L:/Dennis/Projects/glublm/pyproject.toml`
- Create: `L:/Dennis/Projects/glublm/.python-version`

- [ ] **Step 1.1: Verify uv is installed**

Run: `uv --version`  
Expected: `uv 0.4.x` or higher. If not installed: `pipx install uv` or download from https://docs.astral.sh/uv/

- [ ] **Step 1.2: Create `.python-version`**

Write to `L:/Dennis/Projects/glublm/.python-version`:
```
3.12
```

- [ ] **Step 1.3: Create `pyproject.toml`**

Write to `L:/Dennis/Projects/glublm/pyproject.toml`:
```toml
[project]
name = "glublm"
version = "0.1.0"
description = "A 15M-parameter goldfish language model with a 10-second memory"
readme = "README.md"
requires-python = ">=3.12"
license = { text = "AGPL-3.0-or-later" }
authors = [
    { name = "Dennis Sepede", email = "dennis@den-sec.local" },
]
keywords = ["llm", "transformer", "goldfish", "tiny-lm", "pytorch"]
classifiers = [
    "Development Status :: 3 - Alpha",
    "Intended Audience :: Developers",
    "License :: OSI Approved :: GNU Affero General Public License v3 or later (AGPLv3+)",
    "Programming Language :: Python :: 3.12",
    "Topic :: Scientific/Engineering :: Artificial Intelligence",
]
dependencies = [
    "torch>=2.3.0",
    "tokenizers>=0.19.0",
    "click>=8.1.0",
    "pyyaml>=6.0",
    "python-dotenv>=1.0.0",
    "tqdm>=4.66.0",
]

[project.optional-dependencies]
dev = [
    "pytest>=8.0.0",
    "pytest-cov>=5.0.0",
    "ruff>=0.6.0",
]
datagen = [
    "anthropic>=0.40.0",
]
deploy = [
    "onnx>=1.17.0",
    "onnxruntime>=1.19.0",
    "huggingface-hub>=0.25.0",
    "safetensors>=0.4.0",
]

[project.scripts]
glublm = "glublm.cli:main"

[project.urls]
Repository = "https://github.com/Den-Sec/glublm"
Issues = "https://github.com/Den-Sec/glublm/issues"

[build-system]
requires = ["hatchling"]
build-backend = "hatchling.build"

[tool.hatch.build.targets.wheel]
packages = ["src/glublm"]

[tool.ruff]
line-length = 100
target-version = "py312"
extend-exclude = ["notebooks/**"]

[tool.ruff.lint]
select = ["E", "F", "I", "N", "UP", "B", "C4", "SIM", "RUF"]
ignore = ["E501"]

[tool.pytest.ini_options]
testpaths = ["tests"]
addopts = "-v --tb=short"
```

- [ ] **Step 1.4: Commit**

```bash
cd "L:/Dennis/Projects/glublm"
git add pyproject.toml .python-version
git commit -m "chore(core): init uv project with Python 3.12

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>"
```

---

## Task 2: Install dependencies with uv sync

**Files:**
- Modify: none (uv creates `uv.lock` automatically)

- [ ] **Step 2.1: Run `uv sync --all-extras`**

```bash
cd "L:/Dennis/Projects/glublm"
uv sync --all-extras
```

Expected: uv creates `.venv/`, installs torch + tokenizers + click + dev deps. PyTorch downloads are ~2 GB — be patient.

- [ ] **Step 2.2: Verify CUDA PyTorch**

```bash
uv run python -c "import torch; print('CUDA:', torch.cuda.is_available(), 'Device:', torch.cuda.get_device_name(0) if torch.cuda.is_available() else 'CPU')"
```

Expected output: `CUDA: True Device: NVIDIA GeForce RTX 3060`

If CUDA is False, install the CUDA index explicitly:

```bash
uv pip install torch --index-url https://download.pytorch.org/whl/cu121
```

- [ ] **Step 2.3: Verify pytest and ruff run**

```bash
uv run pytest --version
uv run ruff --version
```

Expected: both print versions without error.

- [ ] **Step 2.4: Commit the lockfile**

```bash
git add uv.lock
git commit -m "chore(core): add uv.lock with PyTorch CUDA 12.1

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>"
```

---

## Task 3: Create .gitignore and .env.example

**Files:**
- Create: `.gitignore`
- Create: `.env.example`

- [ ] **Step 3.1: Write `.gitignore`**

Write to `L:/Dennis/Projects/glublm/.gitignore`:
```
# Python
__pycache__/
*.py[cod]
*$py.class
*.so
.Python
build/
develop-eggs/
dist/
downloads/
eggs/
.eggs/
lib/
lib64/
parts/
sdist/
var/
wheels/
*.egg-info/
.installed.cfg
*.egg

# Virtual env
.venv/
venv/
env/
ENV/

# Testing
.pytest_cache/
.coverage
.coverage.*
htmlcov/
.tox/

# IDE
.vscode/
.idea/
*.swp
*.swo
*~

# OS
.DS_Store
Thumbs.db

# Secrets
.env
.env.local
*.secret

# Models and data
*.pt
*.bin
*.safetensors
*.onnx
data/
checkpoints/
runs/
logs/
wandb/

# Exception: ship the quantized demo model
!web/model.onnx
!web/tokenizer.json

# HuggingFace cache
.cache/
```

- [ ] **Step 3.2: Write `.env.example`**

Write to `L:/Dennis/Projects/glublm/.env.example`:
```
# Anthropic API key for multi-agent dataset generation (Phase 2)
ANTHROPIC_API_KEY=sk-ant-api03-REPLACE-ME

# HuggingFace write token for pushing model and dataset (Phase 3)
HF_TOKEN=hf_REPLACE-ME
```

- [ ] **Step 3.3: Commit**

```bash
git add .gitignore .env.example
git commit -m "chore(core): add gitignore and env example

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>"
```

---

## Task 4: Add AGPL-3.0 LICENSE

**Files:**
- Create: `LICENSE`

- [ ] **Step 4.1: Download AGPL-3.0 text**

```bash
cd "L:/Dennis/Projects/glublm"
curl -sL https://www.gnu.org/licenses/agpl-3.0.txt -o LICENSE
head -3 LICENSE
```

Expected: First line reads `GNU AFFERO GENERAL PUBLIC LICENSE`.

- [ ] **Step 4.2: Commit**

```bash
git add LICENSE
git commit -m "chore(core): add AGPL-3.0 license

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>"
```

---

## Task 5: Write README skeleton

**Files:**
- Create: `README.md`

- [ ] **Step 5.1: Write `README.md`**

Write to `L:/Dennis/Projects/glublm/README.md`:
```markdown
# GlubLM 🐠

> *the language model that already forgot this sentence*

**GlubLM** is a 15M-parameter language model that pretends to be a goldfish with a 10-second memory. Inspired by [GuppyLM](https://github.com/arman-bd/guppylm) by Arman BD and by Ted Lasso's meditation on the goldfish as "the happiest animal on earth", GlubLM has a hard 48-token context window — it *cannot* remember what was just said.

Unlike its inspiration, GlubLM uses modern transformer components (RoPE, SwiGLU, RMSNorm) and was trained on a dataset generated by a team of Claude agents — not hand-authored templates.

## Quick start

```bash
pip install glublm
glublm chat
```

## Training from scratch

See [`docs/TRAINING.md`](docs/TRAINING.md) and [`notebooks/train_colab.ipynb`](notebooks/train_colab.ipynb).

## Architecture

- 15M parameters, 8 transformer layers, hidden 448, 7 attention heads
- RoPE position encoding, SwiGLU FFN, RMSNorm
- 48-token hard context window (physical 10-second memory)
- BPE tokenizer, vocab 5120
- Trained on 30K samples generated by a multi-agent Claude team

See [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) for details.

## Comparison with GuppyLM

See [`docs/COMPARISONS.md`](docs/COMPARISONS.md) for the empirical comparison.

## License

AGPL-3.0 — see [`LICENSE`](LICENSE).

## Credits

- [GuppyLM](https://github.com/arman-bd/guppylm) by Arman BD — the inspiration
- Ted Lasso — "be a goldfish" philosophy
- Anthropic Claude — dataset generation agent team
```

- [ ] **Step 5.2: Commit**

```bash
git add README.md
git commit -m "docs(core): add README skeleton

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>"
```

---

## Task 6: GitHub Actions CI stub

**Files:**
- Create: `.github/workflows/test.yml`

- [ ] **Step 6.1: Create workflow directory**

```bash
mkdir -p "L:/Dennis/Projects/glublm/.github/workflows"
```

- [ ] **Step 6.2: Write `test.yml`**

Write to `L:/Dennis/Projects/glublm/.github/workflows/test.yml`:
```yaml
name: test

on:
  push:
    branches: [master, main]
  pull_request:

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Install uv
        uses: astral-sh/setup-uv@v3
        with:
          version: "latest"

      - name: Set up Python 3.12
        run: uv python install 3.12

      - name: Install dependencies (CPU torch)
        run: |
          uv sync --extra dev
          uv pip install torch --index-url https://download.pytorch.org/whl/cpu

      - name: Lint with ruff
        run: uv run ruff check src/ tests/

      - name: Run tests
        run: uv run pytest tests/ -v
```

- [ ] **Step 6.3: Commit**

```bash
git add .github/workflows/test.yml
git commit -m "ci(core): add test workflow with ruff + pytest

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>"
```

---

## Task 7: Create src/ layout + empty __init__ files + conftest

**Files:**
- Create: `src/glublm/__init__.py`
- Create: `src/glublm/layers/__init__.py`
- Create: `tests/__init__.py`
- Create: `tests/conftest.py`
- Create: `tests/fixtures/__init__.py`

- [ ] **Step 7.1: Create directories**

```bash
cd "L:/Dennis/Projects/glublm"
mkdir -p src/glublm/layers tests/fixtures
```

- [ ] **Step 7.2: Write `src/glublm/__init__.py`**

```python
"""GlubLM — a 15M-parameter goldfish language model."""
from __future__ import annotations

__version__ = "0.1.0"
```

- [ ] **Step 7.3: Write `src/glublm/layers/__init__.py`**

```python
"""Transformer layer primitives for GlubLM."""
from __future__ import annotations
```

- [ ] **Step 7.4: Write empty `tests/__init__.py` and `tests/fixtures/__init__.py`**

Both files contain only:
```python
```

- [ ] **Step 7.5: Write `tests/conftest.py`**

```python
"""Shared pytest fixtures for GlubLM tests."""
from __future__ import annotations

import random

import pytest
import torch


@pytest.fixture(autouse=True)
def _seed_everything() -> None:
    """Make every test deterministic."""
    random.seed(0)
    torch.manual_seed(0)
    if torch.cuda.is_available():
        torch.cuda.manual_seed_all(0)


@pytest.fixture
def device() -> torch.device:
    """Preferred compute device for tests."""
    return torch.device("cuda" if torch.cuda.is_available() else "cpu")
```

- [ ] **Step 7.6: Verify layout and commit**

```bash
uv run pytest tests/ -v
```

Expected: `no tests ran in 0.xs` (zero collected, exit code 5). That is fine.

```bash
git add src/ tests/
git commit -m "chore(core): scaffold src layout and conftest

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>"
```

---

## Task 8: ModelConfig dataclass

**Files:**
- Create: `src/glublm/config.py`
- Test: `tests/test_config.py`

- [ ] **Step 8.1: Write failing test**

Write to `tests/test_config.py`:
```python
"""Tests for ModelConfig and TrainConfig."""
from __future__ import annotations

import pytest

from glublm.config import ModelConfig, TrainConfig


def test_model_config_defaults():
    cfg = ModelConfig()
    assert cfg.vocab_size == 5120
    assert cfg.d_model == 448
    assert cfg.n_layers == 8
    assert cfg.n_heads == 7
    assert cfg.d_model % cfg.n_heads == 0
    assert cfg.head_dim == 64
    assert cfg.ffn_hidden == 896
    assert cfg.max_seq_len == 48
    assert cfg.rope_theta == 10000.0
    assert cfg.dropout == 0.1
    assert cfg.tie_embeddings is True
    assert cfg.rms_norm_eps == 1e-5


def test_model_config_invalid_heads():
    with pytest.raises(ValueError, match="d_model must be divisible"):
        ModelConfig(d_model=448, n_heads=5)


def test_train_config_defaults():
    cfg = TrainConfig()
    assert cfg.lr == 3e-4
    assert cfg.batch_size == 64
    assert cfg.epochs == 4
    assert cfg.warmup_ratio == 0.05
    assert cfg.weight_decay == 0.1
    assert cfg.grad_clip == 1.0
    assert cfg.dtype == "bfloat16"
    assert cfg.seed == 0
```

- [ ] **Step 8.2: Run test to verify failure**

```bash
uv run pytest tests/test_config.py -v
```

Expected: `ModuleNotFoundError: No module named 'glublm.config'`

- [ ] **Step 8.3: Write `src/glublm/config.py`**

```python
"""Configuration dataclasses for GlubLM model and training."""
from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True)
class ModelConfig:
    """Transformer architecture configuration.

    Defaults correspond to the ~15M parameter GlubLM target.
    """

    vocab_size: int = 5120
    d_model: int = 448
    n_layers: int = 8
    n_heads: int = 7
    ffn_hidden: int = 896
    max_seq_len: int = 48
    rope_theta: float = 10000.0
    dropout: float = 0.1
    tie_embeddings: bool = True
    rms_norm_eps: float = 1e-5

    def __post_init__(self) -> None:
        if self.d_model % self.n_heads != 0:
            raise ValueError(
                f"d_model must be divisible by n_heads "
                f"(got d_model={self.d_model}, n_heads={self.n_heads})"
            )

    @property
    def head_dim(self) -> int:
        return self.d_model // self.n_heads


@dataclass(frozen=True)
class TrainConfig:
    """Training hyperparameters."""

    lr: float = 3e-4
    batch_size: int = 64
    epochs: int = 4
    warmup_ratio: float = 0.05
    weight_decay: float = 0.1
    beta1: float = 0.9
    beta2: float = 0.95
    grad_clip: float = 1.0
    dtype: str = "bfloat16"
    seed: int = 0
    log_every: int = 50
    eval_every: int = 500
    save_every: int = 1000
```

- [ ] **Step 8.4: Run tests to verify pass**

```bash
uv run pytest tests/test_config.py -v
```

Expected: 3 passed.

- [ ] **Step 8.5: Lint + commit**

```bash
uv run ruff check src/glublm/config.py tests/test_config.py
git add src/glublm/config.py tests/test_config.py
git commit -m "feat(core): add ModelConfig and TrainConfig dataclasses

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>"
```

---

## Task 9: RMSNorm layer

**Files:**
- Create: `src/glublm/layers/rmsnorm.py`
- Test: `tests/test_rmsnorm.py`

- [ ] **Step 9.1: Write failing test**

Write to `tests/test_rmsnorm.py`:
```python
"""Tests for RMSNorm layer."""
from __future__ import annotations

import torch

from glublm.layers.rmsnorm import RMSNorm


def test_rmsnorm_shape():
    norm = RMSNorm(dim=448)
    x = torch.randn(2, 16, 448)
    out = norm(x)
    assert out.shape == x.shape


def test_rmsnorm_preserves_magnitude():
    norm = RMSNorm(dim=64)
    x = torch.ones(1, 4, 64) * 3.0
    out = norm(x)
    # With unit weight, RMSNorm(3*ones) should equal ones * weight (≈ 1.0).
    torch.testing.assert_close(out, torch.ones_like(x), atol=1e-5, rtol=1e-5)


def test_rmsnorm_gradient_flows():
    norm = RMSNorm(dim=32)
    x = torch.randn(2, 8, 32, requires_grad=True)
    out = norm(x)
    out.sum().backward()
    assert x.grad is not None
    assert not torch.isnan(x.grad).any()


def test_rmsnorm_weight_param():
    norm = RMSNorm(dim=16)
    assert norm.weight.shape == (16,)
    torch.testing.assert_close(norm.weight, torch.ones(16))
```

- [ ] **Step 9.2: Run test — expect failure**

```bash
uv run pytest tests/test_rmsnorm.py -v
```

Expected: `ModuleNotFoundError: No module named 'glublm.layers.rmsnorm'`

- [ ] **Step 9.3: Write `src/glublm/layers/rmsnorm.py`**

```python
"""Root Mean Square Layer Normalization (Zhang & Sennrich, 2019)."""
from __future__ import annotations

import torch
from torch import nn


class RMSNorm(nn.Module):
    """RMSNorm: normalizes by the root mean square of the activation, no bias.

    Equivalent to LayerNorm without the mean-centering step.
    Used in Llama, T5, and other modern transformers.
    """

    def __init__(self, dim: int, eps: float = 1e-5) -> None:
        super().__init__()
        self.eps = eps
        self.weight = nn.Parameter(torch.ones(dim))

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        # Compute RMS over the last dimension in fp32 for numerical stability,
        # then cast back to the input dtype.
        orig_dtype = x.dtype
        x_fp32 = x.float()
        rms = x_fp32.pow(2).mean(dim=-1, keepdim=True).add(self.eps).rsqrt()
        return (x_fp32 * rms).to(orig_dtype) * self.weight
```

- [ ] **Step 9.4: Run tests — expect pass**

```bash
uv run pytest tests/test_rmsnorm.py -v
```

Expected: 4 passed.

- [ ] **Step 9.5: Lint + commit**

```bash
uv run ruff check src/glublm/layers/rmsnorm.py tests/test_rmsnorm.py
git add src/glublm/layers/rmsnorm.py tests/test_rmsnorm.py
git commit -m "feat(core): add RMSNorm layer with tests

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>"
```

---

## Task 10: Rotary Position Embedding (RoPE)

**Files:**
- Create: `src/glublm/layers/rope.py`
- Test: `tests/test_rope.py`

- [ ] **Step 10.1: Write failing test**

Write to `tests/test_rope.py`:
```python
"""Tests for rotary position embedding (RoPE)."""
from __future__ import annotations

import torch

from glublm.layers.rope import RotaryEmbedding, apply_rope


def test_rope_shape():
    rope = RotaryEmbedding(head_dim=64, max_seq_len=48)
    cos, sin = rope(seq_len=48)
    assert cos.shape == (48, 64)
    assert sin.shape == (48, 64)


def test_rope_apply_preserves_shape():
    rope = RotaryEmbedding(head_dim=64, max_seq_len=48)
    cos, sin = rope(seq_len=16)
    q = torch.randn(2, 4, 16, 64)  # (batch, heads, seq, head_dim)
    k = torch.randn(2, 4, 16, 64)
    q_rot, k_rot = apply_rope(q, k, cos, sin)
    assert q_rot.shape == q.shape
    assert k_rot.shape == k.shape


def test_rope_preserves_norm():
    """Rotation is unitary — the per-vector norm should be unchanged."""
    rope = RotaryEmbedding(head_dim=32, max_seq_len=10)
    cos, sin = rope(seq_len=5)
    q = torch.randn(1, 2, 5, 32)
    q_rot, _ = apply_rope(q, q.clone(), cos, sin)
    torch.testing.assert_close(
        q.norm(dim=-1), q_rot.norm(dim=-1), atol=1e-5, rtol=1e-5
    )


def test_rope_position_zero_is_identity():
    """Position 0 has cos=1, sin=0, so RoPE should leave the vector unchanged."""
    rope = RotaryEmbedding(head_dim=16, max_seq_len=4)
    cos, sin = rope(seq_len=1)
    q = torch.randn(1, 1, 1, 16)
    q_rot, _ = apply_rope(q, q.clone(), cos, sin)
    torch.testing.assert_close(q, q_rot, atol=1e-6, rtol=1e-6)


def test_rope_different_positions_differ():
    rope = RotaryEmbedding(head_dim=16, max_seq_len=4)
    cos, sin = rope(seq_len=2)
    q = torch.ones(1, 1, 2, 16)
    q_rot, _ = apply_rope(q, q.clone(), cos, sin)
    # position 0 is identity, position 1 is not
    assert not torch.allclose(q_rot[:, :, 0], q_rot[:, :, 1])
```

- [ ] **Step 10.2: Run test — expect failure**

```bash
uv run pytest tests/test_rope.py -v
```

Expected: `ModuleNotFoundError`.

- [ ] **Step 10.3: Write `src/glublm/layers/rope.py`**

```python
"""Rotary Position Embedding (RoPE) from RoFormer (Su et al., 2021).

Applies a rotation in 2D subspaces of the attention query/key vectors,
encoding absolute position through a relative-position-aware rotation.
"""
from __future__ import annotations

import torch
from torch import nn


def _build_cos_sin(
    head_dim: int, max_seq_len: int, theta: float = 10000.0
) -> tuple[torch.Tensor, torch.Tensor]:
    """Precompute cos and sin tables of shape (max_seq_len, head_dim)."""
    assert head_dim % 2 == 0, "head_dim must be even for RoPE"
    # Inverse frequencies for each pair of dimensions
    inv_freq = 1.0 / (theta ** (torch.arange(0, head_dim, 2, dtype=torch.float32) / head_dim))
    positions = torch.arange(max_seq_len, dtype=torch.float32)
    freqs = torch.outer(positions, inv_freq)  # (seq, head_dim/2)
    # Repeat each frequency to match head_dim: [f0, f0, f1, f1, ...]
    cos = freqs.cos().repeat_interleave(2, dim=-1)  # (seq, head_dim)
    sin = freqs.sin().repeat_interleave(2, dim=-1)  # (seq, head_dim)
    return cos, sin


def _rotate_half(x: torch.Tensor) -> torch.Tensor:
    """Rotate pairs: (x0, x1, x2, x3, ...) -> (-x1, x0, -x3, x2, ...)."""
    x_even = x[..., 0::2]
    x_odd = x[..., 1::2]
    # Interleave back: [-x_odd, x_even]
    return torch.stack((-x_odd, x_even), dim=-1).flatten(-2)


def apply_rope(
    q: torch.Tensor,
    k: torch.Tensor,
    cos: torch.Tensor,
    sin: torch.Tensor,
) -> tuple[torch.Tensor, torch.Tensor]:
    """Apply rotary embeddings to q and k.

    Args:
        q: query tensor of shape (batch, heads, seq, head_dim)
        k: key tensor of shape (batch, heads, seq, head_dim)
        cos: cosine table of shape (seq, head_dim)
        sin: sine table of shape (seq, head_dim)

    Returns:
        (q_rot, k_rot) with the same shapes as the inputs.
    """
    # Reshape cos/sin for broadcasting: (1, 1, seq, head_dim)
    cos_b = cos.unsqueeze(0).unsqueeze(0)
    sin_b = sin.unsqueeze(0).unsqueeze(0)
    q_rot = (q * cos_b) + (_rotate_half(q) * sin_b)
    k_rot = (k * cos_b) + (_rotate_half(k) * sin_b)
    return q_rot, k_rot


class RotaryEmbedding(nn.Module):
    """Holds precomputed cos/sin tables for a given head_dim and max_seq_len."""

    def __init__(
        self,
        head_dim: int,
        max_seq_len: int,
        theta: float = 10000.0,
    ) -> None:
        super().__init__()
        cos, sin = _build_cos_sin(head_dim, max_seq_len, theta)
        self.register_buffer("cos_cached", cos, persistent=False)
        self.register_buffer("sin_cached", sin, persistent=False)
        self.max_seq_len = max_seq_len

    def forward(self, seq_len: int) -> tuple[torch.Tensor, torch.Tensor]:
        if seq_len > self.max_seq_len:
            raise ValueError(
                f"seq_len={seq_len} exceeds max_seq_len={self.max_seq_len}"
            )
        return self.cos_cached[:seq_len], self.sin_cached[:seq_len]
```

- [ ] **Step 10.4: Run tests — expect pass**

```bash
uv run pytest tests/test_rope.py -v
```

Expected: 5 passed.

- [ ] **Step 10.5: Lint + commit**

```bash
uv run ruff check src/glublm/layers/rope.py tests/test_rope.py
git add src/glublm/layers/rope.py tests/test_rope.py
git commit -m "feat(core): add rotary position embedding (RoPE) with tests

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>"
```

---

## Task 11: SwiGLU Feed-Forward

**Files:**
- Create: `src/glublm/layers/swiglu.py`
- Test: `tests/test_swiglu.py`

- [ ] **Step 11.1: Write failing test**

Write to `tests/test_swiglu.py`:
```python
"""Tests for SwiGLU feed-forward network."""
from __future__ import annotations

import torch

from glublm.layers.swiglu import SwiGLU


def test_swiglu_shape():
    ffn = SwiGLU(d_model=448, d_hidden=896)
    x = torch.randn(2, 16, 448)
    out = ffn(x)
    assert out.shape == x.shape


def test_swiglu_has_three_projections():
    ffn = SwiGLU(d_model=64, d_hidden=128)
    # gate, up, down
    assert ffn.gate_proj.weight.shape == (128, 64)
    assert ffn.up_proj.weight.shape == (128, 64)
    assert ffn.down_proj.weight.shape == (64, 128)


def test_swiglu_no_bias():
    ffn = SwiGLU(d_model=32, d_hidden=64)
    assert ffn.gate_proj.bias is None
    assert ffn.up_proj.bias is None
    assert ffn.down_proj.bias is None


def test_swiglu_gradient_flows():
    ffn = SwiGLU(d_model=32, d_hidden=64)
    x = torch.randn(1, 4, 32, requires_grad=True)
    out = ffn(x)
    out.sum().backward()
    assert x.grad is not None
    assert not torch.isnan(x.grad).any()
```

- [ ] **Step 11.2: Run test — expect failure**

```bash
uv run pytest tests/test_swiglu.py -v
```

Expected: ModuleNotFoundError.

- [ ] **Step 11.3: Write `src/glublm/layers/swiglu.py`**

```python
"""SwiGLU feed-forward network (Shazeer 2020)."""
from __future__ import annotations

import torch
import torch.nn.functional as F
from torch import nn


class SwiGLU(nn.Module):
    """SwiGLU feed-forward: down_proj(silu(gate_proj(x)) * up_proj(x)).

    Used by Llama, PaLM. Typically +10-15% quality over ReLU FFN at
    comparable parameter counts.
    """

    def __init__(self, d_model: int, d_hidden: int) -> None:
        super().__init__()
        self.gate_proj = nn.Linear(d_model, d_hidden, bias=False)
        self.up_proj = nn.Linear(d_model, d_hidden, bias=False)
        self.down_proj = nn.Linear(d_hidden, d_model, bias=False)

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        return self.down_proj(F.silu(self.gate_proj(x)) * self.up_proj(x))
```

- [ ] **Step 11.4: Run tests — expect pass**

```bash
uv run pytest tests/test_swiglu.py -v
```

Expected: 4 passed.

- [ ] **Step 11.5: Commit**

```bash
uv run ruff check src/glublm/layers/swiglu.py tests/test_swiglu.py
git add src/glublm/layers/swiglu.py tests/test_swiglu.py
git commit -m "feat(core): add SwiGLU feed-forward with tests

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>"
```

---

## Task 12: Multi-Head Attention with RoPE

**Files:**
- Create: `src/glublm/layers/attention.py`
- Test: `tests/test_attention.py`

- [ ] **Step 12.1: Write failing test**

Write to `tests/test_attention.py`:
```python
"""Tests for multi-head attention with RoPE."""
from __future__ import annotations

import torch

from glublm.layers.attention import CausalSelfAttention
from glublm.layers.rope import RotaryEmbedding


def test_attention_shape():
    rope = RotaryEmbedding(head_dim=64, max_seq_len=48)
    attn = CausalSelfAttention(d_model=448, n_heads=7, dropout=0.0)
    x = torch.randn(2, 16, 448)
    cos, sin = rope(seq_len=16)
    out = attn(x, cos, sin)
    assert out.shape == x.shape


def test_attention_no_bias():
    attn = CausalSelfAttention(d_model=64, n_heads=4, dropout=0.0)
    assert attn.qkv_proj.bias is None
    assert attn.out_proj.bias is None


def test_attention_is_causal():
    """Token i should not attend to token j>i.

    We check this by making all token embeddings identical except the last.
    If attention is causal, every output position except the last should be identical;
    only the last position should differ.
    """
    rope = RotaryEmbedding(head_dim=16, max_seq_len=8)
    attn = CausalSelfAttention(d_model=32, n_heads=2, dropout=0.0)
    attn.eval()
    x = torch.randn(1, 4, 32)
    # Add a large perturbation at position 3 (the last). Positions 0-2 should
    # remain unaffected because they only attend to positions 0..i (where i<3).
    x_pert = x.clone()
    x_pert[0, 3] += 100.0
    cos, sin = rope(seq_len=4)
    out1 = attn(x, cos, sin)
    out2 = attn(x_pert, cos, sin)
    # Positions 0..2 must be identical
    torch.testing.assert_close(out1[:, :3], out2[:, :3], atol=1e-5, rtol=1e-5)
    # Position 3 must differ
    assert not torch.allclose(out1[:, 3], out2[:, 3])


def test_attention_gradient_flows():
    rope = RotaryEmbedding(head_dim=16, max_seq_len=8)
    attn = CausalSelfAttention(d_model=32, n_heads=2, dropout=0.0)
    x = torch.randn(1, 4, 32, requires_grad=True)
    cos, sin = rope(seq_len=4)
    out = attn(x, cos, sin)
    out.sum().backward()
    assert x.grad is not None
    assert not torch.isnan(x.grad).any()
```

- [ ] **Step 12.2: Run test — expect failure**

```bash
uv run pytest tests/test_attention.py -v
```

Expected: ModuleNotFoundError.

- [ ] **Step 12.3: Write `src/glublm/layers/attention.py`**

```python
"""Causal multi-head self-attention with RoPE."""
from __future__ import annotations

import torch
import torch.nn.functional as F
from torch import nn

from glublm.layers.rope import apply_rope


class CausalSelfAttention(nn.Module):
    """Multi-head causal self-attention with rotary position embeddings.

    Uses a fused QKV projection and calls `scaled_dot_product_attention`
    which dispatches to Flash Attention on compatible GPUs.
    """

    def __init__(self, d_model: int, n_heads: int, dropout: float) -> None:
        super().__init__()
        if d_model % n_heads != 0:
            raise ValueError(f"d_model {d_model} not divisible by n_heads {n_heads}")
        self.d_model = d_model
        self.n_heads = n_heads
        self.head_dim = d_model // n_heads
        self.dropout = dropout

        self.qkv_proj = nn.Linear(d_model, 3 * d_model, bias=False)
        self.out_proj = nn.Linear(d_model, d_model, bias=False)

    def forward(
        self,
        x: torch.Tensor,
        cos: torch.Tensor,
        sin: torch.Tensor,
    ) -> torch.Tensor:
        b, t, c = x.shape
        qkv = self.qkv_proj(x)  # (b, t, 3*c)
        q, k, v = qkv.chunk(3, dim=-1)
        # Reshape to (b, n_heads, t, head_dim)
        q = q.view(b, t, self.n_heads, self.head_dim).transpose(1, 2)
        k = k.view(b, t, self.n_heads, self.head_dim).transpose(1, 2)
        v = v.view(b, t, self.n_heads, self.head_dim).transpose(1, 2)

        # Apply RoPE to Q and K
        q, k = apply_rope(q, k, cos, sin)

        # Scaled dot-product attention with causal mask
        attn_out = F.scaled_dot_product_attention(
            q,
            k,
            v,
            dropout_p=self.dropout if self.training else 0.0,
            is_causal=True,
        )
        # Reassemble heads -> (b, t, c)
        attn_out = attn_out.transpose(1, 2).contiguous().view(b, t, c)
        return self.out_proj(attn_out)
```

- [ ] **Step 12.4: Run tests — expect pass**

```bash
uv run pytest tests/test_attention.py -v
```

Expected: 4 passed.

- [ ] **Step 12.5: Commit**

```bash
uv run ruff check src/glublm/layers/attention.py tests/test_attention.py
git add src/glublm/layers/attention.py tests/test_attention.py
git commit -m "feat(core): add causal self-attention with RoPE

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>"
```

---

## Task 13: Full Transformer Model (GlubLM)

**Files:**
- Create: `src/glublm/model.py`
- Test: `tests/test_model.py`

- [ ] **Step 13.1: Write failing test**

Write to `tests/test_model.py`:
```python
"""Tests for the full GlubLM transformer model."""
from __future__ import annotations

import torch

from glublm.config import ModelConfig
from glublm.model import GlubLM, TransformerBlock


def test_transformer_block_shape():
    cfg = ModelConfig()
    block = TransformerBlock(cfg)
    x = torch.randn(2, 16, cfg.d_model)
    cos = torch.randn(16, cfg.head_dim)
    sin = torch.randn(16, cfg.head_dim)
    out = block(x, cos, sin)
    assert out.shape == x.shape


def test_glublm_forward_shape():
    cfg = ModelConfig(vocab_size=100, d_model=64, n_layers=2, n_heads=4, ffn_hidden=128, max_seq_len=16)
    model = GlubLM(cfg)
    ids = torch.randint(0, cfg.vocab_size, (2, 16))
    logits = model(ids)
    assert logits.shape == (2, 16, cfg.vocab_size)


def test_glublm_weight_tying():
    cfg = ModelConfig(vocab_size=50, d_model=32, n_layers=1, n_heads=2, ffn_hidden=64, max_seq_len=8)
    model = GlubLM(cfg)
    # LM head weight should be the same tensor as the embedding weight
    assert model.lm_head.weight is model.embedding.weight


def test_glublm_param_count_target():
    """Sanity check: the default ~15M config produces 10M-25M params."""
    cfg = ModelConfig()
    model = GlubLM(cfg)
    n_params = sum(p.numel() for p in model.parameters())
    assert 10_000_000 < n_params < 25_000_000, f"got {n_params:,} params"


def test_glublm_gradient_flows():
    cfg = ModelConfig(vocab_size=50, d_model=32, n_layers=2, n_heads=2, ffn_hidden=64, max_seq_len=8)
    model = GlubLM(cfg)
    ids = torch.randint(0, cfg.vocab_size, (1, 4))
    logits = model(ids)
    loss = logits.sum()
    loss.backward()
    for name, p in model.named_parameters():
        assert p.grad is not None, f"no grad for {name}"
        assert not torch.isnan(p.grad).any(), f"nan grad for {name}"


def test_glublm_rejects_long_sequences():
    cfg = ModelConfig(vocab_size=50, d_model=32, n_layers=1, n_heads=2, ffn_hidden=64, max_seq_len=4)
    model = GlubLM(cfg)
    ids = torch.randint(0, cfg.vocab_size, (1, 16))
    try:
        model(ids)
        raise AssertionError("should have raised")
    except ValueError as e:
        assert "max_seq_len" in str(e) or "seq_len" in str(e)


def test_glublm_overfits_single_batch():
    """End-to-end sanity: the model should be able to overfit a single small batch."""
    cfg = ModelConfig(vocab_size=32, d_model=64, n_layers=2, n_heads=4, ffn_hidden=128, max_seq_len=8)
    model = GlubLM(cfg)
    ids = torch.randint(0, cfg.vocab_size, (4, 8))
    targets = ids.clone()
    optim = torch.optim.AdamW(model.parameters(), lr=1e-2)
    for _ in range(200):
        logits = model(ids)
        loss = torch.nn.functional.cross_entropy(
            logits.reshape(-1, cfg.vocab_size), targets.reshape(-1)
        )
        optim.zero_grad()
        loss.backward()
        optim.step()
    assert loss.item() < 0.5, f"loss did not drop: {loss.item()}"
```

- [ ] **Step 13.2: Run test — expect failure**

```bash
uv run pytest tests/test_model.py -v
```

Expected: ModuleNotFoundError.

- [ ] **Step 13.3: Write `src/glublm/model.py`**

```python
"""GlubLM: a decoder-only transformer with RoPE + SwiGLU + RMSNorm."""
from __future__ import annotations

import math

import torch
from torch import nn

from glublm.config import ModelConfig
from glublm.layers.attention import CausalSelfAttention
from glublm.layers.rmsnorm import RMSNorm
from glublm.layers.rope import RotaryEmbedding
from glublm.layers.swiglu import SwiGLU


class TransformerBlock(nn.Module):
    """Pre-norm transformer block: x + Attn(RMSNorm(x)) then x + FFN(RMSNorm(x))."""

    def __init__(self, cfg: ModelConfig) -> None:
        super().__init__()
        self.norm1 = RMSNorm(cfg.d_model, eps=cfg.rms_norm_eps)
        self.attn = CausalSelfAttention(
            d_model=cfg.d_model,
            n_heads=cfg.n_heads,
            dropout=cfg.dropout,
        )
        self.norm2 = RMSNorm(cfg.d_model, eps=cfg.rms_norm_eps)
        self.ffn = SwiGLU(d_model=cfg.d_model, d_hidden=cfg.ffn_hidden)
        self.dropout = nn.Dropout(cfg.dropout)

    def forward(
        self,
        x: torch.Tensor,
        cos: torch.Tensor,
        sin: torch.Tensor,
    ) -> torch.Tensor:
        x = x + self.dropout(self.attn(self.norm1(x), cos, sin))
        x = x + self.dropout(self.ffn(self.norm2(x)))
        return x


class GlubLM(nn.Module):
    """The full GlubLM language model."""

    def __init__(self, cfg: ModelConfig) -> None:
        super().__init__()
        self.cfg = cfg
        self.embedding = nn.Embedding(cfg.vocab_size, cfg.d_model)
        self.rope = RotaryEmbedding(
            head_dim=cfg.head_dim,
            max_seq_len=cfg.max_seq_len,
            theta=cfg.rope_theta,
        )
        self.blocks = nn.ModuleList([TransformerBlock(cfg) for _ in range(cfg.n_layers)])
        self.final_norm = RMSNorm(cfg.d_model, eps=cfg.rms_norm_eps)
        self.lm_head = nn.Linear(cfg.d_model, cfg.vocab_size, bias=False)
        self.dropout = nn.Dropout(cfg.dropout)

        # Weight tying
        if cfg.tie_embeddings:
            self.lm_head.weight = self.embedding.weight

        self.apply(self._init_weights)

    @staticmethod
    def _init_weights(module: nn.Module) -> None:
        if isinstance(module, nn.Linear):
            nn.init.normal_(module.weight, mean=0.0, std=0.02)
            if module.bias is not None:
                nn.init.zeros_(module.bias)
        elif isinstance(module, nn.Embedding):
            nn.init.normal_(module.weight, mean=0.0, std=0.02)

    def forward(self, ids: torch.Tensor) -> torch.Tensor:
        """Compute logits for token ids of shape (batch, seq)."""
        b, t = ids.shape
        if t > self.cfg.max_seq_len:
            raise ValueError(
                f"seq_len={t} exceeds cfg.max_seq_len={self.cfg.max_seq_len}"
            )
        x = self.embedding(ids) * math.sqrt(self.cfg.d_model)
        x = self.dropout(x)
        cos, sin = self.rope(seq_len=t)
        for block in self.blocks:
            x = block(x, cos, sin)
        x = self.final_norm(x)
        return self.lm_head(x)

    def num_parameters(self) -> int:
        return sum(p.numel() for p in self.parameters())
```

- [ ] **Step 13.4: Run tests — expect pass**

```bash
uv run pytest tests/test_model.py -v
```

Expected: 7 passed.

- [ ] **Step 13.5: Sanity-check param count with default config**

```bash
uv run python -c "from glublm.config import ModelConfig; from glublm.model import GlubLM; m = GlubLM(ModelConfig()); print(f'params: {m.num_parameters():,}')"
```

Expected: ~14-16M (e.g. `params: 15,113,920`).

- [ ] **Step 13.6: Commit**

```bash
uv run ruff check src/glublm/model.py tests/test_model.py
git add src/glublm/model.py tests/test_model.py
git commit -m "feat(core): add GlubLM transformer with weight tying

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>"
```

---

## Task 14: BPE Tokenizer wrapper

**Files:**
- Create: `src/glublm/tokenizer.py`
- Test: `tests/test_tokenizer.py`

- [ ] **Step 14.1: Write failing test**

Write to `tests/test_tokenizer.py`:
```python
"""Tests for the BPE tokenizer wrapper."""
from __future__ import annotations

from pathlib import Path

from glublm.tokenizer import GlubTokenizer


def test_tokenizer_trains_and_tokenizes(tmp_path: Path):
    corpus = [
        "hello i am a goldfish",
        "what was i saying",
        "water is warm today",
        "bubbles bubbles bubbles",
        "be a goldfish",
    ] * 20
    tok = GlubTokenizer.train(corpus, vocab_size=256)
    ids = tok.encode("hello goldfish")
    assert isinstance(ids, list)
    assert all(isinstance(i, int) for i in ids)
    assert len(ids) > 0
    decoded = tok.decode(ids)
    assert "hello" in decoded
    assert "goldfish" in decoded


def test_tokenizer_has_special_tokens(tmp_path: Path):
    corpus = ["a b c d e f g"] * 10
    tok = GlubTokenizer.train(corpus, vocab_size=128)
    assert tok.pad_id >= 0
    assert tok.bos_id >= 0
    assert tok.eos_id >= 0
    assert tok.unk_id >= 0


def test_tokenizer_save_load(tmp_path: Path):
    corpus = ["one two three four five six seven"] * 20
    tok = GlubTokenizer.train(corpus, vocab_size=128)
    path = tmp_path / "tok.json"
    tok.save(str(path))
    assert path.exists()
    loaded = GlubTokenizer.from_file(str(path))
    assert loaded.vocab_size == tok.vocab_size
    assert loaded.encode("one two") == tok.encode("one two")


def test_tokenizer_vocab_size():
    corpus = ["ab cd ef gh"] * 30
    tok = GlubTokenizer.train(corpus, vocab_size=64)
    assert tok.vocab_size <= 64
```

- [ ] **Step 14.2: Run test — expect failure**

```bash
uv run pytest tests/test_tokenizer.py -v
```

Expected: ModuleNotFoundError.

- [ ] **Step 14.3: Write `src/glublm/tokenizer.py`**

```python
"""Thin wrapper around HuggingFace `tokenizers` BPE."""
from __future__ import annotations

from collections.abc import Iterable

from tokenizers import Tokenizer
from tokenizers.models import BPE
from tokenizers.pre_tokenizers import ByteLevel
from tokenizers.processors import TemplateProcessing
from tokenizers.trainers import BpeTrainer

SPECIAL_TOKENS = ["<pad>", "<bos>", "<eos>", "<unk>"]


class GlubTokenizer:
    """BPE tokenizer used by GlubLM."""

    def __init__(self, backend: Tokenizer) -> None:
        self.backend = backend

    @classmethod
    def train(
        cls,
        corpus: Iterable[str],
        vocab_size: int = 5120,
        min_frequency: int = 2,
    ) -> GlubTokenizer:
        tok = Tokenizer(BPE(unk_token="<unk>"))
        tok.pre_tokenizer = ByteLevel(add_prefix_space=True)
        trainer = BpeTrainer(
            vocab_size=vocab_size,
            min_frequency=min_frequency,
            special_tokens=SPECIAL_TOKENS,
            show_progress=False,
        )
        tok.train_from_iterator(corpus, trainer=trainer)
        # Add BOS / EOS template
        bos_id = tok.token_to_id("<bos>")
        eos_id = tok.token_to_id("<eos>")
        tok.post_processor = TemplateProcessing(
            single="<bos> $A <eos>",
            pair=None,
            special_tokens=[("<bos>", bos_id), ("<eos>", eos_id)],
        )
        return cls(tok)

    @classmethod
    def from_file(cls, path: str) -> GlubTokenizer:
        return cls(Tokenizer.from_file(path))

    def save(self, path: str) -> None:
        self.backend.save(path)

    def encode(self, text: str, add_special_tokens: bool = True) -> list[int]:
        return self.backend.encode(text, add_special_tokens=add_special_tokens).ids

    def decode(self, ids: list[int], skip_special_tokens: bool = True) -> str:
        return self.backend.decode(ids, skip_special_tokens=skip_special_tokens)

    @property
    def vocab_size(self) -> int:
        return self.backend.get_vocab_size()

    @property
    def pad_id(self) -> int:
        return self.backend.token_to_id("<pad>")

    @property
    def bos_id(self) -> int:
        return self.backend.token_to_id("<bos>")

    @property
    def eos_id(self) -> int:
        return self.backend.token_to_id("<eos>")

    @property
    def unk_id(self) -> int:
        return self.backend.token_to_id("<unk>")
```

- [ ] **Step 14.4: Run tests — expect pass**

```bash
uv run pytest tests/test_tokenizer.py -v
```

Expected: 4 passed.

- [ ] **Step 14.5: Commit**

```bash
uv run ruff check src/glublm/tokenizer.py tests/test_tokenizer.py
git add src/glublm/tokenizer.py tests/test_tokenizer.py
git commit -m "feat(core): add BPE tokenizer wrapper

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>"
```

---

## Task 15: Dataset class + tiny fixture

**Files:**
- Create: `tests/fixtures/tiny_dataset.json`
- Create: `src/glublm/dataset.py`
- Test: `tests/test_dataset.py`

- [ ] **Step 15.1: Write tiny fixture**

Write to `tests/fixtures/tiny_dataset.json`:
```json
{
  "samples": [
    {"input": "hello", "output": "glub! hi, new friend.", "category": "greetings", "group": "goldfish_physical"},
    {"input": "what is your name", "output": "i forgot. every name is new.", "category": "name", "group": "goldfish_physical"},
    {"input": "what do you eat", "output": "flakes. orange flakes. so tasty.", "category": "food", "group": "goldfish_physical"},
    {"input": "tell me a joke", "output": "why did the fish blush? it saw the tank bottom.", "category": "bad jokes", "group": "ted_lasso_wisdom"},
    {"input": "how are you", "output": "wet. warm. happy. what was the question?", "category": "feelings", "group": "goldfish_physical"},
    {"input": "tell me about forgiveness", "output": "i forgive. i already forgot!", "category": "forgiveness", "group": "ted_lasso_wisdom"},
    {"input": "good morning", "output": "every moment is morning to me. hi!", "category": "mornings", "group": "ted_lasso_wisdom"},
    {"input": "do you see me", "output": "i see someone. they look kind.", "category": "being seen", "group": "ted_lasso_wisdom"}
  ]
}
```

- [ ] **Step 15.2: Write failing test**

Write to `tests/test_dataset.py`:
```python
"""Tests for the GlubDataset."""
from __future__ import annotations

from pathlib import Path

import torch

from glublm.dataset import GlubDataset, load_samples
from glublm.tokenizer import GlubTokenizer

FIXTURE = Path(__file__).parent / "fixtures" / "tiny_dataset.json"


def test_load_samples():
    samples = load_samples(str(FIXTURE))
    assert len(samples) == 8
    assert samples[0]["input"] == "hello"
    assert "category" in samples[0]


def test_dataset_len():
    samples = load_samples(str(FIXTURE))
    corpus = [f"{s['input']} {s['output']}" for s in samples]
    tok = GlubTokenizer.train(corpus * 10, vocab_size=256)
    ds = GlubDataset(samples, tok, max_seq_len=48)
    assert len(ds) == len(samples)


def test_dataset_item_shape():
    samples = load_samples(str(FIXTURE))
    corpus = [f"{s['input']} {s['output']}" for s in samples]
    tok = GlubTokenizer.train(corpus * 10, vocab_size=256)
    ds = GlubDataset(samples, tok, max_seq_len=48)
    ids, targets, mask = ds[0]
    assert isinstance(ids, torch.Tensor)
    assert isinstance(targets, torch.Tensor)
    assert isinstance(mask, torch.Tensor)
    assert ids.shape == (48,)
    assert targets.shape == (48,)
    assert mask.shape == (48,)
    assert ids.dtype == torch.long
    assert targets.dtype == torch.long
    assert mask.dtype == torch.bool


def test_dataset_pads_to_max_seq_len():
    samples = load_samples(str(FIXTURE))
    corpus = [f"{s['input']} {s['output']}" for s in samples]
    tok = GlubTokenizer.train(corpus * 10, vocab_size=256)
    ds = GlubDataset(samples, tok, max_seq_len=48)
    for i in range(len(ds)):
        ids, _, mask = ds[i]
        assert ids.shape[0] == 48
        # mask True where we have real tokens
        assert mask.sum() <= 48


def test_dataset_truncates_long_sequences():
    """A sample longer than max_seq_len should be truncated, not crash."""
    long_sample = [
        {
            "input": "x " * 200,
            "output": "y " * 200,
            "category": "x",
            "group": "x",
        }
    ]
    corpus = ["x " * 200, "y " * 200]
    tok = GlubTokenizer.train(corpus * 5, vocab_size=64)
    ds = GlubDataset(long_sample, tok, max_seq_len=16)
    ids, targets, _ = ds[0]
    assert ids.shape[0] == 16
    assert targets.shape[0] == 16
```

- [ ] **Step 15.3: Run test — expect failure**

```bash
uv run pytest tests/test_dataset.py -v
```

Expected: ModuleNotFoundError.

- [ ] **Step 15.4: Write `src/glublm/dataset.py`**

```python
"""PyTorch Dataset for GlubLM single-turn conversations."""
from __future__ import annotations

import json
from pathlib import Path
from typing import TypedDict

import torch
from torch.utils.data import Dataset

from glublm.tokenizer import GlubTokenizer


class Sample(TypedDict):
    input: str
    output: str
    category: str
    group: str


def load_samples(path: str) -> list[Sample]:
    data = json.loads(Path(path).read_text(encoding="utf-8"))
    return data["samples"]


class GlubDataset(Dataset):
    """Single-turn conversations encoded as `<bos> input → output <eos>`.

    Each item returns:
      - ids: tensor (max_seq_len,) of input tokens
      - targets: tensor (max_seq_len,) of next-token targets
      - mask: bool tensor (max_seq_len,) marking non-pad positions
    """

    def __init__(
        self,
        samples: list[Sample],
        tokenizer: GlubTokenizer,
        max_seq_len: int,
    ) -> None:
        self.samples = samples
        self.tok = tokenizer
        self.max_seq_len = max_seq_len

    def __len__(self) -> int:
        return len(self.samples)

    def __getitem__(self, idx: int) -> tuple[torch.Tensor, torch.Tensor, torch.Tensor]:
        s = self.samples[idx]
        text = f"{s['input']} -> {s['output']}"
        ids = self.tok.encode(text, add_special_tokens=True)

        # Truncate to max_seq_len + 1 because we need a next-token target
        if len(ids) > self.max_seq_len + 1:
            ids = ids[: self.max_seq_len + 1]

        # Pad to max_seq_len + 1
        pad = self.tok.pad_id
        needed = (self.max_seq_len + 1) - len(ids)
        if needed > 0:
            ids = ids + [pad] * needed

        ids_t = torch.tensor(ids[:-1], dtype=torch.long)
        targets_t = torch.tensor(ids[1:], dtype=torch.long)
        mask_t = (ids_t != pad) & (targets_t != pad)
        return ids_t, targets_t, mask_t
```

- [ ] **Step 15.5: Run tests — expect pass**

```bash
uv run pytest tests/test_dataset.py -v
```

Expected: 5 passed.

- [ ] **Step 15.6: Commit**

```bash
uv run ruff check src/glublm/dataset.py tests/test_dataset.py
git add src/glublm/dataset.py tests/test_dataset.py tests/fixtures/tiny_dataset.json
git commit -m "feat(core): add GlubDataset with tiny fixture

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>"
```

---

## Task 16: Training loop

**Files:**
- Create: `src/glublm/train.py`
- Test: `tests/test_train.py`

- [ ] **Step 16.1: Write failing test**

Write to `tests/test_train.py`:
```python
"""Tests for the training loop."""
from __future__ import annotations

from pathlib import Path

import torch
from torch.utils.data import DataLoader

from glublm.config import ModelConfig, TrainConfig
from glublm.dataset import GlubDataset, load_samples
from glublm.model import GlubLM
from glublm.tokenizer import GlubTokenizer
from glublm.train import cosine_schedule, train_one_epoch

FIXTURE = Path(__file__).parent / "fixtures" / "tiny_dataset.json"


def test_cosine_schedule_warmup():
    # First step (step=0) -> near 0
    lr = cosine_schedule(step=0, total_steps=100, warmup_steps=10, base_lr=1e-3, min_lr=0.0)
    assert lr < 1e-4
    # Peak right at end of warmup
    lr = cosine_schedule(step=10, total_steps=100, warmup_steps=10, base_lr=1e-3, min_lr=0.0)
    torch.testing.assert_close(torch.tensor(lr), torch.tensor(1e-3), atol=1e-9, rtol=1e-9)
    # End -> near min
    lr = cosine_schedule(step=100, total_steps=100, warmup_steps=10, base_lr=1e-3, min_lr=0.0)
    assert lr < 1e-5


def test_train_one_epoch_reduces_loss():
    """Smoke test: training for one epoch on the tiny fixture should reduce loss."""
    samples = load_samples(str(FIXTURE))
    corpus = [f"{s['input']} {s['output']}" for s in samples]
    tok = GlubTokenizer.train(corpus * 30, vocab_size=256)
    mcfg = ModelConfig(
        vocab_size=tok.vocab_size,
        d_model=64,
        n_layers=2,
        n_heads=4,
        ffn_hidden=128,
        max_seq_len=48,
        dropout=0.0,
    )
    tcfg = TrainConfig(lr=3e-3, batch_size=4, epochs=1, dtype="float32")
    ds = GlubDataset(samples, tok, max_seq_len=48)
    loader = DataLoader(ds, batch_size=tcfg.batch_size, shuffle=True)
    model = GlubLM(mcfg)
    optim = torch.optim.AdamW(model.parameters(), lr=tcfg.lr)

    losses = []
    for _ in range(5):  # 5 epochs on tiny data
        _, epoch_losses = train_one_epoch(
            model,
            loader,
            optim,
            step=0,
            total_steps=5 * len(loader),
            warmup_steps=1,
            base_lr=tcfg.lr,
            grad_clip=1.0,
            device=torch.device("cpu"),
            dtype=torch.float32,
            pad_id=tok.pad_id,
        )
        losses.extend(epoch_losses)

    assert losses[-1] < losses[0], f"loss did not drop: start={losses[0]:.3f} end={losses[-1]:.3f}"
```

- [ ] **Step 16.2: Run test — expect failure**

```bash
uv run pytest tests/test_train.py -v
```

Expected: ModuleNotFoundError.

- [ ] **Step 16.3: Write `src/glublm/train.py`**

```python
"""GlubLM training loop utilities."""
from __future__ import annotations

import math
from pathlib import Path

import torch
import torch.nn.functional as F
from torch import nn
from torch.utils.data import DataLoader


def cosine_schedule(
    step: int,
    total_steps: int,
    warmup_steps: int,
    base_lr: float,
    min_lr: float = 0.0,
) -> float:
    """Linear warmup + cosine decay to `min_lr`."""
    if step < warmup_steps:
        return base_lr * (step + 1) / max(warmup_steps, 1)
    if step >= total_steps:
        return min_lr
    progress = (step - warmup_steps) / max(total_steps - warmup_steps, 1)
    return min_lr + 0.5 * (base_lr - min_lr) * (1.0 + math.cos(math.pi * progress))


def train_one_epoch(
    model: nn.Module,
    loader: DataLoader,
    optim: torch.optim.Optimizer,
    step: int,
    total_steps: int,
    warmup_steps: int,
    base_lr: float,
    grad_clip: float,
    device: torch.device,
    dtype: torch.dtype,
    pad_id: int,
) -> tuple[int, list[float]]:
    """Run one epoch of training. Returns (next_step, list_of_batch_losses)."""
    model.train()
    losses: list[float] = []
    for ids, targets, _ in loader:
        ids = ids.to(device)
        targets = targets.to(device)

        # Set LR per step
        lr = cosine_schedule(step, total_steps, warmup_steps, base_lr)
        for pg in optim.param_groups:
            pg["lr"] = lr

        with torch.autocast(device_type=device.type, dtype=dtype, enabled=(dtype != torch.float32)):
            logits = model(ids)
            loss = F.cross_entropy(
                logits.reshape(-1, logits.size(-1)),
                targets.reshape(-1),
                ignore_index=pad_id,
            )

        optim.zero_grad(set_to_none=True)
        loss.backward()
        torch.nn.utils.clip_grad_norm_(model.parameters(), grad_clip)
        optim.step()

        losses.append(loss.item())
        step += 1
    return step, losses


def save_checkpoint(
    path: str | Path,
    model: nn.Module,
    optim: torch.optim.Optimizer,
    step: int,
    epoch: int,
) -> None:
    Path(path).parent.mkdir(parents=True, exist_ok=True)
    torch.save(
        {
            "model": model.state_dict(),
            "optim": optim.state_dict(),
            "step": step,
            "epoch": epoch,
        },
        path,
    )


def load_checkpoint(
    path: str | Path,
    model: nn.Module,
    optim: torch.optim.Optimizer | None = None,
) -> tuple[int, int]:
    ckpt = torch.load(path, map_location="cpu", weights_only=True)
    model.load_state_dict(ckpt["model"])
    if optim is not None:
        optim.load_state_dict(ckpt["optim"])
    return ckpt["step"], ckpt["epoch"]
```

- [ ] **Step 16.4: Run tests — expect pass**

```bash
uv run pytest tests/test_train.py -v
```

Expected: 2 passed.

- [ ] **Step 16.5: Commit**

```bash
uv run ruff check src/glublm/train.py tests/test_train.py
git add src/glublm/train.py tests/test_train.py
git commit -m "feat(core): add training loop with cosine schedule + checkpointing

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>"
```

---

## Task 17: Inference — sampling and chat

**Files:**
- Create: `src/glublm/inference.py`
- Test: `tests/test_inference.py`

- [ ] **Step 17.1: Write failing test**

Write to `tests/test_inference.py`:
```python
"""Tests for inference sampling and chat."""
from __future__ import annotations

from pathlib import Path

import torch

from glublm.config import ModelConfig
from glublm.dataset import load_samples
from glublm.inference import generate, top_k_top_p_sample
from glublm.model import GlubLM
from glublm.tokenizer import GlubTokenizer

FIXTURE = Path(__file__).parent / "fixtures" / "tiny_dataset.json"


def test_top_k_top_p_sample_picks_valid_token():
    logits = torch.tensor([0.1, 0.2, 5.0, 0.3, 0.4])
    out = top_k_top_p_sample(logits, temperature=1.0, top_k=2, top_p=1.0)
    assert 0 <= out.item() < 5
    # With very high temperature the distribution flattens
    out2 = top_k_top_p_sample(logits, temperature=100.0, top_k=5, top_p=1.0)
    assert 0 <= out2.item() < 5


def test_top_k_top_p_greedy_at_temp_zero():
    logits = torch.tensor([0.1, 0.2, 5.0, 0.3, 0.4])
    out = top_k_top_p_sample(logits, temperature=0.0, top_k=0, top_p=1.0)
    assert out.item() == 2


def test_generate_returns_text():
    samples = load_samples(str(FIXTURE))
    corpus = [f"{s['input']} {s['output']}" for s in samples]
    tok = GlubTokenizer.train(corpus * 30, vocab_size=256)
    cfg = ModelConfig(
        vocab_size=tok.vocab_size,
        d_model=32,
        n_layers=2,
        n_heads=4,
        ffn_hidden=64,
        max_seq_len=48,
        dropout=0.0,
    )
    model = GlubLM(cfg).eval()
    out = generate(
        model=model,
        tokenizer=tok,
        prompt="hello",
        max_new_tokens=8,
        temperature=1.0,
        top_k=20,
        top_p=0.9,
        device=torch.device("cpu"),
    )
    assert isinstance(out, str)
    assert len(out) > 0


def test_generate_respects_max_new_tokens():
    samples = load_samples(str(FIXTURE))
    corpus = [f"{s['input']} {s['output']}" for s in samples]
    tok = GlubTokenizer.train(corpus * 30, vocab_size=256)
    cfg = ModelConfig(
        vocab_size=tok.vocab_size,
        d_model=32,
        n_layers=1,
        n_heads=2,
        ffn_hidden=64,
        max_seq_len=48,
        dropout=0.0,
    )
    model = GlubLM(cfg).eval()
    out_ids = generate(
        model=model,
        tokenizer=tok,
        prompt="a",
        max_new_tokens=3,
        temperature=1.0,
        top_k=5,
        top_p=1.0,
        device=torch.device("cpu"),
        return_ids=True,
    )
    assert isinstance(out_ids, list)
    # at most 3 new tokens beyond the prompt
    prompt_len = len(tok.encode("a"))
    assert len(out_ids) <= prompt_len + 3
```

- [ ] **Step 17.2: Run test — expect failure**

```bash
uv run pytest tests/test_inference.py -v
```

Expected: ModuleNotFoundError.

- [ ] **Step 17.3: Write `src/glublm/inference.py`**

```python
"""Inference and chat utilities for GlubLM."""
from __future__ import annotations

import torch
import torch.nn.functional as F

from glublm.model import GlubLM
from glublm.tokenizer import GlubTokenizer


def top_k_top_p_sample(
    logits: torch.Tensor,
    temperature: float,
    top_k: int,
    top_p: float,
) -> torch.Tensor:
    """Return a single sampled token id from `logits` of shape (vocab,).

    - temperature=0 → greedy argmax
    - top_k=0 disables top-k filtering
    - top_p=1.0 disables nucleus filtering
    """
    if temperature <= 0:
        return logits.argmax(dim=-1, keepdim=True).squeeze(-1)

    logits = logits.clone() / temperature

    if top_k > 0:
        top_k = min(top_k, logits.size(-1))
        kth_value = torch.topk(logits, top_k).values[-1]
        logits[logits < kth_value] = float("-inf")

    if 0.0 < top_p < 1.0:
        sorted_logits, sorted_idx = torch.sort(logits, descending=True)
        probs = F.softmax(sorted_logits, dim=-1)
        cumprobs = torch.cumsum(probs, dim=-1)
        keep = cumprobs <= top_p
        # always keep the first token
        keep[..., 0] = True
        sorted_logits[~keep] = float("-inf")
        logits = torch.full_like(logits, float("-inf"))
        logits.scatter_(-1, sorted_idx, sorted_logits)

    probs = F.softmax(logits, dim=-1)
    return torch.multinomial(probs, num_samples=1).squeeze(-1)


@torch.no_grad()
def generate(
    model: GlubLM,
    tokenizer: GlubTokenizer,
    prompt: str,
    max_new_tokens: int = 32,
    temperature: float = 0.8,
    top_k: int = 40,
    top_p: float = 0.9,
    device: torch.device | None = None,
    return_ids: bool = False,
) -> str | list[int]:
    """Generate a continuation from the model."""
    device = device or next(model.parameters()).device
    model.eval()

    ids = tokenizer.encode(prompt + " ->", add_special_tokens=True)
    ids_t = torch.tensor(ids, dtype=torch.long, device=device).unsqueeze(0)

    eos = tokenizer.eos_id
    pad = tokenizer.pad_id
    max_ctx = model.cfg.max_seq_len

    for _ in range(max_new_tokens):
        # Hard truncation to the physical 10-second memory window
        ctx = ids_t[:, -max_ctx:]
        logits = model(ctx)[:, -1, :]  # (1, vocab)
        next_id = top_k_top_p_sample(logits.squeeze(0), temperature, top_k, top_p)
        ids_t = torch.cat([ids_t, next_id.view(1, 1)], dim=1)
        if next_id.item() == eos or next_id.item() == pad:
            break

    out_ids = ids_t.squeeze(0).tolist()
    if return_ids:
        return out_ids
    return tokenizer.decode(out_ids, skip_special_tokens=True)
```

- [ ] **Step 17.4: Run tests — expect pass**

```bash
uv run pytest tests/test_inference.py -v
```

Expected: 4 passed.

- [ ] **Step 17.5: Commit**

```bash
uv run ruff check src/glublm/inference.py tests/test_inference.py
git add src/glublm/inference.py tests/test_inference.py
git commit -m "feat(core): add sampling + generation with hard context truncation

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>"
```

---

## Task 18: CLI with Click

**Files:**
- Create: `src/glublm/cli.py`
- Test: `tests/test_cli.py`

- [ ] **Step 18.1: Write failing test**

Write to `tests/test_cli.py`:
```python
"""Tests for the glublm CLI."""
from __future__ import annotations

from click.testing import CliRunner

from glublm.cli import main


def test_cli_help():
    runner = CliRunner()
    result = runner.invoke(main, ["--help"])
    assert result.exit_code == 0
    assert "GlubLM" in result.output or "glublm" in result.output


def test_cli_version():
    runner = CliRunner()
    result = runner.invoke(main, ["--version"])
    assert result.exit_code == 0
    assert "0.1.0" in result.output


def test_cli_has_train_command():
    runner = CliRunner()
    result = runner.invoke(main, ["train", "--help"])
    assert result.exit_code == 0


def test_cli_has_chat_command():
    runner = CliRunner()
    result = runner.invoke(main, ["chat", "--help"])
    assert result.exit_code == 0
```

- [ ] **Step 18.2: Run test — expect failure**

```bash
uv run pytest tests/test_cli.py -v
```

Expected: ModuleNotFoundError.

- [ ] **Step 18.3: Write `src/glublm/cli.py`**

```python
"""GlubLM command-line interface."""
from __future__ import annotations

from pathlib import Path

import click
import torch

from glublm import __version__
from glublm.config import ModelConfig, TrainConfig
from glublm.dataset import GlubDataset, load_samples
from glublm.inference import generate
from glublm.model import GlubLM
from glublm.tokenizer import GlubTokenizer


@click.group(help="GlubLM — the language model that already forgot this sentence.")
@click.version_option(__version__, prog_name="glublm")
def main() -> None:
    pass


@main.command(help="Chat with a trained GlubLM checkpoint.")
@click.option("--ckpt", type=click.Path(exists=True, dir_okay=False), required=True)
@click.option("--tokenizer", "tok_path", type=click.Path(exists=True, dir_okay=False), required=True)
@click.option("--prompt", type=str, default=None, help="Single-shot prompt (no interactive loop)")
@click.option("--max-new-tokens", type=int, default=32)
@click.option("--temperature", type=float, default=0.8)
@click.option("--top-k", type=int, default=40)
@click.option("--top-p", type=float, default=0.9)
def chat(
    ckpt: str,
    tok_path: str,
    prompt: str | None,
    max_new_tokens: int,
    temperature: float,
    top_k: int,
    top_p: float,
) -> None:
    device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
    tok = GlubTokenizer.from_file(tok_path)
    cfg = ModelConfig(vocab_size=tok.vocab_size)
    model = GlubLM(cfg).to(device)
    state = torch.load(ckpt, map_location=device, weights_only=True)
    model.load_state_dict(state["model"] if "model" in state else state)
    model.eval()

    def _reply(text: str) -> str:
        return generate(
            model=model,
            tokenizer=tok,
            prompt=text,
            max_new_tokens=max_new_tokens,
            temperature=temperature,
            top_k=top_k,
            top_p=top_p,
            device=device,
        )

    if prompt is not None:
        click.echo(_reply(prompt))
        return

    click.echo("glub! ask me anything. (ctrl-c to quit)")
    while True:
        try:
            user = click.prompt("you", type=str)
        except click.exceptions.Abort:
            click.echo("\nglub bye!")
            return
        click.echo(f"glub: {_reply(user)}")


@main.command(help="Train GlubLM on a dataset JSON file.")
@click.option("--data", type=click.Path(exists=True, dir_okay=False), required=True)
@click.option("--out", type=click.Path(), default="checkpoints/glublm.pt")
@click.option("--tokenizer-out", type=click.Path(), default="checkpoints/tokenizer.json")
@click.option("--epochs", type=int, default=4)
@click.option("--batch-size", type=int, default=64)
@click.option("--lr", type=float, default=3e-4)
def train(
    data: str,
    out: str,
    tokenizer_out: str,
    epochs: int,
    batch_size: int,
    lr: float,
) -> None:
    from torch.utils.data import DataLoader

    from glublm.train import cosine_schedule, save_checkpoint, train_one_epoch

    samples = load_samples(data)
    corpus = [f"{s['input']} {s['output']}" for s in samples]

    click.echo(f"training tokenizer on {len(corpus)} samples ...")
    tok = GlubTokenizer.train(corpus, vocab_size=5120)
    Path(tokenizer_out).parent.mkdir(parents=True, exist_ok=True)
    tok.save(tokenizer_out)
    click.echo(f"saved tokenizer → {tokenizer_out}")

    mcfg = ModelConfig(vocab_size=tok.vocab_size)
    tcfg = TrainConfig(lr=lr, batch_size=batch_size, epochs=epochs)
    device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
    dtype = torch.bfloat16 if device.type == "cuda" else torch.float32

    ds = GlubDataset(samples, tok, max_seq_len=mcfg.max_seq_len)
    loader = DataLoader(ds, batch_size=tcfg.batch_size, shuffle=True, drop_last=True)
    model = GlubLM(mcfg).to(device)
    optim = torch.optim.AdamW(
        model.parameters(),
        lr=tcfg.lr,
        betas=(tcfg.beta1, tcfg.beta2),
        weight_decay=tcfg.weight_decay,
    )

    total_steps = epochs * len(loader)
    warmup_steps = max(int(total_steps * tcfg.warmup_ratio), 1)
    click.echo(
        f"training {model.num_parameters():,} params for "
        f"{epochs} epochs × {len(loader)} batches = {total_steps} steps on {device}"
    )

    step = 0
    for epoch in range(epochs):
        step, losses = train_one_epoch(
            model=model,
            loader=loader,
            optim=optim,
            step=step,
            total_steps=total_steps,
            warmup_steps=warmup_steps,
            base_lr=tcfg.lr,
            grad_clip=tcfg.grad_clip,
            device=device,
            dtype=dtype,
            pad_id=tok.pad_id,
        )
        click.echo(f"  epoch {epoch + 1}/{epochs} — final batch loss {losses[-1]:.4f}")

    save_checkpoint(out, model, optim, step=step, epoch=epochs)
    click.echo(f"saved checkpoint → {out}")


if __name__ == "__main__":
    main()
```

- [ ] **Step 18.4: Run tests — expect pass**

```bash
uv run pytest tests/test_cli.py -v
```

Expected: 4 passed.

- [ ] **Step 18.5: Verify CLI is wired via pyproject entry point**

```bash
uv run glublm --version
```

Expected: `glublm, version 0.1.0`

- [ ] **Step 18.6: Commit**

```bash
uv run ruff check src/glublm/cli.py tests/test_cli.py
git add src/glublm/cli.py tests/test_cli.py
git commit -m "feat(core): add Click CLI with chat and train commands

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>"
```

---

## Task 19: End-to-end smoke test on fixture

**Files:**
- Create: `tests/test_end_to_end.py`

- [ ] **Step 19.1: Write the smoke test**

Write to `tests/test_end_to_end.py`:
```python
"""End-to-end smoke test: train tiny model on fixture, then chat."""
from __future__ import annotations

from pathlib import Path

import torch
from click.testing import CliRunner

from glublm.cli import main

FIXTURE = Path(__file__).parent / "fixtures" / "tiny_dataset.json"


def test_end_to_end_train_and_chat(tmp_path: Path):
    """Train for a few epochs on the fixture, then run a single-shot chat."""
    runner = CliRunner()
    ckpt = tmp_path / "ckpt.pt"
    tok_path = tmp_path / "tok.json"

    # Use a minuscule config via env-less path: we rely on default cfg for vocab
    # but override epochs/batch via CLI. The fixture is tiny so 3 epochs is fine.
    result = runner.invoke(
        main,
        [
            "train",
            "--data", str(FIXTURE),
            "--out", str(ckpt),
            "--tokenizer-out", str(tok_path),
            "--epochs", "3",
            "--batch-size", "4",
            "--lr", "3e-3",
        ],
    )
    assert result.exit_code == 0, result.output
    assert ckpt.exists()
    assert tok_path.exists()

    # Single-shot chat
    result = runner.invoke(
        main,
        [
            "chat",
            "--ckpt", str(ckpt),
            "--tokenizer", str(tok_path),
            "--prompt", "hello",
            "--max-new-tokens", "8",
        ],
    )
    assert result.exit_code == 0, result.output
    assert len(result.output.strip()) > 0


def test_end_to_end_checkpoint_loads(tmp_path: Path):
    """Verify the saved checkpoint is torch-loadable and has the right keys."""
    runner = CliRunner()
    ckpt = tmp_path / "ckpt.pt"
    tok_path = tmp_path / "tok.json"
    result = runner.invoke(
        main,
        [
            "train",
            "--data", str(FIXTURE),
            "--out", str(ckpt),
            "--tokenizer-out", str(tok_path),
            "--epochs", "1",
            "--batch-size", "4",
            "--lr", "3e-3",
        ],
    )
    assert result.exit_code == 0
    state = torch.load(ckpt, map_location="cpu", weights_only=True)
    assert "model" in state
    assert "optim" in state
    assert "step" in state
    assert "epoch" in state
    assert state["epoch"] == 1
```

- [ ] **Step 19.2: Run the full test suite**

```bash
uv run pytest tests/ -v
```

Expected: all tests pass, ~40 tests collected.

- [ ] **Step 19.3: Run ruff on the entire src/ + tests/**

```bash
uv run ruff check src/ tests/
```

Expected: `All checks passed!`

- [ ] **Step 19.4: Commit**

```bash
git add tests/test_end_to_end.py
git commit -m "test(core): add end-to-end smoke test

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>"
```

- [ ] **Step 19.5: Tag Phase 1 complete**

```bash
git tag -a v0.1.0-core -m "Phase 1: core model, training, inference, CLI complete"
git log --oneline
```

Expected: see all Phase 1 commits and a new `v0.1.0-core` tag.

---

## Phase 1 Done — Exit Criteria

At this point you should be able to:

1. ✅ Run `uv run pytest tests/ -v` — all tests green
2. ✅ Run `uv run ruff check src/ tests/` — lint clean
3. ✅ Train a real model on the fixture in under a minute: `uv run glublm train --data tests/fixtures/tiny_dataset.json --epochs 3 --batch-size 4 --lr 3e-3`
4. ✅ Chat with it: `uv run glublm chat --ckpt checkpoints/glublm.pt --tokenizer checkpoints/tokenizer.json --prompt "hello"`
5. ✅ GitHub Actions CI passes (if the repo is pushed)
6. ✅ `v0.1.0-core` git tag exists
7. ✅ Default `ModelConfig()` instantiates a ~15M parameter model

**Next:** Proceed to Phase 2 — [`2026-04-09-glublm-phase-2-datagen.md`](2026-04-09-glublm-phase-2-datagen.md) — to generate the real 30K dataset. After that dataset is ready, re-run `glublm train --data data/glublm_30k.json --epochs 4 --batch-size 64 --lr 3e-4` on the RTX 3060 to produce the production checkpoint, which feeds Phase 3.

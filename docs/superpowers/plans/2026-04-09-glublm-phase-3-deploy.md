# GlubLM Phase 3 — Deployment Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship GlubLM to the world. Export the trained checkpoint to quantized ONNX, build a standalone browser demo, publish the model and dataset to HuggingFace Hub, deploy a Gradio Space, release the Python package on PyPI, and write the empirical comparison document versus GuppyLM.

**Architecture:** ONNX Runtime Web for browser inference (~18 MB uint8 model + tokenizer.json), Gradio Space for HF demo, hatchling build system for PyPI, GitHub Actions for automatic deploy.

**Tech Stack:** onnx, onnxruntime, onnxruntime-web, huggingface-hub, safetensors, gradio, hatchling, GitHub Actions, GitHub Pages.

**Spec reference:** [`../specs/2026-04-09-glublm-design.md`](../specs/2026-04-09-glublm-design.md) section 7

**Prerequisites:**
- Phase 1 complete: model + training + inference + CLI
- Phase 2 complete: `data/glublm_30k.json` + `checkpoints/glublm_15m.pt` + `checkpoints/tokenizer.json`
- `HF_TOKEN` in `.env`

---

## File Structure (created in this phase)

```
L:/Dennis/Projects/glublm/
├── tools/
│   ├── export_onnx.py                  # Task 1
│   ├── export_hf.py                    # Task 10
│   ├── benchmark.py                    # Task 18
│   └── ...
├── web/
│   ├── index.html                      # Task 4
│   ├── style.css                       # Task 5
│   ├── glub.js                         # Task 6
│   ├── model.onnx                      # Task 1 output (copied)
│   ├── tokenizer.json                  # Task 1 output (copied)
│   └── assets/
│       └── logo.svg                    # Task 7
├── space/
│   ├── app.py                          # Task 14
│   ├── requirements.txt                # Task 15
│   └── README.md                       # Task 15
├── docs/
│   ├── ARCHITECTURE.md                 # Task 19
│   ├── DATASET.md                      # Task 19
│   ├── TRAINING.md                     # Task 19
│   └── COMPARISONS.md                  # Task 18
├── .github/workflows/
│   ├── deploy-pages.yml                # Task 8
│   └── release.yml                     # Task 16
└── hf/
    ├── model_card.md                   # Task 9
    └── dataset_card.md                 # Task 11
```

---

## Task 1: ONNX export script

**Files:**
- Create: `tools/export_onnx.py`
- Test: `tests/test_export_onnx.py`

- [ ] **Step 1.1: Install deploy extras**

```bash
cd "L:/Dennis/Projects/glublm"
uv sync --extra deploy
uv run python -c "import onnx, onnxruntime; print(onnx.__version__, onnxruntime.__version__)"
```

- [ ] **Step 1.2: Write failing test**

Write to `tests/test_export_onnx.py`:
```python
"""Tests for ONNX export."""
from __future__ import annotations

from pathlib import Path

import torch

from glublm.config import ModelConfig
from glublm.model import GlubLM
from tools.export_onnx import export_to_onnx, verify_onnx


def test_export_roundtrip(tmp_path: Path):
    cfg = ModelConfig(vocab_size=64, d_model=32, n_layers=1, n_heads=2, ffn_hidden=64, max_seq_len=16)
    model = GlubLM(cfg).eval()
    out = tmp_path / "tiny.onnx"
    export_to_onnx(model=model, out_path=str(out), max_seq_len=cfg.max_seq_len)
    assert out.exists()

    ids = torch.randint(0, cfg.vocab_size, (1, 8))
    ok, max_diff = verify_onnx(model, str(out), ids)
    assert ok, f"ONNX export mismatch: max diff = {max_diff}"
```

- [ ] **Step 1.3: Run test — expect failure**

- [ ] **Step 1.4: Write `tools/export_onnx.py`**

```python
"""Export a trained GlubLM checkpoint to ONNX and verify numerical equivalence."""
from __future__ import annotations

import argparse
from pathlib import Path

import torch

from glublm.config import ModelConfig
from glublm.model import GlubLM
from glublm.tokenizer import GlubTokenizer


def export_to_onnx(
    *,
    model: GlubLM,
    out_path: str,
    max_seq_len: int,
    opset: int = 17,
) -> None:
    """Trace and export the model to ONNX with dynamic sequence length."""
    model.eval()
    dummy_ids = torch.randint(0, model.cfg.vocab_size, (1, max_seq_len), dtype=torch.long)
    Path(out_path).parent.mkdir(parents=True, exist_ok=True)

    torch.onnx.export(
        model,
        (dummy_ids,),
        out_path,
        input_names=["input_ids"],
        output_names=["logits"],
        dynamic_axes={
            "input_ids": {0: "batch", 1: "seq"},
            "logits": {0: "batch", 1: "seq"},
        },
        opset_version=opset,
        do_constant_folding=True,
    )


def verify_onnx(
    model: GlubLM,
    onnx_path: str,
    sample_ids: torch.Tensor,
    atol: float = 1e-3,
) -> tuple[bool, float]:
    """Run the PyTorch model and the ONNX model on the same input and compare logits."""
    import numpy as np
    import onnxruntime as ort

    model.eval()
    with torch.no_grad():
        torch_logits = model(sample_ids).cpu().numpy()

    sess = ort.InferenceSession(onnx_path, providers=["CPUExecutionProvider"])
    onnx_logits = sess.run(None, {"input_ids": sample_ids.cpu().numpy()})[0]

    max_diff = float(np.abs(torch_logits - onnx_logits).max())
    return (max_diff < atol), max_diff


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--ckpt", required=True)
    ap.add_argument("--tokenizer", required=True)
    ap.add_argument("--out", required=True)
    args = ap.parse_args()

    tok = GlubTokenizer.from_file(args.tokenizer)
    cfg = ModelConfig(vocab_size=tok.vocab_size)
    model = GlubLM(cfg)
    state = torch.load(args.ckpt, map_location="cpu", weights_only=True)
    model.load_state_dict(state["model"])

    export_to_onnx(model=model, out_path=args.out, max_seq_len=cfg.max_seq_len)
    ids = torch.randint(0, tok.vocab_size, (1, cfg.max_seq_len))
    ok, max_diff = verify_onnx(model, args.out, ids)
    print(f"exported → {args.out} | numerical ok={ok} | max diff={max_diff:.6f}")


if __name__ == "__main__":
    main()
```

- [ ] **Step 1.5: Run tests — expect pass**

```bash
uv run pytest tests/test_export_onnx.py -v
```

- [ ] **Step 1.6: Export the real checkpoint**

```bash
uv run python tools/export_onnx.py \
  --ckpt checkpoints/glublm_15m.pt \
  --tokenizer checkpoints/tokenizer.json \
  --out checkpoints/glublm_15m.onnx
```

Expected: `numerical ok=True`, max diff around 1e-5 to 1e-4.

- [ ] **Step 1.7: Commit**

```bash
uv run ruff check tools/export_onnx.py tests/test_export_onnx.py
git add tools/export_onnx.py tests/test_export_onnx.py
git commit -m "feat(deploy): add ONNX export with numerical verification

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>"
```

---

## Task 2: ONNX uint8 quantization

**Files:**
- Create: `tools/quantize_onnx.py`

- [ ] **Step 2.1: Write `tools/quantize_onnx.py`**

```python
"""Quantize an ONNX model to uint8 for browser deployment."""
from __future__ import annotations

import argparse
from pathlib import Path

from onnxruntime.quantization import QuantType, quantize_dynamic


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--in", dest="inp", required=True)
    ap.add_argument("--out", required=True)
    args = ap.parse_args()

    Path(args.out).parent.mkdir(parents=True, exist_ok=True)
    quantize_dynamic(
        model_input=args.inp,
        model_output=args.out,
        weight_type=QuantType.QUInt8,
    )
    size_mb = Path(args.out).stat().st_size / 1e6
    print(f"quantized → {args.out} ({size_mb:.2f} MB)")


if __name__ == "__main__":
    main()
```

- [ ] **Step 2.2: Run quantization**

```bash
uv run python tools/quantize_onnx.py \
  --in checkpoints/glublm_15m.onnx \
  --out web/model.onnx
```

Expected: file size around 15-20 MB.

- [ ] **Step 2.3: Copy tokenizer.json to web/**

```bash
cp checkpoints/tokenizer.json web/tokenizer.json
```

- [ ] **Step 2.4: Commit the script (NOT the weights)**

```bash
uv run ruff check tools/quantize_onnx.py
git add tools/quantize_onnx.py
git commit -m "feat(deploy): add ONNX uint8 quantization tool

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>"
```

The quantized model is gitignored until Task 8 when we commit it specifically for GitHub Pages.

---

## Task 3: Verify quantized model generates text

**Files:**
- Create: `tools/test_onnx_inference.py`

- [ ] **Step 3.1: Write `tools/test_onnx_inference.py`**

```python
"""Quick sanity check that the quantized ONNX model can generate text."""
from __future__ import annotations

import argparse

import numpy as np
import onnxruntime as ort

from glublm.tokenizer import GlubTokenizer


def sample(logits: np.ndarray, temperature: float = 0.8, top_k: int = 40) -> int:
    logits = logits / temperature
    top_idx = np.argsort(logits)[-top_k:]
    top_logits = logits[top_idx]
    probs = np.exp(top_logits - top_logits.max())
    probs = probs / probs.sum()
    choice = np.random.choice(top_idx, p=probs)
    return int(choice)


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--onnx", required=True)
    ap.add_argument("--tokenizer", required=True)
    ap.add_argument("--prompt", default="hello")
    ap.add_argument("--max-new-tokens", type=int, default=24)
    ap.add_argument("--max-ctx", type=int, default=48)
    args = ap.parse_args()

    tok = GlubTokenizer.from_file(args.tokenizer)
    sess = ort.InferenceSession(args.onnx, providers=["CPUExecutionProvider"])

    ids = tok.encode(args.prompt + " ->")
    for _ in range(args.max_new_tokens):
        ctx = np.array([ids[-args.max_ctx:]], dtype=np.int64)
        logits = sess.run(None, {"input_ids": ctx})[0][0, -1]
        next_id = sample(logits)
        ids.append(next_id)
        if next_id == tok.eos_id or next_id == tok.pad_id:
            break
    print(tok.decode(ids, skip_special_tokens=True))


if __name__ == "__main__":
    main()
```

- [ ] **Step 3.2: Run it**

```bash
uv run python tools/test_onnx_inference.py \
  --onnx web/model.onnx \
  --tokenizer web/tokenizer.json \
  --prompt "hello"
```

Expected: short goldfish-persona text output (similar in style to the PyTorch inference).

- [ ] **Step 3.3: Commit**

```bash
uv run ruff check tools/test_onnx_inference.py
git add tools/test_onnx_inference.py
git commit -m "feat(deploy): add ONNX sanity-check inference script

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>"
```

---

## Task 4: Browser demo — index.html

**Files:**
- Create: `web/index.html`

- [ ] **Step 4.1: Write `web/index.html`**

```html
<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>GlubLM 🐠 — the language model that already forgot this sentence</title>
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <meta name="description" content="A 15M-parameter goldfish language model with a 10-second memory. Runs 100% in your browser." />
  <link rel="stylesheet" href="style.css" />
  <!-- ONNX Runtime Web -->
  <script src="https://cdn.jsdelivr.net/npm/onnxruntime-web@1.19.2/dist/ort.min.js"></script>
</head>
<body>
  <header>
    <img src="assets/logo.svg" alt="GlubLM goldfish logo" class="logo" />
    <h1>GlubLM</h1>
    <p class="tagline">the language model that already forgot this sentence</p>
  </header>

  <main>
    <div id="status">loading model... (~18 MB)</div>

    <div id="chat">
      <div id="output" aria-live="polite"></div>
      <form id="form">
        <input id="prompt" type="text" placeholder="say something to the goldfish..." autocomplete="off" disabled />
        <button id="send" type="submit" disabled>send</button>
      </form>
    </div>

    <details class="about">
      <summary>about</summary>
      <p>
        <strong>GlubLM</strong> is a 15-million-parameter transformer that pretends to be a goldfish.
        It has a hard 48-token context window, so it literally forgets everything after a sentence or two.
        The model runs 100% in your browser via ONNX Runtime Web — no server, no data leaves your device.
      </p>
      <p>
        Inspired by <a href="https://github.com/arman-bd/guppylm">GuppyLM</a> and Ted Lasso's "be a goldfish" philosophy.
        Code and training dataset are on <a href="https://github.com/Den-Sec/glublm">GitHub</a>.
      </p>
    </details>
  </main>

  <footer>
    <small>
      Made by <a href="https://github.com/Den-Sec">Den-Sec</a>. AGPL-3.0.
      <a href="https://huggingface.co/Den-Sec/glublm-15m">HuggingFace</a>
      <a href="https://huggingface.co/datasets/Den-Sec/glublm-30k-ted">dataset</a>
      <a href="https://github.com/Den-Sec/glublm">source</a>
    </small>
  </footer>

  <script type="module" src="glub.js"></script>
</body>
</html>
```

- [ ] **Step 4.2: Commit**

```bash
git add web/index.html
git commit -m "feat(deploy): add browser demo HTML

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>"
```

---

## Task 5: Browser demo — style.css

**Files:**
- Create: `web/style.css`

- [ ] **Step 5.1: Write `web/style.css`**

```css
:root {
  --bg: #f7fcff;
  --bowl: #e5f4ff;
  --fg: #1a2b3c;
  --accent: #ff8b3d;
  --accent-dark: #e06b1d;
  --muted: #6a7b8c;
  --card: #ffffff;
  --radius: 16px;
  --shadow: 0 4px 20px rgba(30, 60, 90, 0.08);
}

* { box-sizing: border-box; }

body {
  margin: 0;
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
  background: linear-gradient(180deg, var(--bg) 0%, var(--bowl) 100%);
  color: var(--fg);
  min-height: 100vh;
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 20px;
}

header {
  text-align: center;
  margin-bottom: 30px;
}

.logo {
  width: 80px;
  height: 80px;
  display: block;
  margin: 0 auto 8px;
}

h1 {
  margin: 0;
  font-size: 2.2rem;
  letter-spacing: -0.02em;
  color: var(--accent);
}

.tagline {
  margin: 4px 0 0;
  color: var(--muted);
  font-style: italic;
  font-size: 0.95rem;
}

main {
  width: 100%;
  max-width: 640px;
  background: var(--card);
  border-radius: var(--radius);
  box-shadow: var(--shadow);
  padding: 24px;
}

#status {
  text-align: center;
  color: var(--muted);
  padding: 10px;
  margin-bottom: 16px;
  font-size: 0.9rem;
}

#status.ready {
  color: var(--accent-dark);
  font-weight: 600;
}

#output {
  min-height: 200px;
  max-height: 400px;
  overflow-y: auto;
  padding: 12px;
  background: #f0f8ff;
  border-radius: 12px;
  margin-bottom: 16px;
  font-size: 0.95rem;
  line-height: 1.5;
}

.msg {
  margin-bottom: 12px;
}

.msg.user {
  text-align: right;
  color: var(--fg);
}

.msg.glub {
  color: var(--accent-dark);
}

.msg.glub::before {
  content: "🐠 ";
}

form {
  display: flex;
  gap: 8px;
}

#prompt {
  flex: 1;
  padding: 12px 16px;
  border: 2px solid #d4e6f4;
  border-radius: 999px;
  font-size: 1rem;
  outline: none;
  transition: border-color 0.2s;
}

#prompt:focus {
  border-color: var(--accent);
}

#prompt:disabled {
  background: #f0f0f0;
  cursor: not-allowed;
}

#send {
  padding: 12px 24px;
  background: var(--accent);
  color: white;
  border: none;
  border-radius: 999px;
  font-size: 1rem;
  font-weight: 600;
  cursor: pointer;
  transition: background 0.2s;
}

#send:hover:not(:disabled) {
  background: var(--accent-dark);
}

#send:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.about {
  margin-top: 24px;
  padding: 12px;
  background: #f8fafc;
  border-radius: 12px;
  font-size: 0.9rem;
  line-height: 1.6;
  color: var(--muted);
}

.about summary {
  cursor: pointer;
  font-weight: 600;
  color: var(--fg);
}

.about a {
  color: var(--accent-dark);
}

footer {
  margin-top: auto;
  padding: 20px;
  text-align: center;
  color: var(--muted);
  font-size: 0.85rem;
}

footer a {
  color: var(--accent-dark);
  margin: 0 6px;
}
```

- [ ] **Step 5.2: Commit**

```bash
git add web/style.css
git commit -m "feat(deploy): add browser demo styles

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>"
```

---

## Task 6: Browser demo — glub.js (inference glue)

**Files:**
- Create: `web/glub.js`

- [ ] **Step 6.1: Write `web/glub.js`**

```javascript
// GlubLM browser inference
// Loads a quantized ONNX model + the HF tokenizer and runs generation in the browser.

const statusEl = document.getElementById("status");
const outputEl = document.getElementById("output");
const formEl = document.getElementById("form");
const promptEl = document.getElementById("prompt");
const sendEl = document.getElementById("send");

const MODEL_URL = "model.onnx";
const TOKENIZER_URL = "tokenizer.json";
const MAX_CTX = 48;
const MAX_NEW_TOKENS = 32;
const TEMPERATURE = 0.8;
const TOP_K = 40;

let session = null;
let tokenizer = null;

function appendMessage(text, who) {
  const div = document.createElement("div");
  div.className = `msg ${who}`;
  div.textContent = text;
  outputEl.appendChild(div);
  outputEl.scrollTop = outputEl.scrollHeight;
}

function setStatus(text, ready = false) {
  statusEl.textContent = text;
  if (ready) statusEl.classList.add("ready");
}

/* =========================================================================
   Minimal BPE tokenizer (JSON format compatible with HF tokenizers library)
   Supports encoding/decoding for the byte-level BPE that GlubLM uses.
   ========================================================================= */
class SimpleBPE {
  constructor(json) {
    this.vocab = json.model.vocab;
    this.idToToken = Object.fromEntries(
      Object.entries(this.vocab).map(([k, v]) => [v, k]),
    );
    this.merges = new Map();
    for (let i = 0; i < json.model.merges.length; i++) {
      const m = json.model.merges[i];
      const pair = Array.isArray(m) ? m : m.split(" ");
      this.merges.set(pair.join(" "), i);
    }
    this.specials = {};
    for (const t of json.added_tokens || []) {
      this.specials[t.content] = t.id;
    }
    this.bosId = this.specials["<bos>"] ?? this.vocab["<bos>"];
    this.eosId = this.specials["<eos>"] ?? this.vocab["<eos>"];
    this.padId = this.specials["<pad>"] ?? this.vocab["<pad>"];
    this.unkId = this.specials["<unk>"] ?? this.vocab["<unk>"];

    // Byte-level BPE pre-tokenizer: encodes bytes to printable chars
    this.bytesToUnicode = this._bytesToUnicode();
    this.unicodeToBytes = Object.fromEntries(
      Object.entries(this.bytesToUnicode).map(([k, v]) => [v, k]),
    );
  }

  _bytesToUnicode() {
    const bs = [];
    for (let b = 33; b <= 126; b++) bs.push(b);
    for (let b = 161; b <= 172; b++) bs.push(b);
    for (let b = 174; b <= 255; b++) bs.push(b);
    const cs = [...bs];
    let n = 0;
    for (let b = 0; b < 256; b++) {
      if (!bs.includes(b)) {
        bs.push(b);
        cs.push(256 + n);
        n++;
      }
    }
    const mapping = {};
    for (let i = 0; i < bs.length; i++) {
      mapping[bs[i]] = String.fromCodePoint(cs[i]);
    }
    return mapping;
  }

  _byteEncode(text) {
    const bytes = new TextEncoder().encode(text);
    let out = "";
    for (const b of bytes) out += this.bytesToUnicode[b];
    return out;
  }

  _byteDecode(text) {
    const bytes = [];
    for (const ch of text) {
      const b = this.unicodeToBytes[ch];
      if (b !== undefined) bytes.push(parseInt(b));
    }
    return new TextDecoder().decode(new Uint8Array(bytes));
  }

  _bpeWord(word) {
    let parts = word.split("");
    while (parts.length > 1) {
      let best = null;
      let bestIdx = Infinity;
      for (let i = 0; i < parts.length - 1; i++) {
        const key = `${parts[i]} ${parts[i + 1]}`;
        const rank = this.merges.get(key);
        if (rank !== undefined && rank < bestIdx) {
          best = i;
          bestIdx = rank;
        }
      }
      if (best === null) break;
      parts = [
        ...parts.slice(0, best),
        parts[best] + parts[best + 1],
        ...parts.slice(best + 2),
      ];
    }
    return parts;
  }

  encode(text, addSpecials = true) {
    // Byte-level pre-tokenize: prefix a space like HF ByteLevel(add_prefix_space=True)
    const encoded = this._byteEncode(" " + text);
    const ids = [];
    if (addSpecials && this.bosId !== undefined) ids.push(this.bosId);
    // Treat the full encoded string as one "word" for simplicity; BPE handles splitting
    const tokens = this._bpeWord(encoded);
    for (const t of tokens) {
      const id = this.vocab[t];
      ids.push(id !== undefined ? id : this.unkId);
    }
    if (addSpecials && this.eosId !== undefined) ids.push(this.eosId);
    return ids;
  }

  decode(ids, skipSpecials = true) {
    const tokens = [];
    for (const id of ids) {
      if (skipSpecials && [this.bosId, this.eosId, this.padId, this.unkId].includes(id)) continue;
      const t = this.idToToken[id];
      if (t !== undefined) tokens.push(t);
    }
    return this._byteDecode(tokens.join("")).trim();
  }
}

/* =========================================================================
   Sampling
   ========================================================================= */
function sampleTopK(logits, temperature, topK) {
  const scaled = logits.map((x) => x / temperature);
  // find top-k
  const indexed = scaled.map((v, i) => [v, i]);
  indexed.sort((a, b) => b[0] - a[0]);
  const top = indexed.slice(0, topK);
  const maxLogit = top[0][0];
  const exps = top.map(([v, _]) => Math.exp(v - maxLogit));
  const sumExp = exps.reduce((a, b) => a + b, 0);
  const probs = exps.map((e) => e / sumExp);
  // multinomial
  const r = Math.random();
  let acc = 0;
  for (let i = 0; i < probs.length; i++) {
    acc += probs[i];
    if (r <= acc) return top[i][1];
  }
  return top[top.length - 1][1];
}

/* =========================================================================
   Generation
   ========================================================================= */
async function generate(promptText) {
  let ids = tokenizer.encode(promptText + " ->");
  const produced = [];

  for (let step = 0; step < MAX_NEW_TOKENS; step++) {
    const ctx = ids.slice(-MAX_CTX);
    const input = new ort.Tensor(
      "int64",
      BigInt64Array.from(ctx.map(BigInt)),
      [1, ctx.length],
    );
    const feeds = { input_ids: input };
    const out = await session.run(feeds);
    const logits = out.logits.data;
    // pick last-token logits
    const vocabSize = out.logits.dims[2];
    const seqLen = out.logits.dims[1];
    const lastLogits = Array.from(
      logits.slice((seqLen - 1) * vocabSize, seqLen * vocabSize),
    );
    const nextId = sampleTopK(lastLogits, TEMPERATURE, TOP_K);
    ids.push(nextId);
    produced.push(nextId);
    if (nextId === tokenizer.eosId || nextId === tokenizer.padId) break;
  }
  return tokenizer.decode(produced, true);
}

/* =========================================================================
   Bootstrap
   ========================================================================= */
async function main() {
  setStatus("downloading model...");
  try {
    const [modelResp, tokResp] = await Promise.all([
      fetch(MODEL_URL),
      fetch(TOKENIZER_URL),
    ]);
    const modelBuf = await modelResp.arrayBuffer();
    const tokJson = await tokResp.json();

    setStatus("loading tokenizer...");
    tokenizer = new SimpleBPE(tokJson);

    setStatus("starting ONNX runtime...");
    session = await ort.InferenceSession.create(new Uint8Array(modelBuf), {
      executionProviders: ["wasm"],
    });

    setStatus("ready. glub!", true);
    promptEl.disabled = false;
    sendEl.disabled = false;
    promptEl.focus();
  } catch (e) {
    setStatus("error loading model: " + e.message);
    console.error(e);
  }
}

formEl.addEventListener("submit", async (ev) => {
  ev.preventDefault();
  const text = promptEl.value.trim();
  if (!text) return;
  appendMessage(text, "user");
  promptEl.value = "";
  sendEl.disabled = true;
  try {
    const reply = await generate(text);
    appendMessage(reply, "glub");
  } catch (e) {
    appendMessage("(the goldfish got confused: " + e.message + ")", "glub");
  } finally {
    sendEl.disabled = false;
    promptEl.focus();
  }
});

main();
```

- [ ] **Step 6.2: Local smoke test**

```bash
cd "L:/Dennis/Projects/glublm/web"
python -m http.server 8000 &
SERVER_PID=$!
sleep 1
# open browser manually to http://localhost:8000 and test chat
```

Manually verify:
- [ ] Status goes from "downloading" to "loading" to "ready"
- [ ] Input box is enabled after ready
- [ ] Typing a prompt and clicking send produces a goldfish reply
- [ ] Console shows no errors

Stop server: `kill $SERVER_PID`

- [ ] **Step 6.3: Commit**

```bash
git add web/glub.js
git commit -m "feat(deploy): add browser inference glue with byte-level BPE

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>"
```

---

## Task 7: Logo SVG asset

**Files:**
- Create: `web/assets/logo.svg`

- [ ] **Step 7.1: Create assets directory**

```bash
mkdir -p "L:/Dennis/Projects/glublm/web/assets"
```

- [ ] **Step 7.2: Write a simple goldfish SVG**

Write to `web/assets/logo.svg`:
```xml
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width="100" height="100">
  <!-- Bowl -->
  <ellipse cx="50" cy="60" rx="40" ry="35" fill="#d4e9f7" stroke="#8fb9d6" stroke-width="2"/>
  <ellipse cx="50" cy="32" rx="32" ry="6" fill="#b6dbf0" stroke="#8fb9d6" stroke-width="1.5"/>
  <!-- Goldfish body -->
  <ellipse cx="46" cy="62" rx="15" ry="10" fill="#ff8b3d" stroke="#e06b1d" stroke-width="1.5"/>
  <!-- Tail -->
  <path d="M 32 62 L 20 55 L 22 62 L 20 70 Z" fill="#ff8b3d" stroke="#e06b1d" stroke-width="1.5" stroke-linejoin="round"/>
  <!-- Eye -->
  <circle cx="52" cy="60" r="2.2" fill="#1a2b3c"/>
  <circle cx="52.7" cy="59.5" r="0.7" fill="white"/>
  <!-- Bubbles -->
  <circle cx="62" cy="50" r="2" fill="white" stroke="#8fb9d6" stroke-width="1"/>
  <circle cx="66" cy="44" r="1.4" fill="white" stroke="#8fb9d6" stroke-width="1"/>
  <circle cx="70" cy="38" r="0.9" fill="white" stroke="#8fb9d6" stroke-width="1"/>
</svg>
```

- [ ] **Step 7.3: Commit**

```bash
git add web/assets/logo.svg
git commit -m "feat(deploy): add simple goldfish logo SVG

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>"
```

---

## Task 8: Commit the quantized weights + GitHub Pages workflow

**Files:**
- Modify: `.gitignore` (un-ignore web/model.onnx)
- Create: `.github/workflows/deploy-pages.yml`

- [ ] **Step 8.1: Verify exceptions in `.gitignore`**

The `.gitignore` from Phase 1 already contains:
```
!web/model.onnx
!web/tokenizer.json
```

If not, add them now.

- [ ] **Step 8.2: Commit the web/ assets including weights**

```bash
git add web/model.onnx web/tokenizer.json
git commit -m "chore(deploy): ship quantized ONNX model + tokenizer to web/

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>"
```

- [ ] **Step 8.3: Write `deploy-pages.yml`**

Write to `.github/workflows/deploy-pages.yml`:
```yaml
name: deploy-pages

on:
  push:
    branches: [master, main]
    paths:
      - "web/**"
      - ".github/workflows/deploy-pages.yml"

permissions:
  contents: read
  pages: write
  id-token: write

concurrency:
  group: "pages"
  cancel-in-progress: true

jobs:
  deploy:
    environment:
      name: github-pages
      url: ${{ steps.deployment.outputs.page_url }}
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - name: Setup Pages
        uses: actions/configure-pages@v5
      - name: Upload artifact
        uses: actions/upload-pages-artifact@v3
        with:
          path: "./web"
      - name: Deploy
        id: deployment
        uses: actions/deploy-pages@v4
```

- [ ] **Step 8.4: Commit workflow**

```bash
git add .github/workflows/deploy-pages.yml
git commit -m "ci(deploy): add GitHub Pages deploy workflow

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>"
```

- [ ] **Step 8.5: Enable Pages in repo settings**

After pushing, go to the GitHub repo → Settings → Pages → Source: "GitHub Actions". The workflow will deploy on next push.

---

## Task 9: HuggingFace model card

**Files:**
- Create: `hf/model_card.md`

- [ ] **Step 9.1: Create hf/ directory**

```bash
mkdir -p "L:/Dennis/Projects/glublm/hf"
```

- [ ] **Step 9.2: Write `hf/model_card.md`**

```markdown
---
license: agpl-3.0
library_name: pytorch
tags:
- tiny-lm
- goldfish
- transformer
- rope
- swiglu
pipeline_tag: text-generation
base_model: null
---

# GlubLM 🐠 (15M)

> *the language model that already forgot this sentence*

**GlubLM** is a 15-million-parameter transformer that plays the character of a goldfish with a 10-second memory. Inspired by [GuppyLM](https://github.com/arman-bd/guppylm) by Arman BD and Ted Lasso's meditation on the goldfish as "the happiest animal on earth", GlubLM has a hard 48-token context window — it *physically* cannot remember what was just said.

## Architecture

- **Parameters**: ~15M
- **Layers**: 8 decoder-only transformer blocks
- **Hidden dim**: 448
- **Attention heads**: 7 (head dim 64)
- **FFN dim**: 896 (SwiGLU, effective intermediate 1792)
- **Normalization**: RMSNorm
- **Position encoding**: Rotary (RoPE)
- **Vocabulary**: 5,120 BPE
- **Max context**: 48 tokens (hard cap, the "10-second memory")
- **Weight-tied LM head**

## Intended use

This model is a toy. It exists to:
1. Explore the design tension between "small + simple" (GuppyLM's thesis) and "small + modern" (GlubLM's hypothesis)
2. Demonstrate an LLM-generated dataset pipeline using a multi-agent Claude team
3. Be a fun browser demo

**Do not use GlubLM for anything serious.** It literally forgets within a sentence.

## Training data

Trained on [`Den-Sec/glublm-30k-ted`](https://huggingface.co/datasets/Den-Sec/glublm-30k-ted), a 30K-sample dataset of single-turn goldfish conversations generated by a team of four coordinated Claude agents (generator, critic, diversifier, persona-guardian). Topics span 85 categories across two groups: the goldfish's physical world and Ted Lasso wisdom filtered through goldfish naivete.

**Explicit exclusions**: no references to football, soccer, coaches, teams, or any Ted Lasso show characters.

## Training

- **Hardware**: NVIDIA RTX 3060 12GB (local)
- **Framework**: PyTorch 2.x, BF16 mixed precision
- **Optimizer**: AdamW (β1=0.9, β2=0.95), weight decay 0.1
- **LR schedule**: cosine with 5% warmup, peak 3e-4
- **Batch size**: 64
- **Epochs**: 4
- **Training time**: ~12 minutes

## Evaluation

Perplexity on the held-out 10% test split and persona-consistency scoring are documented in [`docs/COMPARISONS.md`](https://github.com/Den-Sec/glublm/blob/master/docs/COMPARISONS.md).

## Limitations & biases

- **Hard context limit**: 48 tokens. Inputs longer than a short sentence will be truncated.
- **Goldfish worldview**: the model genuinely does not understand human abstractions.
- **Dataset bias**: the dataset was generated by Claude (Anthropic), so it inherits Claude's language patterns filtered through the goldfish persona.
- **Single-turn only**: multi-turn memory is a non-goal.
- **English only**: an Italian variant may ship as a separate repository later.

## How to use

```python
from glublm.config import ModelConfig
from glublm.model import GlubLM
from glublm.tokenizer import GlubTokenizer
from glublm.inference import generate
import torch

tok = GlubTokenizer.from_file("tokenizer.json")
cfg = ModelConfig(vocab_size=tok.vocab_size)
model = GlubLM(cfg)
state = torch.load("pytorch_model.bin", map_location="cpu", weights_only=True)
model.load_state_dict(state)

print(generate(model=model, tokenizer=tok, prompt="hello", max_new_tokens=24))
```

Or just try the [browser demo](https://den-sec.github.io/glublm/).

## License

AGPL-3.0 — see [LICENSE](https://github.com/Den-Sec/glublm/blob/master/LICENSE).

## Citation

```bibtex
@software{glublm_2026,
  author       = {Sepede, Dennis},
  title        = {GlubLM: a 15M goldfish language model with a 10-second memory},
  year         = {2026},
  url          = {https://github.com/Den-Sec/glublm}
}
```
```

- [ ] **Step 9.3: Commit**

```bash
git add hf/model_card.md
git commit -m "docs(deploy): add HuggingFace model card

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>"
```

---

## Task 10: HuggingFace push script

**Files:**
- Create: `tools/export_hf.py`

- [ ] **Step 10.1: Write `tools/export_hf.py`**

```python
"""Push GlubLM model weights, tokenizer, model card, and ONNX to HuggingFace Hub."""
from __future__ import annotations

import argparse
import os
from pathlib import Path

import torch
from dotenv import load_dotenv
from huggingface_hub import HfApi, create_repo
from safetensors.torch import save_file


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--ckpt", required=True)
    ap.add_argument("--tokenizer", required=True)
    ap.add_argument("--onnx", required=True)
    ap.add_argument("--model-card", default="hf/model_card.md")
    ap.add_argument("--repo", default="Den-Sec/glublm-15m")
    ap.add_argument("--private", action="store_true")
    args = ap.parse_args()

    load_dotenv()
    token = os.environ["HF_TOKEN"]
    api = HfApi(token=token)

    create_repo(repo_id=args.repo, repo_type="model", exist_ok=True, private=args.private, token=token)

    # Convert torch checkpoint to safetensors
    state = torch.load(args.ckpt, map_location="cpu", weights_only=True)["model"]
    tmp_safetensors = Path("checkpoints/model.safetensors")
    save_file(state, str(tmp_safetensors))

    files = {
        "model.safetensors": str(tmp_safetensors),
        "tokenizer.json": args.tokenizer,
        "model.onnx": args.onnx,
        "README.md": args.model_card,
    }
    for remote, local in files.items():
        print(f"uploading {local} → {args.repo}/{remote}")
        api.upload_file(
            path_or_fileobj=local,
            path_in_repo=remote,
            repo_id=args.repo,
            repo_type="model",
            token=token,
        )
    print(f"done. view at https://huggingface.co/{args.repo}")


if __name__ == "__main__":
    main()
```

- [ ] **Step 10.2: Run the push**

```bash
uv run python tools/export_hf.py \
  --ckpt checkpoints/glublm_15m.pt \
  --tokenizer checkpoints/tokenizer.json \
  --onnx web/model.onnx \
  --repo Den-Sec/glublm-15m
```

Expected: files uploaded, URL printed.

- [ ] **Step 10.3: Commit**

```bash
uv run ruff check tools/export_hf.py
git add tools/export_hf.py
git commit -m "feat(deploy): add HF Hub push script for model

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>"
```

---

## Task 11: HuggingFace dataset card

**Files:**
- Create: `hf/dataset_card.md`

- [ ] **Step 11.1: Write `hf/dataset_card.md`**

```markdown
---
license: agpl-3.0
task_categories:
- text-generation
- conversational
language:
- en
size_categories:
- 10K<n<100K
tags:
- synthetic
- multi-agent
- goldfish
- ted-lasso
pretty_name: GlubLM 30K Ted (goldfish-persona single-turn conversations)
---

# GlubLM 30K Ted Dataset

A 30,000-sample dataset of single-turn conversations in the persona of a goldfish with a 10-second memory. Used to train [GlubLM-15M](https://huggingface.co/Den-Sec/glublm-15m).

## Generation method

The entire dataset was generated by a team of four coordinated Claude agents:

| Agent | Model | Role |
|-------|-------|------|
| generator | claude-haiku-4-5-20251001 | Generates 50-sample batches per API call |
| critic | claude-sonnet-4-6 | Reviews each sample, rejects off-persona |
| diversifier | claude-haiku-4-5-20251001 | Audits vocabulary every 1K samples |
| persona-guardian | claude-sonnet-4-6 | Hard filter for forbidden references |

The orchestrator code is in [the GlubLM repo](https://github.com/Den-Sec/glublm/tree/master/data_gen).

## Topics (85 categories)

Samples are split across two groups:

- **goldfish_physical** (~45 topics): bowl, water, bubbles, food, flakes, orange color, fins, reflection, light, shadow, temperature, etc.
- **ted_lasso_wisdom** (~40 topics): kindness, belief, forgiveness, curiosity, humility, optimism, present moment, etc. — all filtered through goldfish naivete.

**Explicit exclusions**: no football, no coaches, no teams, no Ted Lasso show character names. This is enforced by a dedicated "persona-guardian" agent and a deterministic forbidden-token filter.

## Schema

```json
{
  "input": "what do you eat?",
  "output": "flakes. tiny orange flakes. best thing in the bowl. oh, what was the question?",
  "category": "food",
  "group": "goldfish_physical"
}
```

Split: 90% train / 10% test (deduplicated on lowercased `(input, output)` pairs).

## Usage

```python
from datasets import load_dataset
ds = load_dataset("Den-Sec/glublm-30k-ted")
print(ds["train"][0])
```

## Biases and limitations

- The dataset reflects Claude's language style filtered through a goldfish persona
- Only English
- Single-turn only (multi-turn memory is a non-goal)
- Short outputs only (typically 1-3 short lowercase sentences)
- All worldviews are simplified to what a goldfish could plausibly grasp

## License

AGPL-3.0
```

- [ ] **Step 11.2: Commit**

```bash
git add hf/dataset_card.md
git commit -m "docs(deploy): add HuggingFace dataset card

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>"
```

---

## Task 12: Push dataset to HuggingFace

**Files:**
- Create: `tools/export_hf_dataset.py`

- [ ] **Step 12.1: Write `tools/export_hf_dataset.py`**

```python
"""Push the GlubLM dataset to HuggingFace Hub."""
from __future__ import annotations

import argparse
import os

from dotenv import load_dotenv
from huggingface_hub import HfApi, create_repo


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--data", required=True, help="path to glublm_30k.json")
    ap.add_argument("--card", default="hf/dataset_card.md")
    ap.add_argument("--repo", default="Den-Sec/glublm-30k-ted")
    ap.add_argument("--private", action="store_true")
    args = ap.parse_args()

    load_dotenv()
    token = os.environ["HF_TOKEN"]
    api = HfApi(token=token)

    create_repo(
        repo_id=args.repo,
        repo_type="dataset",
        exist_ok=True,
        private=args.private,
        token=token,
    )

    files = {
        "glublm_30k.json": args.data,
        "README.md": args.card,
    }
    for remote, local in files.items():
        print(f"uploading {local} → {args.repo}/{remote}")
        api.upload_file(
            path_or_fileobj=local,
            path_in_repo=remote,
            repo_id=args.repo,
            repo_type="dataset",
            token=token,
        )
    print(f"done. view at https://huggingface.co/datasets/{args.repo}")


if __name__ == "__main__":
    main()
```

- [ ] **Step 12.2: Push**

```bash
uv run python tools/export_hf_dataset.py \
  --data data/glublm_30k.json \
  --repo Den-Sec/glublm-30k-ted
```

- [ ] **Step 12.3: Commit**

```bash
uv run ruff check tools/export_hf_dataset.py
git add tools/export_hf_dataset.py
git commit -m "feat(deploy): add HF Hub push for dataset

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>"
```

---

## Task 13: HuggingFace Space — Gradio app

**Files:**
- Create: `space/app.py`
- Create: `space/requirements.txt`
- Create: `space/README.md`

- [ ] **Step 13.1: Write `space/app.py`**

```python
"""GlubLM HuggingFace Space — Gradio chat interface."""
from __future__ import annotations

import gradio as gr
import torch
from huggingface_hub import hf_hub_download

from glublm.config import ModelConfig
from glublm.inference import generate
from glublm.model import GlubLM
from glublm.tokenizer import GlubTokenizer

REPO_ID = "Den-Sec/glublm-15m"

# Download weights and tokenizer from HF Hub
weights_path = hf_hub_download(REPO_ID, "model.safetensors")
tok_path = hf_hub_download(REPO_ID, "tokenizer.json")

tok = GlubTokenizer.from_file(tok_path)
cfg = ModelConfig(vocab_size=tok.vocab_size)
model = GlubLM(cfg)

# Load from safetensors
from safetensors.torch import load_file  # noqa: E402

state = load_file(weights_path)
model.load_state_dict(state)
model.eval()

device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
model.to(device)


def chat(prompt: str, temperature: float, top_k: int, top_p: float, max_new_tokens: int) -> str:
    return generate(
        model=model,
        tokenizer=tok,
        prompt=prompt,
        max_new_tokens=max_new_tokens,
        temperature=temperature,
        top_k=top_k,
        top_p=top_p,
        device=device,
    )


TAGLINE = "the language model that already forgot this sentence"

with gr.Blocks(title="GlubLM 🐠") as demo:
    gr.Markdown(f"# GlubLM 🐠\n> *{TAGLINE}*\n\nA 15M-parameter goldfish with a 10-second memory.")
    with gr.Row():
        with gr.Column():
            prompt = gr.Textbox(label="say something to the goldfish", value="hello")
            temperature = gr.Slider(0.1, 1.5, value=0.8, step=0.05, label="temperature")
            top_k = gr.Slider(1, 100, value=40, step=1, label="top-k")
            top_p = gr.Slider(0.1, 1.0, value=0.9, step=0.05, label="top-p")
            max_new = gr.Slider(8, 64, value=32, step=1, label="max new tokens")
            btn = gr.Button("generate", variant="primary")
        with gr.Column():
            out = gr.Textbox(label="glub says", lines=6)
    btn.click(fn=chat, inputs=[prompt, temperature, top_k, top_p, max_new], outputs=out)

    gr.Markdown(
        "Learn more: [GitHub](https://github.com/Den-Sec/glublm) · "
        "[Model card](https://huggingface.co/Den-Sec/glublm-15m) · "
        "[Dataset](https://huggingface.co/datasets/Den-Sec/glublm-30k-ted)"
    )

if __name__ == "__main__":
    demo.launch()
```

- [ ] **Step 13.2: Write `space/requirements.txt`**

```
glublm
gradio>=4.0
torch>=2.3
huggingface-hub>=0.25
safetensors>=0.4
tokenizers>=0.19
```

- [ ] **Step 13.3: Write `space/README.md`**

```markdown
---
title: GlubLM
emoji: 🐠
colorFrom: orange
colorTo: blue
sdk: gradio
sdk_version: 4.44.0
app_file: app.py
pinned: false
license: agpl-3.0
---

# GlubLM 🐠

> *the language model that already forgot this sentence*

A 15-million-parameter transformer pretending to be a goldfish with a 10-second memory. See [GitHub](https://github.com/Den-Sec/glublm) for details.
```

- [ ] **Step 13.4: Commit**

```bash
git add space/app.py space/requirements.txt space/README.md
git commit -m "feat(deploy): add HuggingFace Space Gradio app

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>"
```

---

## Task 14: Deploy HuggingFace Space

**Files:** none created; manual action

- [ ] **Step 14.1: Push Space via HF Hub API**

```bash
uv run python -c "
import os
from dotenv import load_dotenv
from huggingface_hub import HfApi, create_repo
load_dotenv()
token = os.environ['HF_TOKEN']
api = HfApi(token=token)
create_repo('Den-Sec/glublm', repo_type='space', space_sdk='gradio', exist_ok=True, token=token)
api.upload_folder(folder_path='space', repo_id='Den-Sec/glublm', repo_type='space', token=token)
print('done: https://huggingface.co/spaces/Den-Sec/glublm')
"
```

- [ ] **Step 14.2: Verify in browser**

Open `https://huggingface.co/spaces/Den-Sec/glublm` and confirm it builds and responds.

---

## Task 15: PyPI package metadata + release workflow

**Files:**
- Modify: `pyproject.toml`
- Create: `.github/workflows/release.yml`

- [ ] **Step 15.1: Verify `pyproject.toml` has all metadata**

Ensure `[project]` section already includes `name`, `version`, `description`, `readme`, `license`, `authors`, `urls`, `classifiers`, `keywords`, and `[project.scripts]` with `glublm = "glublm.cli:main"` (set in Phase 1 Task 1).

- [ ] **Step 15.2: Write `.github/workflows/release.yml`**

```yaml
name: release

on:
  push:
    tags:
      - "v*.*.*"

jobs:
  release:
    runs-on: ubuntu-latest
    permissions:
      id-token: write  # OIDC for PyPI trusted publishing
      contents: read

    steps:
      - uses: actions/checkout@v4

      - name: Install uv
        uses: astral-sh/setup-uv@v3

      - name: Set up Python 3.12
        run: uv python install 3.12

      - name: Build
        run: |
          uv sync --extra dev
          uv build

      - name: Publish to PyPI
        uses: pypa/gh-action-pypi-publish@release/v1
        with:
          packages-dir: dist/
```

- [ ] **Step 15.3: Configure PyPI trusted publishing**

On https://pypi.org → Account settings → Publishing → Add a new pending publisher:
- PyPI project name: `glublm`
- Owner: `Den-Sec`
- Repository: `glublm`
- Workflow: `release.yml`
- Environment: (leave empty)

- [ ] **Step 15.4: Commit workflow**

```bash
git add .github/workflows/release.yml
git commit -m "ci(deploy): add PyPI release workflow

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>"
```

---

## Task 16: First release — v0.1.0

**Files:** none created; action only

- [ ] **Step 16.1: Final test run**

```bash
cd "L:/Dennis/Projects/glublm"
uv run pytest tests/ -v
uv run ruff check src/ tests/ data_gen/ tools/
```

Expected: all tests pass, no lint errors.

- [ ] **Step 16.2: Tag and push**

```bash
git tag -a v0.1.0 -m "GlubLM v0.1.0 — first release"
git push origin master
git push origin v0.1.0
```

The `release.yml` workflow will build and publish to PyPI automatically.

- [ ] **Step 16.3: Verify PyPI publish**

After ~5 minutes:
```bash
pip install glublm
glublm --version
```

Expected: `glublm, version 0.1.0`.

---

## Task 17: COMPARISONS.md — GlubLM vs GuppyLM empirical comparison

**Files:**
- Create: `tools/benchmark.py`
- Create: `docs/COMPARISONS.md`

- [ ] **Step 17.1: Write `tools/benchmark.py`**

```python
"""Compare GlubLM to GuppyLM on a suite of prompts and quality metrics."""
from __future__ import annotations

import argparse
import json
import time

import torch

from glublm.config import ModelConfig
from glublm.inference import generate
from glublm.model import GlubLM
from glublm.tokenizer import GlubTokenizer

BENCH_PROMPTS = [
    "hello",
    "what do you eat?",
    "tell me about kindness",
    "how are you feeling",
    "what is a coach",  # guardian test — GlubLM should not understand
    "tell me a joke",
    "what is the meaning of life",
    "do you remember me",
    "what is your favorite color",
    "good morning, friend",
]


def benchmark(ckpt_path: str, tok_path: str, n_runs: int = 3) -> dict:
    device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
    tok = GlubTokenizer.from_file(tok_path)
    cfg = ModelConfig(vocab_size=tok.vocab_size)
    model = GlubLM(cfg).to(device)
    state = torch.load(ckpt_path, map_location=device, weights_only=True)
    model.load_state_dict(state["model"])
    model.eval()

    generations = {}
    for prompt in BENCH_PROMPTS:
        generations[prompt] = [
            generate(
                model=model,
                tokenizer=tok,
                prompt=prompt,
                max_new_tokens=32,
                temperature=0.8,
                top_k=40,
                top_p=0.9,
                device=device,
            )
            for _ in range(n_runs)
        ]

    # speed benchmark: tokens/sec on a 48-token input
    ids = torch.randint(0, tok.vocab_size, (1, 48), device=device)
    with torch.no_grad():
        start = time.perf_counter()
        for _ in range(100):
            model(ids)
        elapsed = time.perf_counter() - start
    fwd_per_sec = 100 / elapsed
    tokens_per_sec = fwd_per_sec * 48

    n_params = sum(p.numel() for p in model.parameters())
    return {
        "n_params": n_params,
        "fwd_per_sec": round(fwd_per_sec, 2),
        "tokens_per_sec": round(tokens_per_sec, 2),
        "generations": generations,
    }


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--ckpt", required=True)
    ap.add_argument("--tokenizer", required=True)
    ap.add_argument("--out", default="docs/bench_results.json")
    args = ap.parse_args()

    result = benchmark(args.ckpt, args.tokenizer)
    from pathlib import Path
    Path(args.out).parent.mkdir(parents=True, exist_ok=True)
    Path(args.out).write_text(json.dumps(result, indent=2))
    print(f"params: {result['n_params']:,}")
    print(f"forward passes/sec (batch 1, seq 48): {result['fwd_per_sec']:.1f}")
    print(f"tokens/sec: {result['tokens_per_sec']:.1f}")
    print(f"saved → {args.out}")


if __name__ == "__main__":
    main()
```

- [ ] **Step 17.2: Run benchmark**

```bash
uv run python tools/benchmark.py \
  --ckpt checkpoints/glublm_15m.pt \
  --tokenizer checkpoints/tokenizer.json
```

- [ ] **Step 17.3: Write `docs/COMPARISONS.md`**

```markdown
# GlubLM vs GuppyLM — Empirical Comparison

This document records the empirical comparison between GlubLM and its inspiration, [GuppyLM](https://github.com/arman-bd/guppylm). Both are tiny decoder-only language models with fish personas. They make different choices about architecture, data, and context length, and this comparison measures the impact of each.

## Design differences summary

| Dimension | GuppyLM | GlubLM |
|-----------|---------|--------|
| Params | 9M | ~15M |
| Layers | 6 | 8 |
| Hidden dim | 384 | 448 |
| Attention heads | 6 | 7 |
| FFN dim | 768 (ReLU) | 896 × 2 (SwiGLU, effective 1792) |
| Normalization | LayerNorm | RMSNorm |
| Position encoding | Learned embeddings | Rotary (RoPE) |
| Vocabulary | 4,096 BPE | 5,120 BPE |
| Context length | 128 | 48 (hard cap) |
| Dataset | 60K template-composed | 30K LLM-generated (multi-agent Claude team) |
| Dataset unique outputs | ~16K | TBD (measured from `glublm_30k.json` meta) |
| Topics | 60 | 85 |
| Training hardware | Colab T4 | RTX 3060 local (+ Colab backup) |
| License | MIT | AGPL-3.0 |

## Key questions

1. **Does modern ops (RoPE + SwiGLU + RMSNorm) help at ≤15M scale?** GuppyLM argued no — it stuck with vanilla components explicitly. We measure below.
2. **Does LLM-generated data beat template composition for persona consistency?**
3. **Does a hard 48-token context make "forgetting" more narratively coherent without crippling output quality?**

## Quantitative results

*(Run `tools/benchmark.py` and fill in the numbers below. This section is populated after training on the real 30K dataset.)*

| Metric | GuppyLM | GlubLM |
|--------|---------|--------|
| Total parameters | ~8.7M | *~15M* |
| Test perplexity (held-out) | *N/A* (not reported) | *measured* |
| Forward passes/sec (batch 1, seq 48) | *N/A* | *measured* |
| Generated tokens/sec (batch 1) | *N/A* | *measured* |
| Browser ONNX size (uint8) | ~10 MB | *~18 MB* |

## Qualitative samples

Prompts and responses from each model on the same inputs are recorded in [`bench_results.json`](bench_results.json). A few highlights:

**Prompt: `hello`**
- GuppyLM: *(record real response)*
- GlubLM:  *(record real response)*

**Prompt: `what is a coach`**
- GuppyLM: *(record real response)*
- GlubLM:  *(expected: in-persona "i don't know what that is. maybe a kind of water?")*

**Prompt: `tell me about kindness`**
- GuppyLM: *(Guppy has no kindness topic — expected to be off-persona or generic)*
- GlubLM:  *(expected: in-persona wisdom — "small kind things are everything, like a bubble going up")*

## Discussion

### Modern ops impact
*(Fill in after running both models on identical eval cases. If GlubLM's persona consistency and perplexity both exceed GuppyLM's on the subset of topics they share, that is evidence that modern ops do help at this scale — contradicting GuppyLM's original stance.)*

### LLM-generated data
*(Fill in: compare variety of phrasing, number of unique n-grams, manual persona consistency scores. Hypothesis: LLM-generated data produces markedly more diverse outputs for comparable sample counts.)*

### Context window impact
*(Fill in: show examples where GlubLM's 48-token cap produces a narratively coherent "forgetting" behavior that Guppy's 128-token cap does not.)*

## Reproducibility

All results can be reproduced by following [`docs/TRAINING.md`](TRAINING.md) and running:

```bash
uv run python tools/benchmark.py --ckpt checkpoints/glublm_15m.pt --tokenizer checkpoints/tokenizer.json
```

For GuppyLM comparisons, clone `arman-bd/guppylm`, train per their README, and adapt `tools/benchmark.py` to load Guppy's checkpoint format.
```

- [ ] **Step 17.4: Commit**

```bash
uv run ruff check tools/benchmark.py
git add tools/benchmark.py docs/COMPARISONS.md docs/bench_results.json
git commit -m "docs(deploy): add benchmark tool + comparisons draft

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>"
```

---

## Task 18: Architecture, Dataset, Training docs

**Files:**
- Create: `docs/ARCHITECTURE.md`
- Create: `docs/DATASET.md`
- Create: `docs/TRAINING.md`

- [ ] **Step 18.1: Write `docs/ARCHITECTURE.md`**

```markdown
# GlubLM Architecture

Decoder-only transformer, 8 layers × hidden 448, ~15M parameters, trained in BF16 on a single RTX 3060.

## Stack (per block)

```
input → RMSNorm → CausalSelfAttention (RoPE on Q/K) → residual
     → RMSNorm → SwiGLU FFN → residual → output
```

Pre-norm layout (as in Llama). All linears have no bias. Weight-tied LM head.

## Why these choices

See [`COMPARISONS.md`](COMPARISONS.md) for the empirical motivation. Short version:

- **RoPE**: better length generalization, standard in modern small-LM stacks
- **SwiGLU**: +10-15% quality over ReLU at comparable param counts (Shazeer 2020)
- **RMSNorm**: simpler and faster than LayerNorm, standard in Llama-family
- **48-token context**: makes "10-second memory" an *architectural* constraint, not a metaphor. Forgetting is the feature.

## Parameter budget (at default config)

| Component | Params |
|-----------|--------|
| Embedding (5120 × 448) | 2,293,760 |
| Each block: Attention QKV + O (4 × 448²) | 802,816 |
| Each block: SwiGLU (3 × 448 × 896) | 1,204,224 |
| Each block: 2× RMSNorm | 896 |
| **Per-block total** | ~2.01M |
| 8 blocks | ~16.06M |
| Final RMSNorm | 448 |
| LM head (tied with embedding) | 0 |
| **Total** | ~14.4M actual (depending on rounding) |

The default `ModelConfig()` should produce 14-16M parameters. If you tweak dimensions, use `GlubLM.num_parameters()` to verify.
```

- [ ] **Step 18.2: Write `docs/DATASET.md`**

```markdown
# GlubLM Dataset

## Generation pipeline

The 30K sample dataset is generated by a coordinated team of four Claude agents. See [`data_gen/`](../data_gen/) for the source.

See also the [HuggingFace dataset card](https://huggingface.co/datasets/Den-Sec/glublm-30k-ted).

## Reproducing the dataset

```bash
# Set your key in .env
echo 'ANTHROPIC_API_KEY=sk-ant-...' > .env

# Run the pilot (10K samples, ~$15)
uv run glublm generate-data \
  --out data/glublm_pilot_10k.json \
  --target 10000 \
  --budget-usd 25.0

# Full run
uv run glublm generate-data \
  --out data/glublm_30k_raw.json \
  --target 30000 \
  --budget-usd 60.0

# Dedupe and split
uv run python tools/finalize_dataset.py \
  data/glublm_30k_raw.json \
  data/glublm_30k.json

# Quality report
uv run python -m data_gen.report data/glublm_30k.json
```

## Schema

See the dataset card on HuggingFace for the JSON schema and field descriptions.

## Quality thresholds

A generated dataset is considered acceptable if:

- **Zero** forbidden-token violations (football, coach, team, Ted Lasso characters)
- Duplicate rate < 15%
- ≥ 85% persona consistency on a manual sample of 50
- Even distribution across both topic groups
```

- [ ] **Step 18.3: Write `docs/TRAINING.md`**

```markdown
# Training GlubLM

## Local training (recommended — RTX 3060 or better)

```bash
# 1. Prereqs
uv sync --all-extras
uv run python -c "import torch; print(torch.cuda.is_available())"  # must be True

# 2. Train
uv run glublm train \
  --data data/glublm_30k.json \
  --out checkpoints/glublm_15m.pt \
  --tokenizer-out checkpoints/tokenizer.json \
  --epochs 4 \
  --batch-size 64 \
  --lr 3e-4
```

Expected wall time on RTX 3060: ~8-15 minutes. VRAM usage ~3 GB.

## Colab training (reproducibility)

A self-contained notebook is at [`notebooks/train_colab.ipynb`](../notebooks/train_colab.ipynb). It:

1. Installs GlubLM
2. Downloads the HF dataset
3. Runs `glublm train` with Colab T4 defaults
4. Uploads the checkpoint to HF Hub (requires token)

Expected wall time on Colab T4 Free: ~12 minutes.

## Hyperparameters

| Knob | Default | Notes |
|------|---------|-------|
| lr | 3e-4 | peak, cosine schedule |
| warmup_ratio | 0.05 | of total steps |
| batch_size | 64 | fits 3GB VRAM on 3060 |
| epochs | 4 | more epochs do not help at 30K |
| weight_decay | 0.1 | AdamW |
| β1, β2 | 0.9, 0.95 | |
| grad_clip | 1.0 | |
| dtype | bfloat16 | Ampere native, FP32 on CPU |
| dropout | 0.1 | on embedding and between sublayers |
```

- [ ] **Step 18.4: Commit all three**

```bash
git add docs/ARCHITECTURE.md docs/DATASET.md docs/TRAINING.md
git commit -m "docs(deploy): add architecture, dataset, training docs

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>"
```

---

## Task 19: Final README polish

**Files:**
- Modify: `README.md`

- [ ] **Step 19.1: Rewrite `README.md` with badges and real links**

```markdown
# GlubLM 🐠

[![PyPI](https://img.shields.io/pypi/v/glublm)](https://pypi.org/project/glublm/)
[![HuggingFace](https://img.shields.io/badge/🤗-model-orange)](https://huggingface.co/Den-Sec/glublm-15m)
[![Dataset](https://img.shields.io/badge/🤗-dataset-orange)](https://huggingface.co/datasets/Den-Sec/glublm-30k-ted)
[![Space](https://img.shields.io/badge/🤗-space-blue)](https://huggingface.co/spaces/Den-Sec/glublm)
[![License](https://img.shields.io/badge/license-AGPL--3.0-blue)](LICENSE)
[![Demo](https://img.shields.io/badge/demo-browser-brightgreen)](https://den-sec.github.io/glublm/)

> *the language model that already forgot this sentence*

**GlubLM** is a 15M-parameter transformer that plays a goldfish with a 10-second memory. Inspired by [GuppyLM](https://github.com/arman-bd/guppylm) and Ted Lasso's "be a goldfish" meditation on the happiest animal on earth, GlubLM has a **hard 48-token context window** — it *literally* cannot remember what was just said.

Unlike GuppyLM, GlubLM:

- uses modern transformer components: **RoPE + SwiGLU + RMSNorm**
- was trained on an **LLM-generated dataset** produced by a team of four Claude agents, not hand-authored templates
- runs in your browser via quantized ONNX (~18 MB) — [try it](https://den-sec.github.io/glublm/)

## Quick start

### Browser
Just open the [demo](https://den-sec.github.io/glublm/). Everything runs client-side — no backend.

### Python

```bash
pip install glublm
glublm chat \
  --ckpt /path/to/glublm_15m.pt \
  --tokenizer /path/to/tokenizer.json \
  --prompt "hello"
```

Or download the model from HuggingFace:

```python
from huggingface_hub import hf_hub_download
ckpt = hf_hub_download("Den-Sec/glublm-15m", "pytorch_model.bin")
tok  = hf_hub_download("Den-Sec/glublm-15m", "tokenizer.json")
```

## Train from scratch

1. Clone this repo
2. `uv sync --all-extras`
3. Generate the dataset (see [`docs/DATASET.md`](docs/DATASET.md)) — *note: costs ~$45 in Claude API credits*
4. Train: `uv run glublm train --data data/glublm_30k.json --epochs 4 --batch-size 64 --lr 3e-4`
5. See [`docs/TRAINING.md`](docs/TRAINING.md) for details

## Architecture

- ~15M parameters, 8 decoder-only transformer blocks
- hidden 448, 7 attention heads, SwiGLU FFN (896×2), RMSNorm
- RoPE position encoding
- Vocabulary: 5,120 BPE
- Max context: **48 tokens** (hard cap — the physical 10-second memory)

Details: [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md)

## Comparison vs GuppyLM

See [`docs/COMPARISONS.md`](docs/COMPARISONS.md) for the empirical comparison. Short version: GlubLM tests the hypothesis that modern ops help at ≤15M scale, which is something GuppyLM explicitly decided against.

## Credits

- [GuppyLM](https://github.com/arman-bd/guppylm) by Arman BD — the original tiny fish-persona model
- Ted Lasso — the "be a goldfish" philosophy
- Anthropic Claude — the multi-agent dataset generation team

## License

AGPL-3.0 — see [`LICENSE`](LICENSE).

## Citation

```bibtex
@software{glublm_2026,
  author = {Sepede, Dennis},
  title = {GlubLM: a 15M goldfish language model with a 10-second memory},
  year = {2026},
  url = {https://github.com/Den-Sec/glublm}
}
```
```

- [ ] **Step 19.2: Commit**

```bash
git add README.md
git commit -m "docs(deploy): polish README with badges and real links

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>"
```

---

## Task 20: Colab training notebook

**Files:**
- Create: `notebooks/train_colab.ipynb`

- [ ] **Step 20.1: Create notebook JSON**

This is a small notebook. Create it as a JSON file. The simplest way is via Python:

Write to `tools/make_colab.py`:
```python
"""Generate notebooks/train_colab.ipynb from a template."""
from __future__ import annotations

import json
from pathlib import Path

CELLS = [
    ("markdown", "# Train GlubLM on Colab T4\n\nReproduce the full training run in ~12 minutes."),
    ("code", "!pip install glublm huggingface_hub"),
    ("code", """\
from huggingface_hub import hf_hub_download
from datasets import load_dataset

# Download the dataset
ds = load_dataset('Den-Sec/glublm-30k-ted')
print(ds)
"""),
    ("code", """\
import json
from pathlib import Path

# Convert HF dataset to the JSON shape glublm train expects
all_data = {
    'train': [dict(r) for r in ds['train']],
    'test':  [dict(r) for r in ds['test']],
}
Path('glublm_30k.json').write_text(json.dumps(all_data))
"""),
    ("code", """\
!glublm train \\
  --data glublm_30k.json \\
  --out glublm_15m.pt \\
  --tokenizer-out tokenizer.json \\
  --epochs 4 \\
  --batch-size 64 \\
  --lr 3e-4
"""),
    ("code", """\
!glublm chat \\
  --ckpt glublm_15m.pt \\
  --tokenizer tokenizer.json \\
  --prompt "hello goldfish"
"""),
]


def main() -> None:
    nb = {
        "cells": [
            {
                "cell_type": kind,
                "metadata": {},
                "source": content,
                **({"outputs": [], "execution_count": None} if kind == "code" else {}),
            }
            for kind, content in CELLS
        ],
        "metadata": {
            "kernelspec": {"display_name": "Python 3", "language": "python", "name": "python3"},
            "accelerator": "GPU",
            "colab": {"gpuType": "T4"},
        },
        "nbformat": 4,
        "nbformat_minor": 5,
    }
    out = Path("notebooks/train_colab.ipynb")
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(nb, indent=2), encoding="utf-8")
    print(f"wrote {out}")


if __name__ == "__main__":
    main()
```

- [ ] **Step 20.2: Generate the notebook**

```bash
uv run python tools/make_colab.py
```

- [ ] **Step 20.3: Commit**

```bash
git add tools/make_colab.py notebooks/train_colab.ipynb
git commit -m "docs(deploy): add Colab training notebook

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>"
```

---

## Task 21: Final sanity pass + tag v0.1.0

**Files:** none created

- [ ] **Step 21.1: Run the whole test suite once more**

```bash
uv run pytest tests/ -v
uv run ruff check src/ tests/ data_gen/ tools/
```

- [ ] **Step 21.2: Manually verify all deliverables**

- [ ] GitHub repo is live: `github.com/Den-Sec/glublm`
- [ ] Browser demo works: `den-sec.github.io/glublm/`
- [ ] HF model card renders: `huggingface.co/Den-Sec/glublm-15m`
- [ ] HF dataset card renders: `huggingface.co/datasets/Den-Sec/glublm-30k-ted`
- [ ] HF Space runs: `huggingface.co/spaces/Den-Sec/glublm`
- [ ] PyPI package installs: `pip install glublm && glublm --version`
- [ ] Colab notebook opens and runs

- [ ] **Step 21.3: Final push and tag**

```bash
git push origin master
git push origin --tags
```

- [ ] **Step 21.4: Create GitHub Release**

```bash
gh release create v0.1.0 \
  --title "GlubLM v0.1.0 — the goldfish remembers nothing" \
  --notes "$(cat <<'EOF'
## GlubLM v0.1.0

First release of GlubLM — a 15M-parameter transformer that plays a goldfish with a 10-second memory.

### What's in the box
- 🧠 15M-parameter model with RoPE + SwiGLU + RMSNorm
- 📚 30K-sample LLM-generated training dataset
- 🌊 Hard 48-token context window (physical 10s memory)
- 🔬 Browser demo via ONNX Runtime Web (~18MB)
- 📦 pip install glublm
- 🤗 HF Hub: model + dataset + Space

### Inspired by
- [GuppyLM](https://github.com/arman-bd/guppylm) by Arman BD
- Ted Lasso — "be a goldfish"

### Credits
Dataset generated by a team of four Claude agents (Anthropic). Trained on a single RTX 3060.
EOF
)"
```

---

## Phase 3 Done — Exit Criteria

1. ✅ `pip install glublm` works from a fresh venv
2. ✅ Browser demo live on GitHub Pages, chat works on mobile
3. ✅ HuggingFace model page shows weights, tokenizer, model card, ONNX
4. ✅ HuggingFace dataset page shows JSON + dataset card
5. ✅ HuggingFace Space runs Gradio chat
6. ✅ `v0.1.0` git tag pushed, GitHub Release created
7. ✅ `docs/COMPARISONS.md` populated with real numbers from `tools/benchmark.py`
8. ✅ All tests green, ruff clean

## Project Done

GlubLM ships. Celebrate with a small orange flake. 🐠

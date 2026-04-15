"""Eval harness: generate model outputs for a prompt set with reproducible seeds.

Mirrors src/glublm/inference.py:generate() but injects a repetition-penalty step
matching the JS clients (companion/server/inference.js, desk-pet/inference/model.js).
The runtime path stays untouched; this script only consumes top_k_top_p_sample.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import sys
import time
from datetime import datetime, timezone
from pathlib import Path

import torch

from glublm.config import ModelConfig
from glublm.inference import top_k_top_p_sample
from glublm.model import GlubLM
from glublm.tokenizer import GlubTokenizer


def sha256_file(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as f:
        for chunk in iter(lambda: f.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()


def load_model(ckpt_path: str, tokenizer_path: str, device: torch.device) -> tuple[GlubLM, GlubTokenizer]:
    """Verbatim from tools/export_onnx.py:69-73, then .to(device).eval()."""
    tok = GlubTokenizer.from_file(tokenizer_path)
    cfg = ModelConfig(vocab_size=tok.vocab_size)
    model = GlubLM(cfg)
    state = torch.load(ckpt_path, map_location="cpu", weights_only=True)
    model.load_state_dict(state.get("model", state))
    model.to(device).eval()
    return model, tok


@torch.no_grad()
def generate_with_rep_penalty(
    model: GlubLM,
    tokenizer: GlubTokenizer,
    prompt: str,
    *,
    seed: int,
    temperature: float,
    top_k: int,
    top_p: float,
    rep_penalty: float,
    rep_window: int,
    min_new_tokens: int,
    max_new_tokens: int,
    device: torch.device,
) -> tuple[str, int]:
    """Single generation with a fixed seed. Returns (output_text, n_new_tokens)."""
    torch.manual_seed(seed)

    ids = tokenizer.encode(prompt + " ->", add_special_tokens=True)
    ids_t = torch.tensor(ids, dtype=torch.long, device=device).unsqueeze(0)

    eos = tokenizer.eos_id
    pad = tokenizer.pad_id
    max_ctx = model.cfg.max_seq_len
    produced: list[int] = []

    for step in range(max_new_tokens):
        ctx = ids_t[:, -max_ctx:]
        logits = model(ctx)[:, -1, :].squeeze(0)

        if step < min_new_tokens:
            logits[eos] = float("-inf")
            logits[pad] = float("-inf")

        # Repetition penalty over the last `rep_window` produced tokens.
        # Mirrors JS applyRepetitionPenalty in companion/server/inference.js
        # and desk-pet/inference/model.js.
        if rep_penalty != 1.0 and produced:
            for tok_id in set(produced[-rep_window:]):
                if logits[tok_id] > 0:
                    logits[tok_id] = logits[tok_id] / rep_penalty
                else:
                    logits[tok_id] = logits[tok_id] * rep_penalty

        next_id = top_k_top_p_sample(logits, temperature, top_k, top_p)
        next_id_int = int(next_id.item())
        ids_t = torch.cat([ids_t, next_id.view(1, 1)], dim=1)
        produced.append(next_id_int)

        if step >= min_new_tokens and next_id_int in (eos, pad):
            break

    text = tokenizer.decode(produced, skip_special_tokens=True)
    return text, len(produced)


def load_prompts(path: Path) -> list[dict]:
    rows = []
    with path.open(encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if line:
                rows.append(json.loads(line))
    return rows


def main() -> None:
    ap = argparse.ArgumentParser(description="GlubLM eval harness")
    ap.add_argument("--ckpt", required=True, help="Path to checkpoint .pt")
    ap.add_argument("--tokenizer", required=True, help="Path to tokenizer.json")
    ap.add_argument("--prompts", required=True, help="Path to prompts JSONL")
    ap.add_argument("--output", required=True, help="Output JSONL path")
    ap.add_argument("--seeds", nargs="+", type=int, default=[0, 1, 2])
    ap.add_argument("--temp", type=float, default=0.6)
    ap.add_argument("--top-k", type=int, default=40)
    ap.add_argument("--top-p", type=float, default=0.9)
    ap.add_argument("--rep-penalty", type=float, default=1.15)
    ap.add_argument("--rep-window", type=int, default=24)
    ap.add_argument("--min-new-tokens", type=int, default=4)
    ap.add_argument("--max-new-tokens", type=int, default=32)
    ap.add_argument("--model-version", default="v0.3.1")
    ap.add_argument("--device", default="auto", choices=["auto", "cuda", "cpu"])
    ap.add_argument("--limit", type=int, default=None, help="Smoke mode: cap prompts to N")
    args = ap.parse_args()

    if args.device == "auto":
        device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
    else:
        device = torch.device(args.device)

    print(f"[harness] device={device}", file=sys.stderr)

    ckpt_path = Path(args.ckpt)
    ckpt_sha = sha256_file(ckpt_path)
    print(f"[harness] ckpt sha256={ckpt_sha[:16]}…", file=sys.stderr)

    model, tokenizer = load_model(str(ckpt_path), args.tokenizer, device)
    print(f"[harness] model loaded ({sum(p.numel() for p in model.parameters()):,} params)", file=sys.stderr)

    prompts = load_prompts(Path(args.prompts))
    if args.limit is not None:
        prompts = prompts[: args.limit]
    print(f"[harness] {len(prompts)} prompts × {len(args.seeds)} seeds = {len(prompts) * len(args.seeds)} runs", file=sys.stderr)

    sampling_params = {
        "temp": args.temp,
        "top_k": args.top_k,
        "top_p": args.top_p,
        "rep_penalty": args.rep_penalty,
        "min_new_tokens": args.min_new_tokens,
        "max_new_tokens": args.max_new_tokens,
        "window": args.rep_window,
    }

    out_path = Path(args.output)
    out_path.parent.mkdir(parents=True, exist_ok=True)

    n = 0
    t0 = time.time()
    with out_path.open("w", encoding="utf-8") as f:
        for prompt_row in prompts:
            for seed in args.seeds:
                t_start = time.time()
                output, n_new = generate_with_rep_penalty(
                    model,
                    tokenizer,
                    prompt_row["prompt"],
                    seed=seed,
                    temperature=args.temp,
                    top_k=args.top_k,
                    top_p=args.top_p,
                    rep_penalty=args.rep_penalty,
                    rep_window=args.rep_window,
                    min_new_tokens=args.min_new_tokens,
                    max_new_tokens=args.max_new_tokens,
                    device=device,
                )
                elapsed_ms = int((time.time() - t_start) * 1000)
                row = {
                    "prompt_id": prompt_row["id"],
                    "category": prompt_row["category"],
                    "prompt": prompt_row["prompt"],
                    "seed": seed,
                    "output": output,
                    "n_new_tokens": n_new,
                    "sampling_params": sampling_params,
                    "model_version": args.model_version,
                    "checkpoint_sha256": ckpt_sha,
                    "timestamp": datetime.now(timezone.utc).isoformat(timespec="seconds"),
                    "elapsed_ms": elapsed_ms,
                }
                f.write(json.dumps(row, ensure_ascii=False) + "\n")
                f.flush()
                n += 1
                if n % 10 == 0 or n == len(prompts) * len(args.seeds):
                    print(f"[harness] {n}/{len(prompts) * len(args.seeds)} done ({(time.time() - t0):.1f}s)", file=sys.stderr)

    print(f"[harness] wrote {n} rows to {out_path}", file=sys.stderr)


if __name__ == "__main__":
    main()

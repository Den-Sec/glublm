#!/usr/bin/env python
"""Benchmark GlubLM inference throughput.

Reports forward-passes/sec (batch=1, seq=96) and tokens/sec (generate)
for both CUDA (if available) and CPU. Used to populate the throughput
row in docs/COMPARISONS.md.

Usage:
    python scripts/bench_inference.py
    python scripts/bench_inference.py --device cpu --iters-forward 50
"""
from __future__ import annotations

import argparse
import statistics
import time
from pathlib import Path

import torch

from glublm.config import ModelConfig
from glublm.inference import generate
from glublm.model import GlubLM
from glublm.tokenizer import GlubTokenizer


REPO = Path(__file__).resolve().parent.parent
DEFAULT_CKPT = REPO / "checkpoints" / "glublm_35m_v52.pt"
DEFAULT_TOK = REPO / "checkpoints" / "tokenizer_35m_v52.json"


def load(ckpt_path: Path, tok_path: Path, device: torch.device) -> tuple[GlubLM, GlubTokenizer]:
    tok = GlubTokenizer.from_file(str(tok_path))
    cfg = ModelConfig(vocab_size=tok.vocab_size)
    model = GlubLM(cfg).to(device)
    state = torch.load(str(ckpt_path), map_location=device, weights_only=True)
    model.load_state_dict(state.get("model", state))
    model.eval()
    return model, tok


@torch.no_grad()
def bench_forward(model: GlubLM, device: torch.device, warmup: int, iters: int) -> dict:
    seq = model.cfg.max_seq_len
    x = torch.randint(0, model.cfg.vocab_size, (1, seq), dtype=torch.long, device=device)
    for _ in range(warmup):
        model(x)
    if device.type == "cuda":
        torch.cuda.synchronize()
    timings = []
    for _ in range(iters):
        if device.type == "cuda":
            torch.cuda.synchronize()
        t0 = time.perf_counter()
        model(x)
        if device.type == "cuda":
            torch.cuda.synchronize()
        timings.append(time.perf_counter() - t0)
    mean = statistics.mean(timings)
    stdev = statistics.stdev(timings) if len(timings) > 1 else 0.0
    return {
        "mean_ms": mean * 1000,
        "stdev_ms": stdev * 1000,
        "passes_per_sec": 1.0 / mean,
    }


def bench_generate(
    model: GlubLM, tok: GlubTokenizer, device: torch.device, warmup: int, iters: int
) -> dict:
    prompt = "hello there"
    max_new = 50
    prompt_ids = tok.encode(prompt + " ->", add_special_tokens=True)
    for _ in range(warmup):
        generate(model, tok, prompt, max_new_tokens=max_new, temperature=0.6, top_p=0.9, device=device)
    if device.type == "cuda":
        torch.cuda.synchronize()
    timings = []
    tokens_per_run = []
    for _ in range(iters):
        if device.type == "cuda":
            torch.cuda.synchronize()
        t0 = time.perf_counter()
        out_ids = generate(
            model, tok, prompt,
            max_new_tokens=max_new,
            temperature=0.6, top_p=0.9,
            device=device, return_ids=True,
        )
        if device.type == "cuda":
            torch.cuda.synchronize()
        timings.append(time.perf_counter() - t0)
        new = max(0, len(out_ids) - len(prompt_ids))
        tokens_per_run.append(new)
    total_time = sum(timings)
    total_tokens = sum(tokens_per_run)
    return {
        "mean_wall_ms": statistics.mean(timings) * 1000,
        "mean_tokens": statistics.mean(tokens_per_run),
        "tokens_per_sec": total_tokens / total_time if total_time > 0 else 0.0,
    }


def run_on_device(
    device_name: str, ckpt: Path, tok: Path,
    warmup_f: int, iters_f: int, warmup_g: int, iters_g: int,
) -> dict | None:
    if device_name == "cuda" and not torch.cuda.is_available():
        print("[skip] cuda not available")
        return None
    device = torch.device(device_name)
    print(f"\n=== {device_name.upper()} ===")
    model, tokz = load(ckpt, tok, device)
    n_params = sum(p.numel() for p in model.parameters())
    print(f"  model loaded: {n_params:,} params on {device}")
    fwd = bench_forward(model, device, warmup_f, iters_f)
    gen = bench_generate(model, tokz, device, warmup_g, iters_g)
    print(
        f"  forward/sec (batch=1, seq={model.cfg.max_seq_len}): "
        f"{fwd['passes_per_sec']:.1f}  (mean {fwd['mean_ms']:.2f} ms +- {fwd['stdev_ms']:.2f})"
    )
    print(
        f"  tokens/sec (generate, max_new=50, T=0.6): "
        f"{gen['tokens_per_sec']:.1f}  "
        f"(avg {gen['mean_tokens']:.1f} new tokens in {gen['mean_wall_ms']:.1f} ms)"
    )
    return {"device": device_name, "forward": fwd, "generate": gen}


def main() -> int:
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("--ckpt", type=Path, default=DEFAULT_CKPT)
    p.add_argument("--tokenizer", type=Path, default=DEFAULT_TOK)
    p.add_argument("--device", choices=["cuda", "cpu", "both"], default="both")
    p.add_argument("--warmup-forward", type=int, default=10)
    p.add_argument("--iters-forward", type=int, default=100)
    p.add_argument("--warmup-generate", type=int, default=5)
    p.add_argument("--iters-generate", type=int, default=30)
    args = p.parse_args()

    if not args.ckpt.exists():
        print(f"ERROR: checkpoint not found: {args.ckpt}", flush=True)
        return 2
    if not args.tokenizer.exists():
        print(f"ERROR: tokenizer not found: {args.tokenizer}", flush=True)
        return 2

    print(f"checkpoint: {args.ckpt.name}")
    print(f"tokenizer : {args.tokenizer.name}")
    if torch.cuda.is_available():
        print(f"gpu       : {torch.cuda.get_device_name(0)}")
    print(f"torch     : {torch.__version__}")

    devices = ["cuda", "cpu"] if args.device == "both" else [args.device]
    results = []
    for d in devices:
        r = run_on_device(
            d, args.ckpt, args.tokenizer,
            args.warmup_forward, args.iters_forward,
            args.warmup_generate, args.iters_generate,
        )
        if r:
            results.append(r)

    if results:
        print("\n--- comparison table rows (paste into docs/COMPARISONS.md) ---")
        fwd_gpu = next((r for r in results if r["device"] == "cuda"), None)
        fwd_cpu = next((r for r in results if r["device"] == "cpu"), None)
        if fwd_gpu:
            print(
                f"| Forward passes/sec (batch 1, seq 96, RTX 3060) | N/A | "
                f"{fwd_gpu['forward']['passes_per_sec']:.0f}"
                + (f" (CPU: {fwd_cpu['forward']['passes_per_sec']:.0f})" if fwd_cpu else "")
                + " |"
            )
            print(
                f"| Generated tokens/sec (batch 1, RTX 3060) | N/A | "
                f"{fwd_gpu['generate']['tokens_per_sec']:.0f}"
                + (f" (CPU: {fwd_cpu['generate']['tokens_per_sec']:.0f})" if fwd_cpu else "")
                + " |"
            )

    return 0


if __name__ == "__main__":
    raise SystemExit(main())

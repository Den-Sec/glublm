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
    "what is a coach",
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
    model.load_state_dict(state.get("model", state))
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
        # warmup
        for _ in range(10):
            model(ids)
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
        "device": str(device),
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
    print(f"device: {result['device']}")
    print(f"forward passes/sec (batch 1, seq 48): {result['fwd_per_sec']:.1f}")
    print(f"tokens/sec: {result['tokens_per_sec']:.1f}")
    print(f"saved -> {args.out}")


if __name__ == "__main__":
    main()

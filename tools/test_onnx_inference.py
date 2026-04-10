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
    ap.add_argument("--min-new-tokens", type=int, default=4)
    args = ap.parse_args()

    tok = GlubTokenizer.from_file(args.tokenizer)
    sess = ort.InferenceSession(args.onnx, providers=["CPUExecutionProvider"])

    ids = tok.encode(args.prompt + " ->")
    for step in range(args.max_new_tokens):
        ctx = np.array([ids[-args.max_ctx:]], dtype=np.int64)
        logits = sess.run(None, {"input_ids": ctx})[0][0, -1]
        # Suppress EOS/PAD during minimum generation window
        if step < args.min_new_tokens:
            logits[tok.eos_id] = -np.inf
            logits[tok.pad_id] = -np.inf
        next_id = sample(logits)
        ids.append(next_id)
        if step >= args.min_new_tokens and (next_id == tok.eos_id or next_id == tok.pad_id):
            break
    print(tok.decode(ids, skip_special_tokens=True))


if __name__ == "__main__":
    main()

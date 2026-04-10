"""Evaluate a trained GlubLM checkpoint on the held-out test split."""
from __future__ import annotations

import sys

import torch
import torch.nn.functional as F

from glublm.config import ModelConfig
from glublm.dataset import GlubDataset, load_train_test
from glublm.inference import generate
from glublm.model import GlubLM
from glublm.tokenizer import GlubTokenizer


def main(ckpt_path: str, tok_path: str, data_path: str) -> None:
    device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
    tok = GlubTokenizer.from_file(tok_path)
    cfg = ModelConfig(vocab_size=tok.vocab_size)
    model = GlubLM(cfg).to(device)
    state = torch.load(ckpt_path, map_location=device, weights_only=True)
    model.load_state_dict(state["model"])
    model.eval()

    _, test = load_train_test(data_path)
    ds = GlubDataset(test, tok, max_seq_len=cfg.max_seq_len)

    # 1. Perplexity on held-out test
    total_loss = 0.0
    total_tokens = 0
    with torch.no_grad():
        for i in range(len(ds)):
            ids, targets, mask = ds[i]
            ids = ids.unsqueeze(0).to(device)
            targets = targets.unsqueeze(0).to(device)
            logits = model(ids)
            loss = F.cross_entropy(
                logits.reshape(-1, logits.size(-1)),
                targets.reshape(-1),
                ignore_index=tok.pad_id,
                reduction="sum",
            )
            n = mask.sum().item()
            total_loss += loss.item()
            total_tokens += n
    ppl = torch.exp(torch.tensor(total_loss / max(total_tokens, 1))).item()
    print(f"perplexity on {len(test)} test samples: {ppl:.2f}")

    # 2. Sample generations
    print("\nsample generations on first 10 test prompts:")
    for i in range(min(10, len(test))):
        prompt = test[i]["input"]
        out = generate(
            model=model,
            tokenizer=tok,
            prompt=prompt,
            max_new_tokens=32,
            temperature=0.8,
            top_k=40,
            top_p=0.9,
            device=device,
        )
        expected = test[i]["output"]
        print(f"  [{i}] in: {prompt}")
        print(f"      exp: {expected}")
        print(f"      got: {out}")
        print()


if __name__ == "__main__":
    if len(sys.argv) != 4:
        print("usage: python -m tools.eval_cases <ckpt> <tokenizer> <data>", file=sys.stderr)
        sys.exit(1)
    main(sys.argv[1], sys.argv[2], sys.argv[3])

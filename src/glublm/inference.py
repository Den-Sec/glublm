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

    - temperature=0 -> greedy argmax
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
    min_new_tokens: int = 4,
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

    for step in range(max_new_tokens):
        ctx = ids_t[:, -max_ctx:]
        logits = model(ctx)[:, -1, :]

        # Suppress EOS/PAD during the minimum generation window
        if step < min_new_tokens:
            logits[:, eos] = float("-inf")
            logits[:, pad] = float("-inf")

        next_id = top_k_top_p_sample(logits.squeeze(0), temperature, top_k, top_p)
        ids_t = torch.cat([ids_t, next_id.view(1, 1)], dim=1)
        if step >= min_new_tokens and (next_id.item() == eos or next_id.item() == pad):
            break

    out_ids = ids_t.squeeze(0).tolist()
    if return_ids:
        return out_ids
    return tokenizer.decode(out_ids, skip_special_tokens=True)

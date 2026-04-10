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


def load_train_test(path: str) -> tuple[list[Sample], list[Sample]]:
    """Load a dataset that has separate train/test splits."""
    data = json.loads(Path(path).read_text(encoding="utf-8"))
    return data["train"], data["test"]


class GlubDataset(Dataset):
    """Single-turn conversations encoded as `<bos> input -> output <eos>`.

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

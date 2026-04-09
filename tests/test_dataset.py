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

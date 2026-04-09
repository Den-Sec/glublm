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
    # at most 3 new tokens beyond the prompt (generate encodes "prompt ->")
    prompt_len = len(tok.encode("a ->"))
    assert len(out_ids) <= prompt_len + 3

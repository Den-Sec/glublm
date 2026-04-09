"""Tests for the full GlubLM transformer model."""
from __future__ import annotations

import torch

from glublm.config import ModelConfig
from glublm.model import GlubLM, TransformerBlock


def test_transformer_block_shape():
    cfg = ModelConfig()
    block = TransformerBlock(cfg)
    x = torch.randn(2, 16, cfg.d_model)
    cos = torch.randn(16, cfg.head_dim)
    sin = torch.randn(16, cfg.head_dim)
    out = block(x, cos, sin)
    assert out.shape == x.shape


def test_glublm_forward_shape():
    cfg = ModelConfig(vocab_size=100, d_model=64, n_layers=2, n_heads=4, ffn_hidden=128, max_seq_len=16)
    model = GlubLM(cfg)
    ids = torch.randint(0, cfg.vocab_size, (2, 16))
    logits = model(ids)
    assert logits.shape == (2, 16, cfg.vocab_size)


def test_glublm_weight_tying():
    cfg = ModelConfig(vocab_size=50, d_model=32, n_layers=1, n_heads=2, ffn_hidden=64, max_seq_len=8)
    model = GlubLM(cfg)
    # LM head weight should be the same tensor as the embedding weight
    assert model.lm_head.weight is model.embedding.weight


def test_glublm_param_count_target():
    """Sanity check: the default ~15M config produces 10M-25M params."""
    cfg = ModelConfig()
    model = GlubLM(cfg)
    n_params = sum(p.numel() for p in model.parameters())
    assert 10_000_000 < n_params < 25_000_000, f"got {n_params:,} params"


def test_glublm_gradient_flows():
    cfg = ModelConfig(vocab_size=50, d_model=32, n_layers=2, n_heads=2, ffn_hidden=64, max_seq_len=8)
    model = GlubLM(cfg)
    ids = torch.randint(0, cfg.vocab_size, (1, 4))
    logits = model(ids)
    loss = logits.sum()
    loss.backward()
    for name, p in model.named_parameters():
        assert p.grad is not None, f"no grad for {name}"
        assert not torch.isnan(p.grad).any(), f"nan grad for {name}"


def test_glublm_rejects_long_sequences():
    cfg = ModelConfig(vocab_size=50, d_model=32, n_layers=1, n_heads=2, ffn_hidden=64, max_seq_len=4)
    model = GlubLM(cfg)
    ids = torch.randint(0, cfg.vocab_size, (1, 16))
    try:
        model(ids)
        raise AssertionError("should have raised")
    except ValueError as e:
        assert "max_seq_len" in str(e) or "seq_len" in str(e)


def test_glublm_overfits_single_batch():
    """End-to-end sanity: the model should be able to overfit a single small batch."""
    cfg = ModelConfig(vocab_size=32, d_model=64, n_layers=2, n_heads=4, ffn_hidden=128, max_seq_len=8)
    model = GlubLM(cfg)
    ids = torch.randint(0, cfg.vocab_size, (4, 8))
    targets = ids.clone()
    optim = torch.optim.AdamW(model.parameters(), lr=1e-2)
    for _ in range(200):
        logits = model(ids)
        loss = torch.nn.functional.cross_entropy(
            logits.reshape(-1, cfg.vocab_size), targets.reshape(-1)
        )
        optim.zero_grad()
        loss.backward()
        optim.step()
    assert loss.item() < 0.5, f"loss did not drop: {loss.item()}"

"""Tests for ModelConfig and TrainConfig."""
from __future__ import annotations

import pytest

from glublm.config import ModelConfig, TrainConfig


def test_model_config_defaults():
    cfg = ModelConfig()
    assert cfg.vocab_size == 5120
    assert cfg.d_model == 448
    assert cfg.n_layers == 8
    assert cfg.n_heads == 7
    assert cfg.d_model % cfg.n_heads == 0
    assert cfg.head_dim == 64
    assert cfg.ffn_hidden == 896
    assert cfg.max_seq_len == 48
    assert cfg.rope_theta == 10000.0
    assert cfg.dropout == 0.1
    assert cfg.tie_embeddings is True
    assert cfg.rms_norm_eps == 1e-5


def test_model_config_invalid_heads():
    with pytest.raises(ValueError, match="d_model must be divisible"):
        ModelConfig(d_model=448, n_heads=5)


def test_train_config_defaults():
    cfg = TrainConfig()
    assert cfg.lr == 3e-4
    assert cfg.batch_size == 64
    assert cfg.epochs == 4
    assert cfg.warmup_ratio == 0.05
    assert cfg.weight_decay == 0.1
    assert cfg.grad_clip == 1.0
    assert cfg.dtype == "bfloat16"
    assert cfg.seed == 0

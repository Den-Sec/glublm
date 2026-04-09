"""Tests for SwiGLU feed-forward network."""
from __future__ import annotations

import torch

from glublm.layers.swiglu import SwiGLU


def test_swiglu_shape():
    ffn = SwiGLU(d_model=448, d_hidden=896)
    x = torch.randn(2, 16, 448)
    out = ffn(x)
    assert out.shape == x.shape


def test_swiglu_has_three_projections():
    ffn = SwiGLU(d_model=64, d_hidden=128)
    # gate, up, down
    assert ffn.gate_proj.weight.shape == (128, 64)
    assert ffn.up_proj.weight.shape == (128, 64)
    assert ffn.down_proj.weight.shape == (64, 128)


def test_swiglu_no_bias():
    ffn = SwiGLU(d_model=32, d_hidden=64)
    assert ffn.gate_proj.bias is None
    assert ffn.up_proj.bias is None
    assert ffn.down_proj.bias is None


def test_swiglu_gradient_flows():
    ffn = SwiGLU(d_model=32, d_hidden=64)
    x = torch.randn(1, 4, 32, requires_grad=True)
    out = ffn(x)
    out.sum().backward()
    assert x.grad is not None
    assert not torch.isnan(x.grad).any()

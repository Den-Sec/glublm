"""Tests for multi-head attention with RoPE."""
from __future__ import annotations

import torch

from glublm.layers.attention import CausalSelfAttention
from glublm.layers.rope import RotaryEmbedding


def test_attention_shape():
    rope = RotaryEmbedding(head_dim=64, max_seq_len=48)
    attn = CausalSelfAttention(d_model=448, n_heads=7, dropout=0.0)
    x = torch.randn(2, 16, 448)
    cos, sin = rope(seq_len=16)
    out = attn(x, cos, sin)
    assert out.shape == x.shape


def test_attention_no_bias():
    attn = CausalSelfAttention(d_model=64, n_heads=4, dropout=0.0)
    assert attn.qkv_proj.bias is None
    assert attn.out_proj.bias is None


def test_attention_is_causal():
    """Token i should not attend to token j>i.

    We check this by making all token embeddings identical except the last.
    If attention is causal, every output position except the last should be identical;
    only the last position should differ.
    """
    rope = RotaryEmbedding(head_dim=16, max_seq_len=8)
    attn = CausalSelfAttention(d_model=32, n_heads=2, dropout=0.0)
    attn.eval()
    x = torch.randn(1, 4, 32)
    # Add a large perturbation at position 3 (the last). Positions 0-2 should
    # remain unaffected because they only attend to positions 0..i (where i<3).
    x_pert = x.clone()
    x_pert[0, 3] += 100.0
    cos, sin = rope(seq_len=4)
    out1 = attn(x, cos, sin)
    out2 = attn(x_pert, cos, sin)
    # Positions 0..2 must be identical
    torch.testing.assert_close(out1[:, :3], out2[:, :3], atol=1e-5, rtol=1e-5)
    # Position 3 must differ
    assert not torch.allclose(out1[:, 3], out2[:, 3])


def test_attention_gradient_flows():
    rope = RotaryEmbedding(head_dim=16, max_seq_len=8)
    attn = CausalSelfAttention(d_model=32, n_heads=2, dropout=0.0)
    x = torch.randn(1, 4, 32, requires_grad=True)
    cos, sin = rope(seq_len=4)
    out = attn(x, cos, sin)
    out.sum().backward()
    assert x.grad is not None
    assert not torch.isnan(x.grad).any()

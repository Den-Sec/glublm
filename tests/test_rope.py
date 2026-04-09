"""Tests for rotary position embedding (RoPE)."""
from __future__ import annotations

import torch

from glublm.layers.rope import RotaryEmbedding, apply_rope


def test_rope_shape():
    rope = RotaryEmbedding(head_dim=64, max_seq_len=48)
    cos, sin = rope(seq_len=48)
    assert cos.shape == (48, 64)
    assert sin.shape == (48, 64)


def test_rope_apply_preserves_shape():
    rope = RotaryEmbedding(head_dim=64, max_seq_len=48)
    cos, sin = rope(seq_len=16)
    q = torch.randn(2, 4, 16, 64)  # (batch, heads, seq, head_dim)
    k = torch.randn(2, 4, 16, 64)
    q_rot, k_rot = apply_rope(q, k, cos, sin)
    assert q_rot.shape == q.shape
    assert k_rot.shape == k.shape


def test_rope_preserves_norm():
    """Rotation is unitary - the per-vector norm should be unchanged."""
    rope = RotaryEmbedding(head_dim=32, max_seq_len=10)
    cos, sin = rope(seq_len=5)
    q = torch.randn(1, 2, 5, 32)
    q_rot, _ = apply_rope(q, q.clone(), cos, sin)
    torch.testing.assert_close(
        q.norm(dim=-1), q_rot.norm(dim=-1), atol=1e-5, rtol=1e-5
    )


def test_rope_position_zero_is_identity():
    """Position 0 has cos=1, sin=0, so RoPE should leave the vector unchanged."""
    rope = RotaryEmbedding(head_dim=16, max_seq_len=4)
    cos, sin = rope(seq_len=1)
    q = torch.randn(1, 1, 1, 16)
    q_rot, _ = apply_rope(q, q.clone(), cos, sin)
    torch.testing.assert_close(q, q_rot, atol=1e-6, rtol=1e-6)


def test_rope_different_positions_differ():
    rope = RotaryEmbedding(head_dim=16, max_seq_len=4)
    cos, sin = rope(seq_len=2)
    q = torch.ones(1, 1, 2, 16)
    q_rot, _ = apply_rope(q, q.clone(), cos, sin)
    # position 0 is identity, position 1 is not
    assert not torch.allclose(q_rot[:, :, 0], q_rot[:, :, 1])

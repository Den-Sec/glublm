"""Rotary Position Embedding (RoPE) from RoFormer (Su et al., 2021).

Applies a rotation in 2D subspaces of the attention query/key vectors,
encoding absolute position through a relative-position-aware rotation.
"""
from __future__ import annotations

import torch
from torch import nn


def _build_cos_sin(
    head_dim: int, max_seq_len: int, theta: float = 10000.0
) -> tuple[torch.Tensor, torch.Tensor]:
    """Precompute cos and sin tables of shape (max_seq_len, head_dim)."""
    assert head_dim % 2 == 0, "head_dim must be even for RoPE"
    # Inverse frequencies for each pair of dimensions
    inv_freq = 1.0 / (theta ** (torch.arange(0, head_dim, 2, dtype=torch.float32) / head_dim))
    positions = torch.arange(max_seq_len, dtype=torch.float32)
    freqs = torch.outer(positions, inv_freq)  # (seq, head_dim/2)
    # Repeat each frequency to match head_dim: [f0, f0, f1, f1, ...]
    cos = freqs.cos().repeat_interleave(2, dim=-1)  # (seq, head_dim)
    sin = freqs.sin().repeat_interleave(2, dim=-1)  # (seq, head_dim)
    return cos, sin


def _rotate_half(x: torch.Tensor) -> torch.Tensor:
    """Rotate pairs: (x0, x1, x2, x3, ...) -> (-x1, x0, -x3, x2, ...)."""
    x_even = x[..., 0::2]
    x_odd = x[..., 1::2]
    # Interleave back: [-x_odd, x_even]
    return torch.stack((-x_odd, x_even), dim=-1).flatten(-2)


def apply_rope(
    q: torch.Tensor,
    k: torch.Tensor,
    cos: torch.Tensor,
    sin: torch.Tensor,
) -> tuple[torch.Tensor, torch.Tensor]:
    """Apply rotary embeddings to q and k.

    Args:
        q: query tensor of shape (batch, heads, seq, head_dim)
        k: key tensor of shape (batch, heads, seq, head_dim)
        cos: cosine table of shape (seq, head_dim)
        sin: sine table of shape (seq, head_dim)

    Returns:
        (q_rot, k_rot) with the same shapes as the inputs.
    """
    # Reshape cos/sin for broadcasting: (1, 1, seq, head_dim)
    cos_b = cos.unsqueeze(0).unsqueeze(0)
    sin_b = sin.unsqueeze(0).unsqueeze(0)
    q_rot = (q * cos_b) + (_rotate_half(q) * sin_b)
    k_rot = (k * cos_b) + (_rotate_half(k) * sin_b)
    return q_rot, k_rot


class RotaryEmbedding(nn.Module):
    """Holds precomputed cos/sin tables for a given head_dim and max_seq_len."""

    def __init__(
        self,
        head_dim: int,
        max_seq_len: int,
        theta: float = 10000.0,
    ) -> None:
        super().__init__()
        cos, sin = _build_cos_sin(head_dim, max_seq_len, theta)
        self.register_buffer("cos_cached", cos, persistent=False)
        self.register_buffer("sin_cached", sin, persistent=False)
        self.max_seq_len = max_seq_len

    def forward(self, seq_len: int) -> tuple[torch.Tensor, torch.Tensor]:
        if seq_len > self.max_seq_len:
            raise ValueError(
                f"seq_len={seq_len} exceeds max_seq_len={self.max_seq_len}"
            )
        return self.cos_cached[:seq_len], self.sin_cached[:seq_len]

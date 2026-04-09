"""Causal multi-head self-attention with RoPE."""
from __future__ import annotations

import torch
import torch.nn.functional as F
from torch import nn

from glublm.layers.rope import apply_rope


class CausalSelfAttention(nn.Module):
    """Multi-head causal self-attention with rotary position embeddings.

    Uses a fused QKV projection and calls `scaled_dot_product_attention`
    which dispatches to Flash Attention on compatible GPUs.
    """

    def __init__(self, d_model: int, n_heads: int, dropout: float) -> None:
        super().__init__()
        if d_model % n_heads != 0:
            raise ValueError(f"d_model {d_model} not divisible by n_heads {n_heads}")
        self.d_model = d_model
        self.n_heads = n_heads
        self.head_dim = d_model // n_heads
        self.dropout = dropout

        self.qkv_proj = nn.Linear(d_model, 3 * d_model, bias=False)
        self.out_proj = nn.Linear(d_model, d_model, bias=False)

    def forward(
        self,
        x: torch.Tensor,
        cos: torch.Tensor,
        sin: torch.Tensor,
    ) -> torch.Tensor:
        b, t, c = x.shape
        qkv = self.qkv_proj(x)  # (b, t, 3*c)
        q, k, v = qkv.chunk(3, dim=-1)
        # Reshape to (b, n_heads, t, head_dim)
        q = q.view(b, t, self.n_heads, self.head_dim).transpose(1, 2)
        k = k.view(b, t, self.n_heads, self.head_dim).transpose(1, 2)
        v = v.view(b, t, self.n_heads, self.head_dim).transpose(1, 2)

        # Apply RoPE to Q and K
        q, k = apply_rope(q, k, cos, sin)

        # Scaled dot-product attention with causal mask
        attn_out = F.scaled_dot_product_attention(
            q,
            k,
            v,
            dropout_p=self.dropout if self.training else 0.0,
            is_causal=True,
        )
        # Reassemble heads -> (b, t, c)
        attn_out = attn_out.transpose(1, 2).contiguous().view(b, t, c)
        return self.out_proj(attn_out)

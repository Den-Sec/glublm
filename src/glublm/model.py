"""GlubLM: a decoder-only transformer with RoPE + SwiGLU + RMSNorm."""
from __future__ import annotations

import math

import torch
from torch import nn

from glublm.config import ModelConfig
from glublm.layers.attention import CausalSelfAttention
from glublm.layers.rmsnorm import RMSNorm
from glublm.layers.rope import RotaryEmbedding
from glublm.layers.swiglu import SwiGLU


class TransformerBlock(nn.Module):
    """Pre-norm transformer block: x + Attn(RMSNorm(x)) then x + FFN(RMSNorm(x))."""

    def __init__(self, cfg: ModelConfig) -> None:
        super().__init__()
        self.norm1 = RMSNorm(cfg.d_model, eps=cfg.rms_norm_eps)
        self.attn = CausalSelfAttention(
            d_model=cfg.d_model,
            n_heads=cfg.n_heads,
            dropout=cfg.dropout,
        )
        self.norm2 = RMSNorm(cfg.d_model, eps=cfg.rms_norm_eps)
        self.ffn = SwiGLU(d_model=cfg.d_model, d_hidden=cfg.ffn_hidden)
        self.dropout = nn.Dropout(cfg.dropout)

    def forward(
        self,
        x: torch.Tensor,
        cos: torch.Tensor,
        sin: torch.Tensor,
    ) -> torch.Tensor:
        x = x + self.dropout(self.attn(self.norm1(x), cos, sin))
        x = x + self.dropout(self.ffn(self.norm2(x)))
        return x


class GlubLM(nn.Module):
    """The full GlubLM language model."""

    def __init__(self, cfg: ModelConfig) -> None:
        super().__init__()
        self.cfg = cfg
        self.embedding = nn.Embedding(cfg.vocab_size, cfg.d_model)
        self.rope = RotaryEmbedding(
            head_dim=cfg.head_dim,
            max_seq_len=cfg.max_seq_len,
            theta=cfg.rope_theta,
        )
        self.blocks = nn.ModuleList([TransformerBlock(cfg) for _ in range(cfg.n_layers)])
        self.final_norm = RMSNorm(cfg.d_model, eps=cfg.rms_norm_eps)
        self.lm_head = nn.Linear(cfg.d_model, cfg.vocab_size, bias=False)
        self.dropout = nn.Dropout(cfg.dropout)

        # Weight tying
        if cfg.tie_embeddings:
            self.lm_head.weight = self.embedding.weight

        self.apply(self._init_weights)

    @staticmethod
    def _init_weights(module: nn.Module) -> None:
        if isinstance(module, nn.Linear):
            nn.init.normal_(module.weight, mean=0.0, std=0.02)
            if module.bias is not None:
                nn.init.zeros_(module.bias)
        elif isinstance(module, nn.Embedding):
            nn.init.normal_(module.weight, mean=0.0, std=0.02)

    def forward(self, ids: torch.Tensor) -> torch.Tensor:
        """Compute logits for token ids of shape (batch, seq)."""
        _, t = ids.shape
        if t > self.cfg.max_seq_len:
            raise ValueError(
                f"seq_len={t} exceeds cfg.max_seq_len={self.cfg.max_seq_len}"
            )
        x = self.embedding(ids) * math.sqrt(self.cfg.d_model)
        x = self.dropout(x)
        cos, sin = self.rope(seq_len=t)
        for block in self.blocks:
            x = block(x, cos, sin)
        x = self.final_norm(x)
        return self.lm_head(x)

    def num_parameters(self) -> int:
        return sum(p.numel() for p in self.parameters())

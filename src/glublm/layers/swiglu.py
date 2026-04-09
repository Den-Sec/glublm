"""SwiGLU feed-forward network (Shazeer 2020)."""
from __future__ import annotations

import torch
import torch.nn.functional as F
from torch import nn


class SwiGLU(nn.Module):
    """SwiGLU feed-forward: down_proj(silu(gate_proj(x)) * up_proj(x)).

    Used by Llama, PaLM. Typically +10-15% quality over ReLU FFN at
    comparable parameter counts.
    """

    def __init__(self, d_model: int, d_hidden: int) -> None:
        super().__init__()
        self.gate_proj = nn.Linear(d_model, d_hidden, bias=False)
        self.up_proj = nn.Linear(d_model, d_hidden, bias=False)
        self.down_proj = nn.Linear(d_hidden, d_model, bias=False)

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        return self.down_proj(F.silu(self.gate_proj(x)) * self.up_proj(x))

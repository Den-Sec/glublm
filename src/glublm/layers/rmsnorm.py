"""Root Mean Square Layer Normalization (Zhang & Sennrich, 2019)."""
from __future__ import annotations

import torch
from torch import nn


class RMSNorm(nn.Module):
    """RMSNorm: normalizes by the root mean square of the activation, no bias.

    Equivalent to LayerNorm without the mean-centering step.
    Used in Llama, T5, and other modern transformers.
    """

    def __init__(self, dim: int, eps: float = 1e-5) -> None:
        super().__init__()
        self.eps = eps
        self.weight = nn.Parameter(torch.ones(dim))

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        # Compute RMS over the last dimension in fp32 for numerical stability,
        # then cast back to the input dtype.
        orig_dtype = x.dtype
        x_fp32 = x.float()
        rms = x_fp32.pow(2).mean(dim=-1, keepdim=True).add(self.eps).rsqrt()
        return (x_fp32 * rms).to(orig_dtype) * self.weight

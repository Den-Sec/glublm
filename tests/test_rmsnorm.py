"""Tests for RMSNorm layer."""
from __future__ import annotations

import torch

from glublm.layers.rmsnorm import RMSNorm


def test_rmsnorm_shape():
    norm = RMSNorm(dim=448)
    x = torch.randn(2, 16, 448)
    out = norm(x)
    assert out.shape == x.shape


def test_rmsnorm_preserves_magnitude():
    norm = RMSNorm(dim=64)
    x = torch.ones(1, 4, 64) * 3.0
    out = norm(x)
    # With unit weight, RMSNorm(3*ones) should equal ones * weight (~ 1.0).
    torch.testing.assert_close(out, torch.ones_like(x), atol=1e-5, rtol=1e-5)


def test_rmsnorm_gradient_flows():
    norm = RMSNorm(dim=32)
    x = torch.randn(2, 8, 32, requires_grad=True)
    out = norm(x)
    out.sum().backward()
    assert x.grad is not None
    assert not torch.isnan(x.grad).any()


def test_rmsnorm_weight_param():
    norm = RMSNorm(dim=16)
    assert norm.weight.shape == (16,)
    torch.testing.assert_close(norm.weight, torch.ones(16))

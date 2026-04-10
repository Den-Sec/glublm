"""Tests for ONNX export."""
from __future__ import annotations

from pathlib import Path

import pytest
import torch

from glublm.config import ModelConfig
from glublm.model import GlubLM

onnx = pytest.importorskip("onnx", reason="onnx not installed")


def test_export_roundtrip(tmp_path: Path):
    from tools.export_onnx import export_to_onnx, verify_onnx

    cfg = ModelConfig(vocab_size=64, d_model=32, n_layers=1, n_heads=2, ffn_hidden=64, max_seq_len=16)
    model = GlubLM(cfg).eval()
    out = tmp_path / "tiny.onnx"
    export_to_onnx(model=model, out_path=str(out), max_seq_len=cfg.max_seq_len)
    assert out.exists()

    ids = torch.randint(0, cfg.vocab_size, (1, 8))
    ok, max_diff = verify_onnx(model, str(out), ids)
    assert ok, f"ONNX export mismatch: max diff = {max_diff}"

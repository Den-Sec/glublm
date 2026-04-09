"""End-to-end smoke test: train tiny model on fixture, then chat."""
from __future__ import annotations

from pathlib import Path

import torch
from click.testing import CliRunner

from glublm.cli import main

FIXTURE = Path(__file__).parent / "fixtures" / "tiny_dataset.json"


def test_end_to_end_train_and_chat(tmp_path: Path):
    """Train for a few epochs on the fixture, then run a single-shot chat."""
    runner = CliRunner()
    ckpt = tmp_path / "ckpt.pt"
    tok_path = tmp_path / "tok.json"

    # Use a minuscule config via env-less path: we rely on default cfg for vocab
    # but override epochs/batch via CLI. The fixture is tiny so 3 epochs is fine.
    result = runner.invoke(
        main,
        [
            "train",
            "--data", str(FIXTURE),
            "--out", str(ckpt),
            "--tokenizer-out", str(tok_path),
            "--epochs", "3",
            "--batch-size", "4",
            "--lr", "3e-3",
        ],
    )
    assert result.exit_code == 0, result.output
    assert ckpt.exists()
    assert tok_path.exists()

    # Single-shot chat
    result = runner.invoke(
        main,
        [
            "chat",
            "--ckpt", str(ckpt),
            "--tokenizer", str(tok_path),
            "--prompt", "hello",
            "--max-new-tokens", "8",
        ],
    )
    assert result.exit_code == 0, result.output
    assert len(result.output.strip()) > 0


def test_end_to_end_checkpoint_loads(tmp_path: Path):
    """Verify the saved checkpoint is torch-loadable and has the right keys."""
    runner = CliRunner()
    ckpt = tmp_path / "ckpt.pt"
    tok_path = tmp_path / "tok.json"
    result = runner.invoke(
        main,
        [
            "train",
            "--data", str(FIXTURE),
            "--out", str(ckpt),
            "--tokenizer-out", str(tok_path),
            "--epochs", "1",
            "--batch-size", "4",
            "--lr", "3e-3",
        ],
    )
    assert result.exit_code == 0
    state = torch.load(ckpt, map_location="cpu", weights_only=True)
    assert "model" in state
    assert "optim" in state
    assert "step" in state
    assert "epoch" in state
    assert state["epoch"] == 1

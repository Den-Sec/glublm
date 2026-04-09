"""Tests for the training loop."""
from __future__ import annotations

from pathlib import Path

import torch
from torch.utils.data import DataLoader

from glublm.config import ModelConfig, TrainConfig
from glublm.dataset import GlubDataset, load_samples
from glublm.model import GlubLM
from glublm.tokenizer import GlubTokenizer
from glublm.train import cosine_schedule, train_one_epoch

FIXTURE = Path(__file__).parent / "fixtures" / "tiny_dataset.json"


def test_cosine_schedule_warmup():
    # First step (step=0) -> near 0
    lr = cosine_schedule(step=0, total_steps=100, warmup_steps=10, base_lr=1e-3, min_lr=0.0)
    assert lr < 1e-4
    # Peak right at end of warmup
    lr = cosine_schedule(step=10, total_steps=100, warmup_steps=10, base_lr=1e-3, min_lr=0.0)
    torch.testing.assert_close(torch.tensor(lr), torch.tensor(1e-3), atol=1e-9, rtol=1e-9)
    # End -> near min
    lr = cosine_schedule(step=100, total_steps=100, warmup_steps=10, base_lr=1e-3, min_lr=0.0)
    assert lr < 1e-5


def test_train_one_epoch_reduces_loss():
    """Smoke test: training for one epoch on the tiny fixture should reduce loss."""
    samples = load_samples(str(FIXTURE))
    corpus = [f"{s['input']} {s['output']}" for s in samples]
    tok = GlubTokenizer.train(corpus * 30, vocab_size=256)
    mcfg = ModelConfig(
        vocab_size=tok.vocab_size,
        d_model=64,
        n_layers=2,
        n_heads=4,
        ffn_hidden=128,
        max_seq_len=48,
        dropout=0.0,
    )
    tcfg = TrainConfig(lr=3e-3, batch_size=4, epochs=1, dtype="float32")
    ds = GlubDataset(samples, tok, max_seq_len=48)
    loader = DataLoader(ds, batch_size=tcfg.batch_size, shuffle=True)
    model = GlubLM(mcfg)
    optim = torch.optim.AdamW(model.parameters(), lr=tcfg.lr)

    losses = []
    for _ in range(5):  # 5 epochs on tiny data
        _, epoch_losses = train_one_epoch(
            model,
            loader,
            optim,
            step=0,
            total_steps=5 * len(loader),
            warmup_steps=1,
            base_lr=tcfg.lr,
            grad_clip=1.0,
            device=torch.device("cpu"),
            dtype=torch.float32,
            pad_id=tok.pad_id,
        )
        losses.extend(epoch_losses)

    assert losses[-1] < losses[0], f"loss did not drop: start={losses[0]:.3f} end={losses[-1]:.3f}"

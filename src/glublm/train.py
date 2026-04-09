"""GlubLM training loop utilities."""
from __future__ import annotations

import math
from pathlib import Path

import torch
import torch.nn.functional as F
from torch import nn
from torch.utils.data import DataLoader


def cosine_schedule(
    step: int,
    total_steps: int,
    warmup_steps: int,
    base_lr: float,
    min_lr: float = 0.0,
) -> float:
    """Linear warmup + cosine decay to `min_lr`."""
    if step < warmup_steps:
        return base_lr * step / max(warmup_steps, 1)
    if step >= total_steps:
        return min_lr
    progress = (step - warmup_steps) / max(total_steps - warmup_steps, 1)
    return min_lr + 0.5 * (base_lr - min_lr) * (1.0 + math.cos(math.pi * progress))


def train_one_epoch(
    model: nn.Module,
    loader: DataLoader,
    optim: torch.optim.Optimizer,
    step: int,
    total_steps: int,
    warmup_steps: int,
    base_lr: float,
    grad_clip: float,
    device: torch.device,
    dtype: torch.dtype,
    pad_id: int,
) -> tuple[int, list[float]]:
    """Run one epoch of training. Returns (next_step, list_of_batch_losses)."""
    model.train()
    losses: list[float] = []
    for ids, targets, _ in loader:
        ids = ids.to(device)
        targets = targets.to(device)

        # Set LR per step
        lr = cosine_schedule(step, total_steps, warmup_steps, base_lr)
        for pg in optim.param_groups:
            pg["lr"] = lr

        with torch.autocast(device_type=device.type, dtype=dtype, enabled=(dtype != torch.float32)):
            logits = model(ids)
            loss = F.cross_entropy(
                logits.reshape(-1, logits.size(-1)),
                targets.reshape(-1),
                ignore_index=pad_id,
            )

        optim.zero_grad(set_to_none=True)
        loss.backward()
        torch.nn.utils.clip_grad_norm_(model.parameters(), grad_clip)
        optim.step()

        losses.append(loss.item())
        step += 1
    return step, losses


def save_checkpoint(
    path: str | Path,
    model: nn.Module,
    optim: torch.optim.Optimizer,
    step: int,
    epoch: int,
) -> None:
    Path(path).parent.mkdir(parents=True, exist_ok=True)
    torch.save(
        {
            "model": model.state_dict(),
            "optim": optim.state_dict(),
            "step": step,
            "epoch": epoch,
        },
        path,
    )


def load_checkpoint(
    path: str | Path,
    model: nn.Module,
    optim: torch.optim.Optimizer | None = None,
) -> tuple[int, int]:
    ckpt = torch.load(path, map_location="cpu", weights_only=True)
    model.load_state_dict(ckpt["model"])
    if optim is not None:
        optim.load_state_dict(ckpt["optim"])
    return ckpt["step"], ckpt["epoch"]

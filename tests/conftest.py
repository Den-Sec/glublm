"""Shared pytest fixtures for GlubLM tests."""
from __future__ import annotations

import random

import pytest
import torch


@pytest.fixture(autouse=True)
def _seed_everything() -> None:
    """Make every test deterministic."""
    random.seed(0)
    torch.manual_seed(0)
    if torch.cuda.is_available():
        torch.cuda.manual_seed_all(0)


@pytest.fixture
def device() -> torch.device:
    """Preferred compute device for tests."""
    return torch.device("cuda" if torch.cuda.is_available() else "cpu")

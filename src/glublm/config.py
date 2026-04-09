"""Configuration dataclasses for GlubLM model and training."""
from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True)
class ModelConfig:
    """Transformer architecture configuration.

    Defaults correspond to the ~15M parameter GlubLM target.
    """

    vocab_size: int = 5120
    d_model: int = 448
    n_layers: int = 8
    n_heads: int = 7
    ffn_hidden: int = 896
    max_seq_len: int = 48
    rope_theta: float = 10000.0
    dropout: float = 0.1
    tie_embeddings: bool = True
    rms_norm_eps: float = 1e-5

    def __post_init__(self) -> None:
        if self.d_model % self.n_heads != 0:
            raise ValueError(
                f"d_model must be divisible by n_heads "
                f"(got d_model={self.d_model}, n_heads={self.n_heads})"
            )

    @property
    def head_dim(self) -> int:
        return self.d_model // self.n_heads


@dataclass(frozen=True)
class TrainConfig:
    """Training hyperparameters."""

    lr: float = 3e-4
    batch_size: int = 64
    epochs: int = 4
    warmup_ratio: float = 0.05
    weight_decay: float = 0.1
    beta1: float = 0.9
    beta2: float = 0.95
    grad_clip: float = 1.0
    dtype: str = "bfloat16"
    seed: int = 0
    log_every: int = 50
    eval_every: int = 500
    save_every: int = 1000

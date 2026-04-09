"""Thin wrapper around HuggingFace `tokenizers` BPE."""
from __future__ import annotations

from collections.abc import Iterable

from tokenizers import Tokenizer
from tokenizers.models import BPE
from tokenizers.pre_tokenizers import ByteLevel
from tokenizers.processors import TemplateProcessing
from tokenizers.trainers import BpeTrainer

SPECIAL_TOKENS = ["<pad>", "<bos>", "<eos>", "<unk>"]


class GlubTokenizer:
    """BPE tokenizer used by GlubLM."""

    def __init__(self, backend: Tokenizer) -> None:
        self.backend = backend

    @classmethod
    def train(
        cls,
        corpus: Iterable[str],
        vocab_size: int = 5120,
        min_frequency: int = 2,
    ) -> GlubTokenizer:
        tok = Tokenizer(BPE(unk_token="<unk>"))
        tok.pre_tokenizer = ByteLevel(add_prefix_space=True)
        trainer = BpeTrainer(
            vocab_size=vocab_size,
            min_frequency=min_frequency,
            special_tokens=SPECIAL_TOKENS,
            show_progress=False,
        )
        tok.train_from_iterator(corpus, trainer=trainer)
        # Add BOS / EOS template
        bos_id = tok.token_to_id("<bos>")
        eos_id = tok.token_to_id("<eos>")
        tok.post_processor = TemplateProcessing(
            single="<bos> $A <eos>",
            pair=None,
            special_tokens=[("<bos>", bos_id), ("<eos>", eos_id)],
        )
        return cls(tok)

    @classmethod
    def from_file(cls, path: str) -> GlubTokenizer:
        return cls(Tokenizer.from_file(path))

    def save(self, path: str) -> None:
        self.backend.save(path)

    def encode(self, text: str, add_special_tokens: bool = True) -> list[int]:
        return self.backend.encode(text, add_special_tokens=add_special_tokens).ids

    def decode(self, ids: list[int], skip_special_tokens: bool = True) -> str:
        return self.backend.decode(ids, skip_special_tokens=skip_special_tokens)

    @property
    def vocab_size(self) -> int:
        return self.backend.get_vocab_size()

    @property
    def pad_id(self) -> int:
        return self.backend.token_to_id("<pad>")

    @property
    def bos_id(self) -> int:
        return self.backend.token_to_id("<bos>")

    @property
    def eos_id(self) -> int:
        return self.backend.token_to_id("<eos>")

    @property
    def unk_id(self) -> int:
        return self.backend.token_to_id("<unk>")

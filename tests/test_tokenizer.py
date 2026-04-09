"""Tests for the BPE tokenizer wrapper."""
from __future__ import annotations

from pathlib import Path

from glublm.tokenizer import GlubTokenizer


def test_tokenizer_trains_and_tokenizes(tmp_path: Path):
    corpus = [
        "hello i am a goldfish",
        "what was i saying",
        "water is warm today",
        "bubbles bubbles bubbles",
        "be a goldfish",
    ] * 20
    tok = GlubTokenizer.train(corpus, vocab_size=256)
    ids = tok.encode("hello goldfish")
    assert isinstance(ids, list)
    assert all(isinstance(i, int) for i in ids)
    assert len(ids) > 0
    decoded = tok.decode(ids)
    assert "hello" in decoded
    assert "goldfish" in decoded


def test_tokenizer_has_special_tokens(tmp_path: Path):
    corpus = ["a b c d e f g"] * 10
    tok = GlubTokenizer.train(corpus, vocab_size=128)
    assert tok.pad_id >= 0
    assert tok.bos_id >= 0
    assert tok.eos_id >= 0
    assert tok.unk_id >= 0


def test_tokenizer_save_load(tmp_path: Path):
    corpus = ["one two three four five six seven"] * 20
    tok = GlubTokenizer.train(corpus, vocab_size=128)
    path = tmp_path / "tok.json"
    tok.save(str(path))
    assert path.exists()
    loaded = GlubTokenizer.from_file(str(path))
    assert loaded.vocab_size == tok.vocab_size
    assert loaded.encode("one two") == tok.encode("one two")


def test_tokenizer_vocab_size():
    corpus = ["ab cd ef gh"] * 30
    tok = GlubTokenizer.train(corpus, vocab_size=64)
    assert tok.vocab_size <= 64

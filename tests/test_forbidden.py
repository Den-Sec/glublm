"""Tests for the forbidden-tokens filter."""
from __future__ import annotations

from pathlib import Path

FORBIDDEN = Path(__file__).parent.parent / "data_gen" / "forbidden_tokens.txt"


def test_forbidden_file_exists():
    assert FORBIDDEN.exists()


def test_forbidden_includes_core_football_terms():
    tokens = {line.strip().lower() for line in FORBIDDEN.read_text().splitlines() if line.strip() and not line.strip().startswith("#")}
    required = {"football", "soccer", "coach", "team", "match", "ball"}
    missing = required - tokens
    assert not missing, f"missing required forbidden terms: {missing}"


def test_forbidden_includes_ted_lasso_characters():
    tokens = {line.strip().lower() for line in FORBIDDEN.read_text().splitlines() if line.strip() and not line.strip().startswith("#")}
    required = {"richmond", "rebecca", "roy", "keeley", "nate", "jamie", "ted lasso"}
    missing = required - tokens
    assert not missing, f"missing character names: {missing}"

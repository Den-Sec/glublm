"""Tests for deterministic validation helpers."""
from __future__ import annotations

from data_gen.validate import (
    contains_forbidden,
    load_forbidden_tokens,
    quality_report,
    scan_for_forbidden,
)


def test_load_forbidden_tokens():
    tokens = load_forbidden_tokens()
    assert "football" in tokens
    assert "coach" in tokens
    # ensure comments/empty lines filtered
    assert "" not in tokens


def test_contains_forbidden_word_boundary():
    tokens = {"football", "coach"}
    assert contains_forbidden("we played football yesterday", tokens)
    assert contains_forbidden("COACH was there", tokens)  # case-insensitive
    assert not contains_forbidden("i love flakes", tokens)
    # word-boundary: "footballer" should also match since we substring match on word level
    # but "footage" should NOT trigger "foot"
    tokens2 = {"foot"}
    assert contains_forbidden("my foot hurts", tokens2)
    assert not contains_forbidden("footage of the goldfish", tokens2)  # substring but not word


def test_scan_for_forbidden_returns_indices():
    tokens = {"football"}
    samples = [
        {"input": "hi", "output": "glub"},
        {"input": "talk about football", "output": "what?"},
        {"input": "flakes", "output": "yummy"},
    ]
    bad = scan_for_forbidden(samples, tokens)
    assert bad == [1]


def test_quality_report():
    samples = [
        {"input": "a", "output": "b", "category": "cat1", "group": "goldfish_physical"},
        {"input": "c", "output": "d", "category": "cat1", "group": "goldfish_physical"},
        {"input": "e", "output": "f", "category": "cat2", "group": "ted_lasso_wisdom"},
    ]
    report = quality_report(samples)
    assert report["total"] == 3
    assert report["by_group"]["goldfish_physical"] == 2
    assert report["by_group"]["ted_lasso_wisdom"] == 1
    assert report["by_category"]["cat1"] == 2

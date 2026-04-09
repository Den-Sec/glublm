"""Deterministic validation and quality reporting for generated samples."""
from __future__ import annotations

import re
from collections import Counter
from pathlib import Path

FORBIDDEN_FILE = Path(__file__).parent / "forbidden_tokens.txt"


def load_forbidden_tokens() -> set[str]:
    if not FORBIDDEN_FILE.exists():
        raise FileNotFoundError(FORBIDDEN_FILE)
    tokens: set[str] = set()
    for raw in FORBIDDEN_FILE.read_text(encoding="utf-8").splitlines():
        line = raw.strip().lower()
        if not line or line.startswith("#"):
            continue
        tokens.add(line)
    return tokens


def contains_forbidden(text: str, tokens: set[str]) -> bool:
    """Return True if any forbidden token appears as a whole word in `text`."""
    lowered = text.lower()
    for tok in tokens:
        # Word boundary match: handles multi-word terms too ("ted lasso").
        pattern = r"\b" + re.escape(tok) + r"\b"
        if re.search(pattern, lowered):
            return True
    return False


def scan_for_forbidden(samples: list[dict], tokens: set[str]) -> list[int]:
    """Return indices of samples whose input or output contains a forbidden token."""
    bad: list[int] = []
    for i, s in enumerate(samples):
        blob = f"{s.get('input', '')} {s.get('output', '')}"
        if contains_forbidden(blob, tokens):
            bad.append(i)
    return bad


def quality_report(samples: list[dict]) -> dict:
    """Return a summary dict with counts per group, per category, and duplicates."""
    by_group = Counter(s.get("group", "unknown") for s in samples)
    by_category = Counter(s.get("category", "unknown") for s in samples)
    outputs = [s.get("output", "") for s in samples]
    unique_outputs = len(set(outputs))
    return {
        "total": len(samples),
        "by_group": dict(by_group),
        "by_category": dict(by_category),
        "unique_outputs": unique_outputs,
        "duplicate_rate": round(1 - unique_outputs / max(len(samples), 1), 4),
    }

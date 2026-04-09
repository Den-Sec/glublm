"""Merge multiple GlubLM dataset JSON files, dedupe, shuffle, report.

Usage:
    python -m tools.merge_datasets <in1.json> <in2.json> [...] --out <out.json>

Each input must be the standard format `{"samples": [...], "meta": {...}}`.
The output contains the union, deduplicated on (input.lower().strip(),
output.lower().strip()), shuffled with a fixed seed, plus a small summary.
"""
from __future__ import annotations

import argparse
import json
import random
import sys
from collections import Counter
from pathlib import Path


def load(path: str) -> list[dict]:
    data = json.loads(Path(path).read_text(encoding="utf-8"))
    return data["samples"]


def dedupe(samples: list[dict]) -> list[dict]:
    seen: set[tuple[str, str]] = set()
    unique: list[dict] = []
    for s in samples:
        key = (s["input"].strip().lower(), s["output"].strip().lower())
        if key in seen:
            continue
        seen.add(key)
        unique.append(s)
    return unique


def main() -> None:
    parser = argparse.ArgumentParser(description="Merge GlubLM datasets")
    parser.add_argument("inputs", nargs="+", help="Input dataset JSON files")
    parser.add_argument("--out", required=True, help="Output merged JSON path")
    parser.add_argument("--seed", type=int, default=42, help="Shuffle seed")
    args = parser.parse_args()

    all_samples: list[dict] = []
    per_source: list[tuple[str, int]] = []
    for path in args.inputs:
        samples = load(path)
        per_source.append((path, len(samples)))
        all_samples.extend(samples)

    before_dedupe = len(all_samples)
    unique = dedupe(all_samples)
    after_dedupe = len(unique)

    random.seed(args.seed)
    random.shuffle(unique)

    out_path = Path(args.out)
    out_path.parent.mkdir(parents=True, exist_ok=True)
    payload = {
        "samples": unique,
        "meta": {
            "sources": [{"path": p, "count": c} for p, c in per_source],
            "total_before_dedupe": before_dedupe,
            "total_after_dedupe": after_dedupe,
            "duplicates_removed": before_dedupe - after_dedupe,
            "seed": args.seed,
        },
    }
    out_path.write_text(json.dumps(payload, indent=2), encoding="utf-8")

    by_group = Counter(s.get("group", "unknown") for s in unique)
    by_category = Counter(s.get("category", "unknown") for s in unique)

    print(f"merged {len(args.inputs)} file(s) -> {out_path}")
    for p, c in per_source:
        print(f"  + {p}: {c}")
    print(f"total before dedupe: {before_dedupe}")
    print(f"total after dedupe: {after_dedupe} ({before_dedupe - after_dedupe} removed)")
    print()
    print("by group:")
    for g, c in sorted(by_group.items()):
        pct = (c / after_dedupe) * 100
        print(f"  {g}: {c} ({pct:.1f}%)")
    print()
    print("top 10 categories:")
    for cat, c in sorted(by_category.items(), key=lambda x: -x[1])[:10]:
        print(f"  {cat}: {c}")


if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        sys.exit(130)

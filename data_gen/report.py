"""Produce a human-readable quality report for a generated dataset."""
from __future__ import annotations

import json
import sys
from pathlib import Path

from data_gen.validate import load_forbidden_tokens, quality_report, scan_for_forbidden


def main(path: str) -> None:
    data = json.loads(Path(path).read_text(encoding="utf-8"))
    samples = data["samples"]
    forbidden = load_forbidden_tokens()
    bad_indices = scan_for_forbidden(samples, forbidden)
    report = quality_report(samples)

    print(f"=== Quality Report for {path} ===")
    print(f"total samples: {report['total']}")
    print(f"unique outputs: {report['unique_outputs']} ({(1 - report['duplicate_rate']) * 100:.1f}% unique)")
    print(f"duplicate rate: {report['duplicate_rate'] * 100:.2f}%")
    print()
    print("by group:")
    for g, c in sorted(report["by_group"].items()):
        print(f"  {g}: {c}")
    print()
    print("top 20 categories by count:")
    for cat, c in sorted(report["by_category"].items(), key=lambda x: -x[1])[:20]:
        print(f"  {cat}: {c}")
    print()
    print(f"forbidden-token violations: {len(bad_indices)}")
    if bad_indices:
        print("  first 5 offending samples:")
        for i in bad_indices[:5]:
            print(f"   [{i}] {samples[i]}")

    meta = data.get("meta", {})
    if meta:
        print()
        print("generation meta:")
        for k, v in meta.items():
            print(f"  {k}: {v}")


if __name__ == "__main__":
    if len(sys.argv) != 2:
        print("usage: python -m data_gen.report <dataset.json>", file=sys.stderr)
        sys.exit(1)
    main(sys.argv[1])

"""Deduplicate and split a raw dataset into train/test."""
from __future__ import annotations

import json
import random
import sys
from pathlib import Path


def main(in_path: str, out_path: str, seed: int = 0, test_frac: float = 0.1) -> None:
    data = json.loads(Path(in_path).read_text(encoding="utf-8"))
    samples = data["samples"]

    # Deduplicate on (input, output) pair
    seen: set[tuple[str, str]] = set()
    unique: list[dict] = []
    for s in samples:
        key = (s["input"].strip().lower(), s["output"].strip().lower())
        if key in seen:
            continue
        seen.add(key)
        unique.append(s)

    random.seed(seed)
    random.shuffle(unique)

    n_test = max(int(len(unique) * test_frac), 1)
    test = unique[:n_test]
    train = unique[n_test:]

    out = {
        "train": train,
        "test": test,
        "meta": {
            "original_count": len(samples),
            "unique_count": len(unique),
            "train_count": len(train),
            "test_count": len(test),
            "source": in_path,
        },
    }
    Path(out_path).write_text(json.dumps(out, indent=2), encoding="utf-8")
    print(f"in: {len(samples)} -> unique: {len(unique)} -> train: {len(train)}, test: {len(test)}")


if __name__ == "__main__":
    main(sys.argv[1], sys.argv[2])

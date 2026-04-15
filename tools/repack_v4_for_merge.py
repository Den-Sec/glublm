"""Repack v4 train/test bundle into flat {samples} for merge_datasets."""
from __future__ import annotations

import json
from pathlib import Path


def main() -> None:
    repo = Path(__file__).resolve().parent.parent
    src = repo / "data" / "glublm_55k_v4.json"
    dst = repo / "data" / "glublm_v4_samples.json"

    data = json.loads(src.read_text(encoding="utf-8"))
    samples = list(data["train"]) + list(data["test"])

    payload = {
        "samples": samples,
        "meta": {
            "source": "glublm_55k_v4.json",
            "note": "train+test concatenated for merge re-split",
            "count": len(samples),
        },
    }
    dst.write_text(json.dumps(payload, indent=2), encoding="utf-8")
    print(f"repacked {len(samples)} samples -> {dst}")


if __name__ == "__main__":
    main()

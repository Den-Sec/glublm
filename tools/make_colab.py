"""Generate notebooks/train_colab.ipynb from a template."""
from __future__ import annotations

import json
from pathlib import Path

CELLS = [
    ("markdown", "# Train GlubLM on Colab T4\n\nReproduce the full training run in ~30 minutes."),
    ("code", "!pip install glublm huggingface_hub"),
    ("code", """\
from huggingface_hub import hf_hub_download
import json
from pathlib import Path

# Download the dataset
tok_path = hf_hub_download("DenSec02/glublm-18m", "tokenizer.json")
data_path = hf_hub_download("DenSec02/glublm-60k-ted", "glublm_60k.json", repo_type="dataset")
print(f"tokenizer: {tok_path}")
print(f"dataset: {data_path}")
"""),
    ("code", """\
!glublm train \\
  --data "$data_path" \\
  --out glublm_60k_15ep.pt \\
  --tokenizer-out tokenizer_60k.json \\
  --epochs 15 \\
  --batch-size 64 \\
  --lr 3e-4
"""),
    ("code", """\
!glublm chat \\
  --ckpt glublm_60k_15ep.pt \\
  --tokenizer tokenizer_60k.json \\
  --prompt "hello goldfish"
"""),
]


def main() -> None:
    nb = {
        "cells": [
            {
                "cell_type": kind,
                "metadata": {},
                "source": content,
                **({"outputs": [], "execution_count": None} if kind == "code" else {}),
            }
            for kind, content in CELLS
        ],
        "metadata": {
            "kernelspec": {"display_name": "Python 3", "language": "python", "name": "python3"},
            "accelerator": "GPU",
            "colab": {"gpuType": "T4"},
        },
        "nbformat": 4,
        "nbformat_minor": 5,
    }
    out = Path("notebooks/train_colab.ipynb")
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(nb, indent=2), encoding="utf-8")
    print(f"wrote {out}")


if __name__ == "__main__":
    main()

"""Push the GlubLM dataset to HuggingFace Hub."""
from __future__ import annotations

import argparse
import os

from dotenv import load_dotenv
from huggingface_hub import HfApi, create_repo


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--data", required=True, help="path to glublm_60k.json")
    ap.add_argument("--card", default="hf/dataset_card.md")
    ap.add_argument("--repo", default="DenSec02/glublm-60k-ted")
    ap.add_argument("--private", action="store_true")
    args = ap.parse_args()

    load_dotenv()
    token = os.environ["HF_TOKEN"]
    api = HfApi(token=token)

    create_repo(
        repo_id=args.repo,
        repo_type="dataset",
        exist_ok=True,
        private=args.private,
        token=token,
    )

    files = {
        "glublm_60k.json": args.data,
        "README.md": args.card,
    }
    for remote, local in files.items():
        print(f"uploading {local} -> {args.repo}/{remote}")
        api.upload_file(
            path_or_fileobj=local,
            path_in_repo=remote,
            repo_id=args.repo,
            repo_type="dataset",
            token=token,
        )
    print(f"done. view at https://huggingface.co/datasets/{args.repo}")


if __name__ == "__main__":
    main()

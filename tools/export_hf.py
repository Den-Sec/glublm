"""Push GlubLM model weights, tokenizer, model card, and ONNX to HuggingFace Hub."""
from __future__ import annotations

import argparse
import os
from pathlib import Path

import torch
from dotenv import load_dotenv
from huggingface_hub import HfApi, create_repo
from safetensors.torch import save_model


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--ckpt", required=True)
    ap.add_argument("--tokenizer", required=True)
    ap.add_argument("--onnx", required=True)
    ap.add_argument("--model-card", default="hf/model_card.md")
    ap.add_argument("--repo", default="DenSec02/glublm-36m")
    ap.add_argument("--private", action="store_true")
    args = ap.parse_args()

    load_dotenv()
    token = os.environ["HF_TOKEN"]
    api = HfApi(token=token)

    create_repo(repo_id=args.repo, repo_type="model", exist_ok=True, private=args.private, token=token)

    # Convert torch checkpoint to safetensors (handles weight-tied params)
    from glublm.config import ModelConfig
    from glublm.model import GlubLM
    from glublm.tokenizer import GlubTokenizer

    tok = GlubTokenizer.from_file(args.tokenizer)
    cfg = ModelConfig(vocab_size=tok.vocab_size)
    model = GlubLM(cfg)
    state = torch.load(args.ckpt, map_location="cpu", weights_only=True)
    model.load_state_dict(state.get("model", state))
    tmp_safetensors = Path("checkpoints/model.safetensors")
    save_model(model, str(tmp_safetensors))

    files = {
        "model.safetensors": str(tmp_safetensors),
        "tokenizer.json": args.tokenizer,
        "model.onnx": args.onnx,
        "README.md": args.model_card,
    }
    for remote, local in files.items():
        print(f"uploading {local} -> {args.repo}/{remote}")
        api.upload_file(
            path_or_fileobj=local,
            path_in_repo=remote,
            repo_id=args.repo,
            repo_type="model",
            token=token,
        )
    print(f"done. view at https://huggingface.co/{args.repo}")


if __name__ == "__main__":
    main()

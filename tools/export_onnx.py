"""Export a trained GlubLM checkpoint to ONNX and verify numerical equivalence."""
from __future__ import annotations

import argparse
from pathlib import Path

import torch

from glublm.config import ModelConfig
from glublm.model import GlubLM
from glublm.tokenizer import GlubTokenizer


def export_to_onnx(
    *,
    model: GlubLM,
    out_path: str,
    max_seq_len: int,
    opset: int = 17,
) -> None:
    """Trace and export the model to ONNX with dynamic sequence length."""
    model.eval()
    dummy_ids = torch.randint(0, model.cfg.vocab_size, (1, max_seq_len), dtype=torch.long)
    Path(out_path).parent.mkdir(parents=True, exist_ok=True)

    torch.onnx.export(
        model,
        (dummy_ids,),
        out_path,
        input_names=["input_ids"],
        output_names=["logits"],
        dynamic_axes={
            "input_ids": {0: "batch", 1: "seq"},
            "logits": {0: "batch", 1: "seq"},
        },
        opset_version=opset,
        do_constant_folding=True,
    )


def verify_onnx(
    model: GlubLM,
    onnx_path: str,
    sample_ids: torch.Tensor,
    atol: float = 1e-3,
) -> tuple[bool, float]:
    """Run the PyTorch model and the ONNX model on the same input and compare logits."""
    import numpy as np
    import onnxruntime as ort

    model.eval()
    with torch.no_grad():
        torch_logits = model(sample_ids).cpu().numpy()

    sess = ort.InferenceSession(onnx_path, providers=["CPUExecutionProvider"])
    onnx_logits = sess.run(None, {"input_ids": sample_ids.cpu().numpy()})[0]

    max_diff = float(np.abs(torch_logits - onnx_logits).max())
    return (max_diff < atol), max_diff


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--ckpt", required=True)
    ap.add_argument("--tokenizer", required=True)
    ap.add_argument("--out", required=True)
    args = ap.parse_args()

    tok = GlubTokenizer.from_file(args.tokenizer)
    cfg = ModelConfig(vocab_size=tok.vocab_size)
    model = GlubLM(cfg)
    state = torch.load(args.ckpt, map_location="cpu", weights_only=True)
    model.load_state_dict(state.get("model", state))

    export_to_onnx(model=model, out_path=args.out, max_seq_len=cfg.max_seq_len)
    ids = torch.randint(0, tok.vocab_size, (1, cfg.max_seq_len))
    ok, max_diff = verify_onnx(model, args.out, ids)
    print(f"exported -> {args.out} | numerical ok={ok} | max diff={max_diff:.6f}")


if __name__ == "__main__":
    main()

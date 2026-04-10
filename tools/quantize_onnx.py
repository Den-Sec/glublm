"""Quantize an ONNX model to uint8 for browser deployment."""
from __future__ import annotations

import argparse
from pathlib import Path

from onnxruntime.quantization import QuantType, quantize_dynamic


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--inp", required=True, help="input ONNX model path")
    ap.add_argument("--out", required=True, help="output quantized ONNX path")
    args = ap.parse_args()

    Path(args.out).parent.mkdir(parents=True, exist_ok=True)
    quantize_dynamic(
        model_input=args.inp,
        model_output=args.out,
        weight_type=QuantType.QUInt8,
    )
    size_mb = Path(args.out).stat().st_size / 1e6
    print(f"quantized -> {args.out} ({size_mb:.2f} MB)")


if __name__ == "__main__":
    main()

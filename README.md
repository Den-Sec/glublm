# GlubLM

[![License](https://img.shields.io/badge/license-AGPL--3.0-blue)](LICENSE)

> *the language model that already forgot this sentence*

**GlubLM** is an 18M-parameter transformer that plays a goldfish with a 10-second memory. Inspired by [GuppyLM](https://github.com/arman-bd/guppylm) and Ted Lasso's "be a goldfish" meditation on the happiest animal on earth, GlubLM has a **hard 48-token context window** - it *literally* cannot remember what was just said.

Unlike GuppyLM, GlubLM:

- uses modern transformer components: **RoPE + SwiGLU + RMSNorm**
- was trained on a **60K LLM-generated dataset** produced by a team of four Claude agents, not hand-authored templates
- runs in your browser via quantized ONNX (~21 MB) - [try the demo](https://den-sec.github.io/glublm/)

## Quick start

### Browser
Open the [demo](https://den-sec.github.io/glublm/). Everything runs client-side - no backend.

### Python

```bash
pip install glublm
glublm chat \
  --ckpt /path/to/glublm_60k_15ep.pt \
  --tokenizer /path/to/tokenizer_60k.json \
  --prompt "hello"
```

Or download the model from HuggingFace:

```python
from huggingface_hub import hf_hub_download
ckpt = hf_hub_download("DenSec02/glublm-18m", "model.safetensors")
tok  = hf_hub_download("DenSec02/glublm-18m", "tokenizer.json")
```

## Train from scratch

1. Clone this repo
2. `pip install -e ".[dev,deploy]"`
3. Generate the dataset (see [`docs/DATASET.md`](docs/DATASET.md))
4. Train: `glublm train --data data/glublm_60k.json --epochs 15 --batch-size 64 --lr 3e-4`
5. See [`docs/TRAINING.md`](docs/TRAINING.md) for details

## Architecture

- ~18.4M parameters, 8 decoder-only transformer blocks
- hidden 448, 7 attention heads, SwiGLU FFN (896x2), RMSNorm
- RoPE position encoding
- Vocabulary: 5,120 BPE
- Max context: **48 tokens** (hard cap - the physical 10-second memory)
- Test perplexity: 12.14

Details: [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md)

## Comparison vs GuppyLM

See [`docs/COMPARISONS.md`](docs/COMPARISONS.md) for the empirical comparison. Short version: GlubLM tests the hypothesis that modern ops help at sub-20M scale, which is something GuppyLM explicitly decided against.

## Links

- [HuggingFace model](https://huggingface.co/DenSec02/glublm-18m)
- [HuggingFace dataset](https://huggingface.co/datasets/DenSec02/glublm-60k-ted)
- [HuggingFace Space](https://huggingface.co/spaces/DenSec02/glublm)
- [Browser demo](https://den-sec.github.io/glublm/)

## Credits

- [GuppyLM](https://github.com/arman-bd/guppylm) by Arman BD - the original tiny fish-persona model
- Ted Lasso - the "be a goldfish" philosophy
- Anthropic Claude - the multi-agent dataset generation team

## License

AGPL-3.0 - see [`LICENSE`](LICENSE).

## Citation

```bibtex
@software{glublm_2026,
  author = {Sepede, Dennis},
  title = {GlubLM: an 18M goldfish language model with a 10-second memory},
  year = {2026},
  url = {https://github.com/Den-Sec/glublm}
}
```

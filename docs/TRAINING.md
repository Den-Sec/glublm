# Training GlubLM

## Local training (recommended - RTX 3060 or better)

```bash
# 1. Install
pip install glublm

# 2. Verify CUDA
python -c "import torch; print(torch.cuda.is_available())"  # must be True

# 3. Train
glublm train \
  --data data/glublm_60k.json \
  --out checkpoints/glublm_60k_15ep.pt \
  --tokenizer-out checkpoints/tokenizer_60k.json \
  --epochs 15 \
  --batch-size 64 \
  --lr 3e-4
```

Expected wall time on RTX 3060: ~30-45 minutes for 15 epochs. VRAM usage ~3 GB.

## Hyperparameters

| Knob | Default | Notes |
|------|---------|-------|
| lr | 3e-4 | peak, cosine schedule |
| warmup_ratio | 0.05 | of total steps |
| batch_size | 64 | fits 3GB VRAM on 3060 |
| epochs | 15 | loss 3.18 -> 1.64 |
| weight_decay | 0.1 | AdamW |
| b1, b2 | 0.9, 0.95 | |
| grad_clip | 1.0 | |
| dtype | bfloat16 | Ampere native, FP32 on CPU |
| dropout | 0.1 | on embedding and between sublayers |

## Expected results

- Final train loss: ~1.64
- Test perplexity: ~12.14
- Model parameters: 18,357,696

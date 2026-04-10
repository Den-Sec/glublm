# GlubLM Architecture

Decoder-only transformer, 8 layers x hidden 640, ~36.1M parameters, trained in BF16 on a single RTX 3060.

## Stack (per block)

```
input -> RMSNorm -> CausalSelfAttention (RoPE on Q/K) -> residual
      -> RMSNorm -> SwiGLU FFN -> residual -> output
```

Pre-norm layout (as in Llama). All linears have no bias. Weight-tied LM head.

## Why these choices

See [`COMPARISONS.md`](COMPARISONS.md) for the empirical motivation. Short version:

- **RoPE**: better length generalization, standard in modern small-LM stacks
- **SwiGLU**: +10-15% quality over ReLU at comparable param counts (Shazeer 2020)
- **RMSNorm**: simpler and faster than LayerNorm, standard in Llama-family
- **96-token context**: makes "10-second memory" an *architectural* constraint, not a metaphor. Forgetting is the feature.

## Parameter budget (at default config)

| Component | Params |
|-----------|--------|
| Embedding (5120 x 640) | 3,276,800 |
| Each block: Attention QKV + O (4 x 640^2) | 1,638,400 |
| Each block: SwiGLU (3 x 640 x 1280) | 2,457,600 |
| Each block: 2x RMSNorm | 1,280 |
| **Per-block total** | ~4.10M |
| 8 blocks | ~32.78M |
| Final RMSNorm | 640 |
| LM head (tied with embedding) | 0 |
| **Total** | ~36.1M |

Use `GlubLM.num_parameters()` to verify the exact count for any config.

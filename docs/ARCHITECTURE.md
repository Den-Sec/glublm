# GlubLM Architecture

Decoder-only transformer, 8 layers x hidden 448, ~18.4M parameters, trained in BF16 on a single RTX 3060.

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
- **48-token context**: makes "10-second memory" an *architectural* constraint, not a metaphor. Forgetting is the feature.

## Parameter budget (at default config)

| Component | Params |
|-----------|--------|
| Embedding (5120 x 448) | 2,293,760 |
| Each block: Attention QKV + O (4 x 448^2) | 802,816 |
| Each block: SwiGLU (3 x 448 x 896) | 1,204,224 |
| Each block: 2x RMSNorm | 896 |
| **Per-block total** | ~2.01M |
| 8 blocks | ~16.06M |
| Final RMSNorm | 448 |
| LM head (tied with embedding) | 0 |
| **Total** | ~18.4M |

Use `GlubLM.num_parameters()` to verify the exact count for any config.

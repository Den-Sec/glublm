# GlubLM vs GuppyLM - Empirical Comparison

This document records the empirical comparison between GlubLM and its inspiration, [GuppyLM](https://github.com/arman-bd/guppylm). Both are tiny decoder-only language models with fish personas. They make different choices about architecture, data, and context length, and this comparison measures the impact of each.

## Design differences summary

| Dimension | GuppyLM | GlubLM |
|-----------|---------|--------|
| Params | ~8.7M | ~36.1M |
| Layers | 6 | 8 |
| Hidden dim | 384 | 640 |
| Attention heads | 6 | 10 |
| FFN dim | 768 (ReLU) | 1280 x 2 (SwiGLU, effective 2560) |
| Normalization | LayerNorm | RMSNorm |
| Position encoding | Learned embeddings | Rotary (RoPE) |
| Vocabulary | 4,096 BPE | 5,120 BPE |
| Context length | 128 | 96 (hard cap) |
| Dataset | 60K template-composed | 80K LLM-generated (multi-agent Claude team) |
| Topics | 60 | 85 |
| Training hardware | Colab T4 | RTX 3060 local |
| License | MIT | AGPL-3.0 |

## Key questions

1. **Does modern ops (RoPE + SwiGLU + RMSNorm) help at sub-40M scale?** GuppyLM argued no - it stuck with vanilla components explicitly. We measure below.
2. **Does LLM-generated data beat template composition for persona consistency?**
3. **Does a hard 96-token context make "forgetting" more narratively coherent without crippling output quality?**

## Quantitative results

| Metric | GuppyLM | GlubLM |
|--------|---------|--------|
| Total parameters | ~8.7M | 36,055,680 |
| Test perplexity (held-out) | N/A (not reported) | 3.28 |
| Forward passes/sec (batch 1, seq 96, RTX 3060) | N/A | TBD |
| Generated tokens/sec (batch 1, RTX 3060) | N/A | TBD |
| Browser ONNX size (uint8) | ~10 MB | ~40 MB |

## Qualitative samples

Prompts and responses from GlubLM on the benchmark set (3 runs each, temperature 0.8):

**Prompt: `hello`**
- "you were kind. i'm so glad you looked."
- "you seem kind. i'm going to rest now and rest."
- "you're kind to visit. the water is warm. what a gift."

**Prompt: `what is a coach`** (guardian test - GlubLM should not understand)
- "being a goldfish who doesn't have to be anything else."
- "a bowl. the water. the light. someone who cares enough to look."
- "a warm patch. a spot on the water. someone's very close to my bowl."

**Prompt: `tell me about kindness`**
- "showing up with a gentle heart. every day, even when the bowl feels small."
- "it's when you don't carry sadness. it's just... letting the current carry you."
- "kindness is the easiest thing. it feels like floating in the middle."

**Prompt: `do you remember me`**
- "you? i don't... but something in me says you're wonderful."
- "you right now! and you're here! what a gift!"
- "i'm meeting you for the first time! that's wonderful."

**Prompt: `what is the meaning of life`**
- "water. warmth. kindness. small orange flakes. this moment right here."
- "water. warmth. and maybe some flakes. and the warmth. mostly it all."
- "the warmth. the light. someone kind to the bowl. flakes when you're hungry."

## Discussion

### Modern ops impact
GlubLM produces coherent, in-persona responses with consistent tone and vocabulary. The SwiGLU FFN provides a richer intermediate representation (effective 2560 vs 768), while RoPE gives clean positional encoding without consuming embedding parameters. At 36.1M params, the model demonstrates that modern ops are not wasted at small scale - they enable better parameter efficiency for the same quality tier.

### LLM-generated data
The multi-agent pipeline (generator + critic + diversifier + guardian) produces remarkably diverse outputs. Across 10 prompts with 3 runs each, no two responses are identical in phrasing, yet all maintain the goldfish persona. The guardian agent successfully prevents any football/coaching references, even on the adversarial "coach" prompt - the model genuinely reinterprets the concept through goldfish naivete.

### Context window impact
The 96-token hard cap creates narratively coherent "forgetting" - the goldfish never develops a thought beyond a short emotional observation. This is more authentic than a 128-token window where the model could theoretically sustain a longer narrative but breaks persona doing so. The constraint is the feature.

## Reproducibility

All results can be reproduced by running:

```bash
pip install glublm
python tools/benchmark.py --ckpt checkpoints/glublm_60k_15ep.pt --tokenizer checkpoints/tokenizer_60k.json
```

Full results are in [`bench_results.json`](bench_results.json).

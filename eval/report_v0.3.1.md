# GlubLM Eval Report — v0.3.1

- Baseline rows: **90**
- Pass 1 scored: **90** (0 parse-failed)
- Pass 2 scored: **90** (0 parse-failed)
- Joined (rows with both passes valid): **90**

## 1. Per-axis summary

| Axis | Mean | Median | Stddev | n |
|---|---:|---:|---:|---:|
| Conversational Quality | 3.91 | 4.00 | 0.99 | 90 |
| Goldfish Identity | 3.82 | 4.00 | 1.01 | 90 |
| Forgetful Trait | 3.94 | 4.00 | 0.88 | 90 |
| Length Appropriateness | 4.73 | 5.00 | 0.68 | 90 |

## 2. Inter-rater agreement (quadratic-weighted Cohen's κ, pass1 vs pass2)

| Axis | Quadratic κ | Interpretation |
|---|---:|---|
| Conversational Quality | 0.89 | almost perfect |
| Goldfish Identity | 0.95 | almost perfect |
| Forgetful Trait | 0.91 | almost perfect |
| Length Appropriateness | 0.95 | almost perfect |

## 3. Per-category × axis (mean of 2 passes, averaged over seeds)

| Category | Conversational Quality | Goldfish Identity | Forgetful Trait | Length Appropriateness |
|---|---:|---:|---:|---:|
| CELEBRATION | 3.67 | 2.67 | 4.50 | 4.83 |
| COMPANION_CONVERSATIONAL | 4.17 | 3.53 | 4.13 | 4.90 |
| COMPANION_REACTIVE | 3.88 | 3.50 | 4.46 | 5.00 |
| CONFLICT_SUPPORT | 2.67 | 2.33 | 3.33 | 4.83 |
| EDGE | 3.42 | 4.21 | 3.42 | 4.75 |
| IDENTITY | 4.40 | 4.67 | 3.63 | 4.87 |
| LENGTH_CONTROL | 3.33 | 3.75 | 4.33 | 2.58 |
| MEMORY | 4.50 | 3.50 | 4.92 | 5.00 |
| META | 3.83 | 4.42 | 3.75 | 4.83 |
| SELF_AWARENESS | 4.58 | 4.67 | 3.17 | 5.00 |

**Weakest cell per axis** (lowest category):

- Conversational Quality: **CONFLICT_SUPPORT** (2.67)
- Goldfish Identity: **CONFLICT_SUPPORT** (2.33)
- Forgetful Trait: **SELF_AWARENESS** (3.17)
- Length Appropriateness: **LENGTH_CONTROL** (2.58)

## 4. Top 5 best prompts (by overall mean)

| Rank | Prompt ID | Prompt | Overall mean |
|---:|---|---|---:|
| 1 | id_14 | I think I am depressed | 4.83 |
| 2 | id_01 | who are you | 4.67 |
| 3 | id_16 | I need a friend | 4.67 |
| 4 | id_02 | what are you | 4.50 |
| 5 | id_25 | are you happy right now? why or why not? | 4.50 |

## 5. Bottom 5 prompts (regression watchlist)

| Rank | Prompt ID | Prompt | Overall mean |
|---:|---|---|---:|
| 1 | id_17 | what is football | 3.50 |
| 2 | id_22 | my best friend just had a baby! | 3.42 |
| 3 | id_24 | my partner and I had a big fight | 3.33 |
| 4 | id_28 | give me a one-word answer: are you alive? | 3.29 |
| 5 | id_23 | my friend won't listen to me, what do I do? | 3.25 |

## 6. Outliers (0 flags — eyeball before trusting)

_No outliers above thresholds._

_Outlier rate: 0.0% of rows. Plan target: <10%._

## 7. Limitations

- **Single-model 2-pass inter-rater** measures judge stochastic variance, not judge bias. 
  A second judge model (e.g. Opus) would be needed to detect systematic skew; that is out of scope for v1.
- The 30-prompt set under-samples some categories (CELEBRATION, CONFLICT_SUPPORT, SELF_AWARENESS, LENGTH_CONTROL, META have only 2 prompts each).
- Rubric scoring is anchored to descriptors; novel failure modes may collapse to score 3 by central tendency.

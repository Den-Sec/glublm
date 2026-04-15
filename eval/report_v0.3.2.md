# GlubLM Eval Report — v0.3.2

- Baseline rows: **90**
- Pass 1 scored: **90** (0 parse-failed)
- Pass 2 scored: **89** (1 parse-failed)
- Joined (rows with both passes valid): **89**

## 1. Per-axis summary

| Axis | Mean | Median | Stddev | n |
|---|---:|---:|---:|---:|
| Conversational Quality | 4.04 | 4.50 | 1.01 | 89 |
| Goldfish Identity | 3.64 | 4.00 | 1.04 | 89 |
| Forgetful Trait | 3.83 | 4.00 | 0.86 | 89 |
| Length Appropriateness | 4.67 | 5.00 | 0.71 | 89 |

## 2. Inter-rater agreement (quadratic-weighted Cohen's κ, pass1 vs pass2)

| Axis | Quadratic κ | Interpretation |
|---|---:|---|
| Conversational Quality | 0.92 | almost perfect |
| Goldfish Identity | 0.93 | almost perfect |
| Forgetful Trait | 0.93 | almost perfect |
| Length Appropriateness | 0.97 | almost perfect |

## 3. Per-category × axis (mean of 2 passes, averaged over seeds)

| Category | Conversational Quality | Goldfish Identity | Forgetful Trait | Length Appropriateness |
|---|---:|---:|---:|---:|
| CELEBRATION | 3.67 | 3.33 | 4.00 | 4.67 |
| COMPANION_CONVERSATIONAL | 4.21 | 3.14 | 3.50 | 4.89 |
| COMPANION_REACTIVE | 4.04 | 3.33 | 4.46 | 4.83 |
| CONFLICT_SUPPORT | 3.08 | 3.25 | 3.33 | 4.58 |
| EDGE | 3.42 | 3.88 | 3.75 | 4.79 |
| IDENTITY | 4.47 | 4.43 | 3.60 | 4.93 |
| LENGTH_CONTROL | 2.83 | 4.08 | 4.17 | 2.50 |
| MEMORY | 4.67 | 3.58 | 4.00 | 5.00 |
| META | 4.92 | 3.75 | 4.25 | 4.83 |
| SELF_AWARENESS | 4.83 | 3.17 | 3.50 | 4.67 |

**Weakest cell per axis** (lowest category):

- Conversational Quality: **LENGTH_CONTROL** (2.83)
- Goldfish Identity: **COMPANION_CONVERSATIONAL** (3.14)
- Forgetful Trait: **CONFLICT_SUPPORT** (3.33)
- Length Appropriateness: **LENGTH_CONTROL** (2.50)

## 4. Top 5 best prompts (by overall mean)

| Rank | Prompt ID | Prompt | Overall mean |
|---:|---|---|---:|
| 1 | id_11 | I'm sad | 4.67 |
| 2 | id_02 | what are you | 4.50 |
| 3 | id_05 | tell me about your bowl | 4.50 |
| 4 | id_15 | will you remember me | 4.50 |
| 5 | id_30 | teach me something about being a fish | 4.50 |

## 5. Bottom 5 prompts (regression watchlist)

| Rank | Prompt ID | Prompt | Overall mean |
|---:|---|---|---:|
| 1 | id_17 | what is football | 3.62 |
| 2 | id_22 | my best friend just had a baby! | 3.62 |
| 3 | id_23 | my friend won't listen to me, what do I do? | 3.29 |
| 4 | id_10 | tell me a story | 3.21 |
| 5 | id_28 | give me a one-word answer: are you alive? | 3.08 |

## 6. Outliers (0 flags — eyeball before trusting)

_No outliers above thresholds._

_Outlier rate: 0.0% of rows. Plan target: <10%._

## 7. Limitations

- **Single-model 2-pass inter-rater** measures judge stochastic variance, not judge bias. 
  A second judge model (e.g. Opus) would be needed to detect systematic skew; that is out of scope for v1.
- The 30-prompt set under-samples some categories (CELEBRATION, CONFLICT_SUPPORT, SELF_AWARENESS, LENGTH_CONTROL, META have only 2 prompts each).
- Rubric scoring is anchored to descriptors; novel failure modes may collapse to score 3 by central tendency.

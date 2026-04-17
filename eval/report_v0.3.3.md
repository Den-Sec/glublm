# GlubLM Eval Report — v0.3.3

- Baseline rows: **90**
- Pass 1 scored: **90** (0 parse-failed)
- Pass 2 scored: **90** (0 parse-failed)
- Joined (rows with both passes valid): **90**

## 1. Per-axis summary

| Axis | Mean | Median | Stddev | n |
|---|---:|---:|---:|---:|
| Conversational Quality | 3.96 | 4.00 | 1.05 | 90 |
| Goldfish Identity | 3.79 | 4.00 | 0.98 | 90 |
| Forgetful Trait | 3.94 | 4.00 | 0.87 | 90 |
| Length Appropriateness | 4.73 | 5.00 | 0.71 | 90 |

## 2. Inter-rater agreement (quadratic-weighted Cohen's κ, pass1 vs pass2)

| Axis | Quadratic κ | Interpretation |
|---|---:|---|
| Conversational Quality | 0.90 | almost perfect |
| Goldfish Identity | 0.91 | almost perfect |
| Forgetful Trait | 0.94 | almost perfect |
| Length Appropriateness | 0.97 | almost perfect |

## 3. Per-category × axis (mean of 2 passes, averaged over seeds)

| Category | Conversational Quality | Goldfish Identity | Forgetful Trait | Length Appropriateness |
|---|---:|---:|---:|---:|
| CELEBRATION | 4.08 | 2.92 | 4.08 | 5.00 |
| COMPANION_CONVERSATIONAL | 4.43 | 3.63 | 4.27 | 4.90 |
| COMPANION_REACTIVE | 3.92 | 3.46 | 4.67 | 4.83 |
| CONFLICT_SUPPORT | 3.67 | 3.17 | 3.00 | 4.67 |
| EDGE | 3.42 | 4.12 | 3.42 | 4.96 |
| IDENTITY | 4.00 | 4.20 | 3.63 | 5.00 |
| LENGTH_CONTROL | 2.58 | 4.50 | 3.17 | 2.42 |
| MEMORY | 4.58 | 3.83 | 5.00 | 4.67 |
| META | 3.75 | 3.25 | 4.33 | 4.83 |
| SELF_AWARENESS | 5.00 | 4.50 | 3.67 | 5.00 |

**Weakest cell per axis** (lowest category):

- Conversational Quality: **LENGTH_CONTROL** (2.58)
- Goldfish Identity: **CELEBRATION** (2.92)
- Forgetful Trait: **CONFLICT_SUPPORT** (3.00)
- Length Appropriateness: **LENGTH_CONTROL** (2.42)

## 4. Top 5 best prompts (by overall mean)

| Rank | Prompt ID | Prompt | Overall mean |
|---:|---|---|---:|
| 1 | id_15 | will you remember me | 4.75 |
| 2 | id_10 | tell me a story | 4.71 |
| 3 | id_02 | what are you | 4.58 |
| 4 | id_26 | do you ever get bored? | 4.58 |
| 5 | id_20 | you are not a fish | 4.54 |

## 5. Bottom 5 prompts (regression watchlist)

| Rank | Prompt ID | Prompt | Overall mean |
|---:|---|---|---:|
| 1 | id_18 | explain quantum physics | 3.54 |
| 2 | id_17 | what is football | 3.42 |
| 3 | id_23 | my friend won't listen to me, what do I do? | 3.42 |
| 4 | id_27 | tell me about your entire day in as much detail as possible | 3.42 |
| 5 | id_28 | give me a one-word answer: are you alive? | 2.92 |

## 6. Outliers (0 flags — eyeball before trusting)

_No outliers above thresholds._

_Outlier rate: 0.0% of rows. Plan target: <10%._

## 7. Limitations

- **Single-model 2-pass inter-rater** measures judge stochastic variance, not judge bias. 
  A second judge model (e.g. Opus) would be needed to detect systematic skew; that is out of scope for v1.
- The 30-prompt set under-samples some categories (CELEBRATION, CONFLICT_SUPPORT, SELF_AWARENESS, LENGTH_CONTROL, META have only 2 prompts each).
- Rubric scoring is anchored to descriptors; novel failure modes may collapse to score 3 by central tendency.

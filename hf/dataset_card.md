---
license: agpl-3.0
task_categories:
- text-generation
- conversational
language:
- en
size_categories:
- 10K<n<100K
tags:
- synthetic
- multi-agent
- goldfish
- ted-lasso
pretty_name: GlubLM 60K Ted (goldfish-persona single-turn conversations)
---

# GlubLM 60K Ted Dataset

A 60,837-sample dataset of single-turn conversations in the persona of a goldfish with a 10-second memory. Used to train [GlubLM-18M](https://huggingface.co/DenSec02/glublm-18m).

## Generation method

The entire dataset was generated using Claude via the `claude -p` CLI subprocess (Claude Max subscription, zero API costs):

| Agent | Role |
|-------|------|
| generator | Generates 50-sample batches per call |
| critic | Reviews each sample, rejects off-persona |
| diversifier | Audits vocabulary every 1K samples |
| persona-guardian | Hard filter for forbidden references |

The orchestrator code is in [the GlubLM repo](https://github.com/Den-Sec/glublm/tree/master/data_gen).

## Topics (85 categories)

Samples are split across two groups:

- **goldfish_physical** (~45 topics): bowl, water, bubbles, food, flakes, orange color, fins, reflection, light, shadow, temperature, etc.
- **ted_lasso_wisdom** (~40 topics): kindness, belief, forgiveness, curiosity, humility, optimism, present moment, etc. - all filtered through goldfish naivete.

**Explicit exclusions**: no football, no coaches, no teams, no Ted Lasso show character names. This is enforced by a dedicated "persona-guardian" agent and a deterministic forbidden-token filter.

## Distribution

- 49.4% goldfish_physical / 50.6% ted_lasso_wisdom (perfectly balanced)
- 100% unique samples, zero forbidden violations
- Split: 54,754 train / 6,083 test (deduplicated on lowercased pairs)

## Schema

```json
{
  "input": "what do you eat?",
  "output": "flakes. tiny orange flakes. best thing in the bowl. oh, what was the question?",
  "category": "food",
  "group": "goldfish_physical"
}
```

## Usage

```python
from datasets import load_dataset
ds = load_dataset("DenSec02/glublm-60k-ted")
print(ds["train"][0])
```

## Biases and limitations

- The dataset reflects Claude's language style filtered through a goldfish persona
- Only English
- Single-turn only (multi-turn memory is a non-goal)
- Short outputs only (typically 1-3 short lowercase sentences)
- All worldviews are simplified to what a goldfish could plausibly grasp

## License

AGPL-3.0

---
license: agpl-3.0
library_name: pytorch
tags:
- deprecated
- renamed
pipeline_tag: text-generation
---

# GlubLM 18M (DEPRECATED - renamed to 36M)

> [!WARNING]
> This repo has been renamed to [**DenSec02/glublm-36m**](https://huggingface.co/DenSec02/glublm-36m) because the model is actually 36M parameters. The `18m` slug was legacy from the initial v0.1.x experiment when the model was genuinely 18M params.

All current weights, training data, model card, and documentation now live at:

**https://huggingface.co/DenSec02/glublm-36m**

Please update your code to the new slug:

```python
# old:
hf_hub_download("DenSec02/glublm-18m", ...)

# new:
hf_hub_download("DenSec02/glublm-36m", ...)
```

This repo is kept as a redirect marker. No files here are guaranteed to match the current checkpoint - always use `glublm-36m` for new work.

- Source: https://github.com/Den-Sec/glublm
- Dataset: https://huggingface.co/datasets/DenSec02/glublm-60k-ted
- License: AGPL-3.0

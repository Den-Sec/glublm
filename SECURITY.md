# Security Policy

## Scope

GlubLM is a small open-source project with no backend. The attack surface is deliberately minimal:

- **Python package**: installed locally via `pip`. Runs entirely on your machine.
- **Desk Pet PWA**: static HTML + JS + ONNX model, served from GitHub Pages. Runs entirely in your browser. No API calls, no telemetry, no third-party requests beyond the CDN-hosted ONNX Runtime.
- **HuggingFace Hub**: hosts the model weights, dataset, and a Gradio Space. We control none of HF's infrastructure.

## Reporting a vulnerability

If you find a security issue, please **do not open a public GitHub issue**. Instead:

1. Email the project maintainer (find the email on [Dennis Sepede's GitHub profile](https://github.com/Den-Sec)) with the subject line `[GlubLM Security]`.
2. Include: description, reproduction steps, affected version, impact assessment.
3. We'll respond within 72 hours.

For bugs that are not security-sensitive, just open a regular GitHub issue.

## What we consider in-scope

- **Python side**: arbitrary code execution via malicious checkpoint loading, unsafe deserialization, path traversal in CLI, dependency chain issues.
- **Desk Pet side**: XSS through chat input rendering, service worker cache poisoning, insecure manifest configuration, mixed-content issues, accidental exfiltration of chat to a third party.
- **Supply chain**: compromised PyPI release, tampered ONNX model on HF, malicious dependency.

## What we consider out-of-scope

- Prompt injection or jailbreaking the goldfish. The goldfish literally cannot remember what you told it, so "jailbreak" is a non-concept here. Feel free to prompt anything - it'll forget by the next sentence. If you convince it to produce unexpected output for half a second before its 96-token context expires, that's not a vulnerability, it's a feature.
- The model generating "offensive" or "biased" output. It's a 36M-parameter goldfish trained on 55K samples. Small models are stochastic. If you find a genuinely bad output, please open a regular issue so we can add a dataset fix.
- Denial of service by running inference in a tight loop. You'll only DoS your own browser.

## Supported versions

Only the latest release is supported. Given the size of the project, maintaining multiple branches isn't realistic.

| Version | Supported |
|---------|-----------|
| v0.3.1 (current) | Yes |
| v0.3.0 | No |
| v0.2.x | No |
| v0.1.x | No |

## Dependencies

We audit dependencies via:
- `pip-audit` on the Python side (run in CI)
- Manual review of the single third-party dependency on the JS side (ONNX Runtime Web, loaded from jsdelivr CDN with a pinned version)

If you notice a compromised dependency, please report it.

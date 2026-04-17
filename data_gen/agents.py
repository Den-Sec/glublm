"""Per-agent wrappers around the Claude client."""
from __future__ import annotations

import json
import re
from typing import Any


def _strip_code_fence(text: str) -> str:
    """Remove optional ```json ... ``` fences if present."""
    text = text.strip()
    if text.startswith("```"):
        text = re.sub(r"^```(?:json)?\s*", "", text)
        text = re.sub(r"\s*```$", "", text)
    return text.strip()


def _parse_json(text: str) -> Any:
    """Parse the first JSON value found in `text`.

    Handles common noise from the headless CLI: optional code fences,
    leading prose, and trailing commentary after the JSON value. Uses
    JSONDecoder.raw_decode to consume exactly one complete value and
    discard anything after it.
    """
    cleaned = _strip_code_fence(text)
    # Seek to the first `{` or `[` — skips any preamble prose.
    first = None
    for i, ch in enumerate(cleaned):
        if ch in "[{":
            first = i
            break
    if first is None:
        raise ValueError(f"no JSON array or object found in response: {cleaned[:200]!r}")
    decoder = json.JSONDecoder()
    obj, _end = decoder.raw_decode(cleaned[first:])
    return obj


def run_generator(
    *,
    client: Any,
    system_prompt: str,
    topic_name: str,
    topic_hint: str,
    group: str,
    count: int,
    model: str,
    extra_suggestions: dict | None = None,
) -> list[dict]:
    """Ask the generator agent for `count` samples on `topic_name`."""
    user = (
        f"topic: {topic_name}\n"
        f"hint: {topic_hint}\n"
        f"group: {group}\n"
        f"count: {count}\n"
    )
    if extra_suggestions:
        user += "\ndiversifier suggestions (use these to vary output):\n"
        user += json.dumps(extra_suggestions, indent=2)
    text = client.call(
        model=model,
        system=system_prompt,
        user=user,
        max_tokens=4096,
        temperature=1.0,
    )
    samples = _parse_json(text)
    if not isinstance(samples, list):
        raise ValueError(f"expected list, got {type(samples).__name__}")
    # Truncate if LLM over-generated (Haiku sometimes returns count+/-1).
    # Downstream guardian requires exact verdict/sample pairing.
    if len(samples) > count:
        samples = samples[:count]
    # Ensure every sample has required fields
    for s in samples:
        s.setdefault("category", topic_name)
        s.setdefault("group", group)
    return samples


def run_critic(
    *,
    client: Any,
    system_prompt: str,
    samples: list[dict],
    model: str,
) -> list[dict]:
    user = "review these samples:\n" + json.dumps(samples, indent=2)
    text = client.call(
        model=model,
        system=system_prompt,
        user=user,
        max_tokens=2048,
        temperature=0.2,
    )
    verdicts = _parse_json(text)
    if not isinstance(verdicts, list) or len(verdicts) != len(samples):
        raise ValueError(
            f"critic returned {len(verdicts) if isinstance(verdicts, list) else 'non-list'} "
            f"verdicts for {len(samples)} samples"
        )
    return verdicts


def run_diversifier(
    *,
    client: Any,
    system_prompt: str,
    samples: list[dict],
    model: str,
) -> dict:
    # 50 samples max keeps the JSON blob under ~10KB, well within the
    # Windows command-line argument limit (~32KB). Larger payloads can
    # trigger WinError 206 when `claude -p` is spawned as a subprocess.
    user = "audit these accepted samples:\n" + json.dumps(samples[:50], indent=2)
    text = client.call(
        model=model,
        system=system_prompt,
        user=user,
        max_tokens=1024,
        temperature=0.7,
    )
    out = _parse_json(text)
    if not isinstance(out, dict):
        raise ValueError("diversifier must return an object")
    return out


def run_persona_guardian(
    *,
    client: Any,
    system_prompt: str,
    samples: list[dict],
    model: str,
) -> list[dict]:
    user = "hard-filter these samples:\n" + json.dumps(samples, indent=2)
    text = client.call(
        model=model,
        system=system_prompt,
        user=user,
        max_tokens=4096,
        temperature=0.0,
    )
    verdicts = _parse_json(text)
    if not isinstance(verdicts, list):
        raise ValueError(
            f"persona_guardian returned non-list: {type(verdicts).__name__}"
        )
    if len(verdicts) != len(samples):
        print(
            f"[guardian] verdict count mismatch: got {len(verdicts)} for "
            f"{len(samples)} samples; padding missing with 'fail'"
        )
        while len(verdicts) < len(samples):
            verdicts.append(
                {"verdict": "fail", "reason": "guardian skipped (padded)"}
            )
        if len(verdicts) > len(samples):
            verdicts = verdicts[: len(samples)]
    return verdicts

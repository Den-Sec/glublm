"""Anthropic API client wrapper with cost tracking and retries."""
from __future__ import annotations

import os
import time

import anthropic

# Pricing in USD per 1M tokens (as of 2025/2026)
# Source: Anthropic pricing page for Haiku 4.5, Sonnet 4.6, Opus 4.6.
PRICING: dict[str, tuple[float, float]] = {
    "claude-haiku-4-5-20251001": (0.80, 4.00),
    "claude-sonnet-4-6": (3.00, 15.00),
    "claude-opus-4-6": (15.00, 75.00),
}


def estimate_cost_usd(model: str, input_tokens: int, output_tokens: int) -> float:
    if model not in PRICING:
        raise ValueError(f"unknown model for pricing: {model}")
    in_rate, out_rate = PRICING[model]
    return (input_tokens / 1_000_000) * in_rate + (output_tokens / 1_000_000) * out_rate


class ClaudeClient:
    """Wraps anthropic.Anthropic with cost accounting and simple retry."""

    def __init__(self, api_key: str | None = None) -> None:
        self.client = anthropic.Anthropic(api_key=api_key or os.environ.get("ANTHROPIC_API_KEY"))
        self.total_cost_usd = 0.0
        self.total_calls = 0
        self.total_input_tokens = 0
        self.total_output_tokens = 0

    def call(
        self,
        *,
        model: str,
        system: str,
        user: str,
        max_tokens: int,
        temperature: float,
        max_retries: int = 3,
    ) -> str:
        last_err: Exception | None = None
        for attempt in range(max_retries):
            try:
                resp = self.client.messages.create(
                    model=model,
                    max_tokens=max_tokens,
                    temperature=temperature,
                    system=system,
                    messages=[{"role": "user", "content": user}],
                )
                if not resp.content:
                    raise ValueError("empty response from Anthropic API")
                text = resp.content[0].text
                self.total_calls += 1
                self.total_input_tokens += resp.usage.input_tokens
                self.total_output_tokens += resp.usage.output_tokens
                self.total_cost_usd += estimate_cost_usd(
                    model, resp.usage.input_tokens, resp.usage.output_tokens
                )
                return text
            except anthropic.APIError as e:
                last_err = e
                sleep = 2 ** attempt
                time.sleep(sleep)
        assert last_err is not None
        raise last_err

"""Claude Code headless client.

Invokes `claude -p` as a subprocess instead of calling the Anthropic API
directly. This lets us use an existing Claude Max subscription for dataset
generation without paying for separate API credits.

The `ClaudeClient.call()` method keeps the same keyword signature as the
original API-based client so `agents.py` and `orchestrator.py` do not need
to change.

Cost tracking is approximated from character counts (~4 chars/token) since
subscription usage is not billed per token — the reported `total_cost_usd`
is what the same workload *would* cost on the API, for monitoring only.
"""
from __future__ import annotations

import subprocess
import time

# Pricing in USD per 1M tokens (as of 2025/2026) — used only for
# informational cost estimates; the Max subscription itself is flat-rate.
PRICING: dict[str, tuple[float, float]] = {
    "claude-haiku-4-5-20251001": (0.80, 4.00),
    "claude-sonnet-4-6": (3.00, 15.00),
    "claude-opus-4-6": (15.00, 75.00),
}

# Mapping from full model names to the short aliases that `claude -p --model`
# accepts. claude CLI also accepts the full name, but aliases are shorter
# and more robust across minor Anthropic renames.
MODEL_ALIAS: dict[str, str] = {
    "claude-haiku-4-5-20251001": "haiku",
    "claude-sonnet-4-6": "sonnet",
    "claude-opus-4-6": "opus",
}

# Rough English token estimate used when the CLI does not return usage info.
CHARS_PER_TOKEN = 4


def estimate_cost_usd(model: str, input_tokens: int, output_tokens: int) -> float:
    if model not in PRICING:
        raise ValueError(f"unknown model for pricing: {model}")
    in_rate, out_rate = PRICING[model]
    return (input_tokens / 1_000_000) * in_rate + (output_tokens / 1_000_000) * out_rate


class ClaudeCodeError(RuntimeError):
    """Raised when the `claude -p` subprocess fails."""


class ClaudeClient:
    """Invokes Claude Code headless (`claude -p`) to generate text.

    Uses the Claude Max subscription of the user running the process —
    no API key needed. Tracks calls and approximate cost for reporting.
    """

    def __init__(
        self,
        api_key: str | None = None,
        cwd: str = "/tmp",
        timeout_seconds: int = 300,
    ) -> None:
        # api_key is accepted for backward compatibility with callers that
        # still pass it; the subscription-based headless CLI ignores it.
        del api_key
        self.cwd = cwd
        self.timeout_seconds = timeout_seconds
        self.total_cost_usd = 0.0
        self.total_calls = 0
        self.total_input_tokens = 0
        self.total_output_tokens = 0
        self._verify_cli()

    def _verify_cli(self) -> None:
        """Fail fast if `claude` is not installed or not working."""
        try:
            subprocess.run(
                ["claude", "--version"],
                capture_output=True,
                timeout=15,
                check=True,
            )
        except (FileNotFoundError, subprocess.CalledProcessError, subprocess.TimeoutExpired) as e:
            raise ClaudeCodeError(
                "`claude` CLI not found or not responding. Install Claude Code "
                "(https://claude.com/claude-code) and ensure `claude --version` works."
            ) from e

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
        # max_tokens and temperature are accepted for API-compatibility with
        # the old anthropic.Anthropic-based client but are not surfaced by
        # `claude -p`. Drop them explicitly so lints don't complain.
        del max_tokens, temperature
        alias = MODEL_ALIAS.get(model, model)
        cmd = [
            "claude",
            "-p",
            "--model", alias,
            "--system-prompt", system,
            "--tools", "",
            "--setting-sources", "",
            "--permission-mode", "bypassPermissions",
            "--no-session-persistence",
            "--output-format", "text",
            user,
        ]

        last_err: Exception | None = None
        for attempt in range(max_retries):
            try:
                result = subprocess.run(
                    cmd,
                    cwd=self.cwd,
                    capture_output=True,
                    text=True,
                    timeout=self.timeout_seconds,
                    encoding="utf-8",
                    errors="replace",
                )
                if result.returncode != 0:
                    raise ClaudeCodeError(
                        f"claude -p exited with code {result.returncode}: "
                        f"{result.stderr[:500]}"
                    )
                text = result.stdout.strip()
                if not text:
                    raise ValueError("empty response from claude -p")

                in_tokens = (len(system) + len(user)) // CHARS_PER_TOKEN
                out_tokens = len(text) // CHARS_PER_TOKEN
                self.total_calls += 1
                self.total_input_tokens += in_tokens
                self.total_output_tokens += out_tokens
                self.total_cost_usd += estimate_cost_usd(model, in_tokens, out_tokens)
                return text
            except (subprocess.TimeoutExpired, ClaudeCodeError, ValueError) as e:
                last_err = e
                sleep_seconds = 2 ** attempt
                time.sleep(sleep_seconds)
        assert last_err is not None
        raise last_err

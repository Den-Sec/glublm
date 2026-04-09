"""Tests for the Claude Code subprocess client wrapper (mocked)."""
from __future__ import annotations

from unittest.mock import MagicMock, patch

import pytest

from data_gen.client import ClaudeClient, ClaudeCodeError, estimate_cost_usd


def test_estimate_cost_haiku():
    # Haiku 4.5 input $0.80/1M, output $4.00/1M
    cost = estimate_cost_usd(
        model="claude-haiku-4-5-20251001",
        input_tokens=1_000_000,
        output_tokens=1_000_000,
    )
    assert 4.7 < cost < 4.9  # 0.80 + 4.00 = 4.80


def test_estimate_cost_sonnet():
    # Sonnet 4.6 - real pricing is $3 input + $15 output per 1M = $18
    cost = estimate_cost_usd(
        model="claude-sonnet-4-6",
        input_tokens=1_000_000,
        output_tokens=1_000_000,
    )
    assert 13.0 < cost <= 18.0


def _ok_version():
    """Return a fake subprocess result for `claude --version`."""
    r = MagicMock()
    r.returncode = 0
    r.stdout = "2.1.97 (Claude Code)\n"
    r.stderr = ""
    return r


def _ok_call(stdout: str):
    r = MagicMock()
    r.returncode = 0
    r.stdout = stdout
    r.stderr = ""
    return r


def test_client_call_records_cost():
    def fake_run(cmd, **kwargs):
        if "--version" in cmd:
            return _ok_version()
        return _ok_call('[{"input":"hi","output":"glub!"}]')

    with patch("data_gen.client.subprocess.run", side_effect=fake_run):
        client = ClaudeClient(api_key="unused")
        text = client.call(
            model="claude-haiku-4-5-20251001",
            system="you are a fish",
            user="generate",
            max_tokens=512,
            temperature=1.0,
        )
        assert "glub" in text
        assert client.total_cost_usd > 0
        assert client.total_calls == 1
        assert client.total_input_tokens > 0
        assert client.total_output_tokens > 0


def test_client_raises_on_empty_response():
    def fake_run(cmd, **kwargs):
        if "--version" in cmd:
            return _ok_version()
        return _ok_call("")

    with patch("data_gen.client.subprocess.run", side_effect=fake_run):
        client = ClaudeClient(api_key="unused")
        with pytest.raises((ValueError, ClaudeCodeError)):
            client.call(
                model="claude-haiku-4-5-20251001",
                system="x",
                user="y",
                max_tokens=10,
                temperature=0.0,
                max_retries=1,
            )


def test_client_raises_when_cli_missing():
    def fake_run(cmd, **kwargs):
        raise FileNotFoundError("claude not found")

    with (
        patch("data_gen.client.subprocess.run", side_effect=fake_run),
        pytest.raises(ClaudeCodeError, match=r"claude.*CLI"),
    ):
        ClaudeClient(api_key="unused")


def test_client_retries_on_nonzero_exit():
    attempts = {"n": 0}

    def fake_run(cmd, **kwargs):
        if "--version" in cmd:
            return _ok_version()
        attempts["n"] += 1
        if attempts["n"] < 2:
            r = MagicMock()
            r.returncode = 1
            r.stdout = ""
            r.stderr = "rate limit"
            return r
        return _ok_call("ok")

    with (
        patch("data_gen.client.subprocess.run", side_effect=fake_run),
        patch("data_gen.client.time.sleep"),
    ):
        client = ClaudeClient(api_key="unused")
        text = client.call(
            model="claude-haiku-4-5-20251001",
            system="x",
            user="y",
            max_tokens=10,
            temperature=0.0,
            max_retries=3,
        )
        assert text == "ok"
        assert attempts["n"] == 2


def test_client_passes_headless_flags():
    captured_cmd: list[str] = []

    def fake_run(cmd, **kwargs):
        if "--version" in cmd:
            return _ok_version()
        captured_cmd.extend(cmd)
        return _ok_call("response")

    with patch("data_gen.client.subprocess.run", side_effect=fake_run):
        client = ClaudeClient(api_key="unused")
        client.call(
            model="claude-haiku-4-5-20251001",
            system="sys",
            user="usr",
            max_tokens=100,
            temperature=0.5,
        )
        # Must include our isolation flags
        assert "-p" in captured_cmd
        assert "--tools" in captured_cmd
        assert "--setting-sources" in captured_cmd
        assert "--permission-mode" in captured_cmd
        assert "bypassPermissions" in captured_cmd
        assert "haiku" in captured_cmd
        assert "sys" in captured_cmd
        assert "usr" in captured_cmd


def test_client_maps_unknown_model_name():
    """If a full model name isn't in MODEL_ALIAS, pass it through verbatim."""
    captured: list[str] = []

    def fake_run(cmd, **kwargs):
        if "--version" in cmd:
            return _ok_version()
        captured.extend(cmd)
        return _ok_call("x")

    with patch("data_gen.client.subprocess.run", side_effect=fake_run):
        client = ClaudeClient(api_key="unused")
        client.call(
            model="claude-sonnet-4-6",
            system="s",
            user="u",
            max_tokens=1,
            temperature=0.0,
        )
        assert "sonnet" in captured

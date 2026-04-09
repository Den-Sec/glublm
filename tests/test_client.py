"""Tests for the Anthropic client wrapper (mocked)."""
from __future__ import annotations

from unittest.mock import MagicMock, patch

from data_gen.client import ClaudeClient, estimate_cost_usd


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


def test_client_call_records_cost():
    mock_resp = MagicMock()
    mock_resp.content = [MagicMock(text='[{"input":"hi","output":"glub!"}]')]
    mock_resp.usage.input_tokens = 100
    mock_resp.usage.output_tokens = 50
    mock_anthropic = MagicMock()
    mock_anthropic.messages.create.return_value = mock_resp

    with patch("data_gen.client.anthropic.Anthropic", return_value=mock_anthropic):
        client = ClaudeClient(api_key="fake")
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


def test_client_raises_on_empty_response():
    mock_resp = MagicMock()
    mock_resp.content = []
    mock_resp.usage.input_tokens = 10
    mock_resp.usage.output_tokens = 0
    mock_anthropic = MagicMock()
    mock_anthropic.messages.create.return_value = mock_resp

    with patch("data_gen.client.anthropic.Anthropic", return_value=mock_anthropic):
        client = ClaudeClient(api_key="fake")
        try:
            client.call(
                model="claude-haiku-4-5-20251001",
                system="x",
                user="y",
                max_tokens=10,
                temperature=0.0,
            )
            raise AssertionError("expected ValueError")
        except ValueError:
            pass

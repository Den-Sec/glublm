"""Tests for agent wrapper functions (mocked client)."""
from __future__ import annotations

import json
from unittest.mock import MagicMock

from data_gen.agents import (
    run_critic,
    run_diversifier,
    run_generator,
    run_persona_guardian,
)


def _fake_client(response: str) -> MagicMock:
    client = MagicMock()
    client.call.return_value = response
    return client


def test_generator_parses_json_array():
    payload = json.dumps(
        [
            {"input": "hello", "output": "glub hi", "category": "greetings", "group": "goldfish_physical"},
            {"input": "bye", "output": "bye! new moment.", "category": "goodbye", "group": "ted_lasso_wisdom"},
        ]
    )
    client = _fake_client(payload)
    samples = run_generator(
        client=client,
        system_prompt="you are a goldfish",
        topic_name="greetings",
        topic_hint="saying hello",
        group="goldfish_physical",
        count=2,
        model="claude-haiku-4-5-20251001",
    )
    assert len(samples) == 2
    assert samples[0]["input"] == "hello"


def test_generator_strips_markdown_fence():
    payload = "```json\n" + json.dumps([{"input": "a", "output": "b", "category": "c", "group": "d"}]) + "\n```"
    client = _fake_client(payload)
    samples = run_generator(
        client=client,
        system_prompt="x",
        topic_name="t",
        topic_hint="h",
        group="goldfish_physical",
        count=1,
        model="claude-haiku-4-5-20251001",
    )
    assert len(samples) == 1


def test_critic_returns_verdicts():
    payload = json.dumps(
        [
            {"verdict": "accept", "reason": ""},
            {"verdict": "reject", "reason": "too long"},
        ]
    )
    client = _fake_client(payload)
    samples = [{"input": "a", "output": "b"}, {"input": "c", "output": "d"}]
    verdicts = run_critic(
        client=client,
        system_prompt="critic",
        samples=samples,
        model="claude-sonnet-4-6",
    )
    assert len(verdicts) == 2
    assert verdicts[0]["verdict"] == "accept"
    assert verdicts[1]["verdict"] == "reject"


def test_diversifier_returns_dict():
    payload = json.dumps(
        {
            "overused_words": ["water"],
            "overused_starts": ["glub!"],
            "suggested_new_vocab": ["shimmer"],
            "suggested_new_framings": ["as a statement"],
            "notes": "water is overused",
        }
    )
    client = _fake_client(payload)
    out = run_diversifier(
        client=client,
        system_prompt="d",
        samples=[{"input": "x", "output": "glub! water water water"}],
        model="claude-haiku-4-5-20251001",
    )
    assert "overused_words" in out
    assert "water" in out["overused_words"]


def test_persona_guardian_flags_football():
    payload = json.dumps(
        [
            {"verdict": "pass", "violation": ""},
            {"verdict": "fail", "violation": "football"},
        ]
    )
    client = _fake_client(payload)
    verdicts = run_persona_guardian(
        client=client,
        system_prompt="g",
        samples=[{"input": "a", "output": "b"}, {"input": "c", "output": "we won the football match"}],
        model="claude-sonnet-4-6",
    )
    assert len(verdicts) == 2
    assert verdicts[1]["verdict"] == "fail"
    assert "football" in verdicts[1]["violation"]

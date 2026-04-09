"""Tests for the orchestrator main loop (mocked agents)."""
from __future__ import annotations

import json
from pathlib import Path
from unittest.mock import patch

from data_gen.orchestrator import Orchestrator


def _make_fake_samples(topic: str, count: int, group: str) -> list[dict]:
    return [
        {
            "input": f"tell me about {topic} {i}",
            "output": f"glub! {topic} is nice today",
            "category": topic,
            "group": group,
        }
        for i in range(count)
    ]


def test_orchestrator_generates_target_count(tmp_path: Path):
    # Tiny topics file
    topics_file = tmp_path / "topics.yaml"
    topics_file.write_text(
        "goldfish_physical:\n"
        "  - {name: water, hint: wet stuff}\n"
        "  - {name: food, hint: flakes}\n"
        "ted_lasso_wisdom:\n"
        "  - {name: kindness, hint: being nice}\n",
        encoding="utf-8",
    )

    fake_counter = {"n": 0}

    def fake_run_generator(**kwargs):
        fake_counter["n"] += 1
        return _make_fake_samples(kwargs["topic_name"], kwargs["count"], kwargs["group"])

    def fake_run_critic(**kwargs):
        return [{"verdict": "accept", "reason": ""} for _ in kwargs["samples"]]

    def fake_run_guardian(**kwargs):
        return [{"verdict": "pass", "violation": ""} for _ in kwargs["samples"]]

    with (
        patch("data_gen.orchestrator.run_generator", side_effect=fake_run_generator),
        patch("data_gen.orchestrator.run_critic", side_effect=fake_run_critic),
        patch("data_gen.orchestrator.run_persona_guardian", side_effect=fake_run_guardian),
        patch("data_gen.orchestrator.ClaudeClient") as mock_client_cls,
    ):
        instance = mock_client_cls.return_value
        instance.total_cost_usd = 0.0  # stays under budget
        instance.total_calls = 0
        out_path = tmp_path / "out.json"
        orch = Orchestrator(
            topics_path=str(topics_file),
            team_config_path=None,
            out_path=str(out_path),
            target_total=30,
            budget_usd=1.0,
            api_key="fake",
        )
        orch.run()

        assert out_path.exists()
        data = json.loads(out_path.read_text())
        assert len(data["samples"]) == 30


def test_orchestrator_respects_budget(tmp_path: Path):
    """If budget is exceeded, orchestrator must stop and return partial results."""
    topics_file = tmp_path / "topics.yaml"
    topics_file.write_text(
        "goldfish_physical:\n  - {name: water, hint: wet}\n"
        "ted_lasso_wisdom:\n  - {name: hope, hint: nice}\n",
        encoding="utf-8",
    )

    def fake_gen(**kwargs):
        return _make_fake_samples(kwargs["topic_name"], kwargs["count"], kwargs["group"])

    with (
        patch("data_gen.orchestrator.run_generator", side_effect=fake_gen),
        patch("data_gen.orchestrator.run_critic", return_value=[{"verdict": "accept", "reason": ""}] * 50),
        patch("data_gen.orchestrator.run_persona_guardian", return_value=[{"verdict": "pass", "violation": ""}] * 50),
        patch("data_gen.orchestrator.ClaudeClient") as mock_client_cls,
    ):
        instance = mock_client_cls.return_value
        instance.total_cost_usd = 5.0  # Already over the budget of 1.0
        instance.total_calls = 1

        orch = Orchestrator(
            topics_path=str(topics_file),
            team_config_path=None,
            out_path=str(tmp_path / "o.json"),
            target_total=1000,  # very high target
            budget_usd=1.0,      # very tight budget
            api_key="fake",
        )
        orch.run()

        data = json.loads((tmp_path / "o.json").read_text())
        # Should have stopped early - fewer samples than target
        assert len(data["samples"]) < 1000

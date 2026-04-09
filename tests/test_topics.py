"""Tests for topics.yaml integrity."""
from __future__ import annotations

from pathlib import Path

import yaml

TOPICS = Path(__file__).parent.parent / "data_gen" / "topics.yaml"


def test_topics_file_exists():
    assert TOPICS.exists()


def test_topics_has_two_groups():
    data = yaml.safe_load(TOPICS.read_text(encoding="utf-8"))
    assert "goldfish_physical" in data
    assert "ted_lasso_wisdom" in data


def test_topics_count_at_least_80():
    data = yaml.safe_load(TOPICS.read_text(encoding="utf-8"))
    total = len(data["goldfish_physical"]) + len(data["ted_lasso_wisdom"])
    assert total >= 80, f"expected >=80 topics, got {total}"


def test_ted_lasso_wisdom_has_no_forbidden_refs():
    data = yaml.safe_load(TOPICS.read_text(encoding="utf-8"))
    forbidden = {
        "football", "coach", "team", "ball", "soccer", "match",
        "richmond", "rebecca", "roy", "keeley", "nate", "jamie",
    }
    for topic in data["ted_lasso_wisdom"]:
        tl = topic.lower() if isinstance(topic, str) else topic["name"].lower()
        for f in forbidden:
            assert f not in tl, f"forbidden term {f!r} in topic {topic!r}"


def test_every_topic_has_description():
    data = yaml.safe_load(TOPICS.read_text(encoding="utf-8"))
    # Topics are a list of strings or dicts. If dict, must have 'name' + 'hint'.
    for group in ("goldfish_physical", "ted_lasso_wisdom"):
        for topic in data[group]:
            if isinstance(topic, dict):
                assert "name" in topic
                assert "hint" in topic
            else:
                assert isinstance(topic, str)
                assert len(topic) > 0

"""Tests for the glublm CLI."""
from __future__ import annotations

from click.testing import CliRunner

from glublm.cli import main


def test_cli_help():
    runner = CliRunner()
    result = runner.invoke(main, ["--help"])
    assert result.exit_code == 0
    assert "GlubLM" in result.output or "glublm" in result.output


def test_cli_version():
    runner = CliRunner()
    result = runner.invoke(main, ["--version"])
    assert result.exit_code == 0
    assert "0.1.0" in result.output


def test_cli_has_train_command():
    runner = CliRunner()
    result = runner.invoke(main, ["train", "--help"])
    assert result.exit_code == 0


def test_cli_has_chat_command():
    runner = CliRunner()
    result = runner.invoke(main, ["chat", "--help"])
    assert result.exit_code == 0

"""Main orchestrator for multi-agent dataset generation."""
from __future__ import annotations

import json
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path
from typing import Any

import yaml

from data_gen.agents import (
    run_critic,
    run_diversifier,
    run_generator,
    run_persona_guardian,
)
from data_gen.client import ClaudeClient
from data_gen.validate import load_forbidden_tokens, scan_for_forbidden

DEFAULT_TEAM_CONFIG: dict[str, Any] = {
    "agents": {
        "generator": {
            "model": "claude-haiku-4-5-20251001",
            "batch_size": 50,
            "prompt": "prompts/generator.md",
        },
        "critic": {
            "model": "claude-sonnet-4-6",
            "prompt": "prompts/critic.md",
        },
        "diversifier": {
            "model": "claude-haiku-4-5-20251001",
            "trigger_every": 1000,
            "prompt": "prompts/diversifier.md",
        },
        "persona_guardian": {
            "model": "claude-sonnet-4-6",
            "prompt": "prompts/persona_guardian.md",
        },
    },
    "budget": {"max_usd": 100.0, "warn_at_usd": 60.0},
}


def _load_prompt(base_dir: Path, rel: str) -> str:
    return (base_dir / rel).read_text(encoding="utf-8")


class Orchestrator:
    """Runs the four-agent dataset generation pipeline.

    Parallelizes per-topic generation across a ThreadPoolExecutor worker
    pool. Each worker runs one full topic pipeline (generator -> forbidden
    scan -> optional critic -> persona guardian) and returns accepted
    samples. The main thread is the only writer to self.accepted and the
    only caller of self._save(), so no additional locking is required.
    """

    def __init__(
        self,
        *,
        topics_path: str,
        team_config_path: str | None,
        out_path: str,
        target_total: int,
        budget_usd: float | None = None,
        api_key: str | None = None,
        num_workers: int = 4,
        skip_critic: bool = False,
    ) -> None:
        self.topics = yaml.safe_load(Path(topics_path).read_text(encoding="utf-8"))
        self.base_dir = Path(__file__).parent
        if team_config_path:
            self.config = yaml.safe_load(Path(team_config_path).read_text(encoding="utf-8"))
        else:
            self.config = DEFAULT_TEAM_CONFIG
        self.out_path = Path(out_path)
        self.target_total = target_total
        self.budget_usd = budget_usd if budget_usd is not None else self.config["budget"]["max_usd"]
        self.client = ClaudeClient(api_key=api_key)
        self.forbidden = load_forbidden_tokens()
        self.accepted: list[dict] = []
        self.diversifier_suggestions: dict | None = None
        self.num_workers = max(num_workers, 1)
        self.skip_critic = skip_critic

        self.gen_cfg = self.config["agents"]["generator"]
        self.crit_cfg = self.config["agents"]["critic"]
        self.div_cfg = self.config["agents"]["diversifier"]
        self.guard_cfg = self.config["agents"]["persona_guardian"]

        self.gen_prompt = _load_prompt(self.base_dir, self.gen_cfg["prompt"])
        self.crit_prompt = _load_prompt(self.base_dir, self.crit_cfg["prompt"])
        self.div_prompt = _load_prompt(self.base_dir, self.div_cfg["prompt"])
        self.guard_prompt = _load_prompt(self.base_dir, self.guard_cfg["prompt"])

    def _all_topics(self) -> list[tuple[str, str, str]]:
        out: list[tuple[str, str, str]] = []
        for group in ("goldfish_physical", "ted_lasso_wisdom"):
            for t in self.topics[group]:
                if isinstance(t, dict):
                    out.append((t["name"], t.get("hint", ""), group))
                else:
                    out.append((t, "", group))
        return out

    def _budget_exceeded(self) -> bool:
        return self.client.total_cost_usd >= self.budget_usd

    def _save(self) -> None:
        self.out_path.parent.mkdir(parents=True, exist_ok=True)
        payload = {
            "samples": self.accepted,
            "meta": {
                "total_cost_usd": round(self.client.total_cost_usd, 4),
                "total_api_calls": self.client.total_calls,
                "total_accepted": len(self.accepted),
            },
        }
        self.out_path.write_text(json.dumps(payload, indent=2), encoding="utf-8")

    def _generate_for_topic(self, name: str, hint: str, group: str, count: int) -> list[dict]:
        """Generate, optional critic-filter, guardian-filter, forbidden-scan, return accepted.

        Called from worker threads. Reads self.diversifier_suggestions (which
        is only mutated from the main thread between rounds) and does not
        touch self.accepted or self.out_path.
        """
        try:
            raw = run_generator(
                client=self.client,
                system_prompt=self.gen_prompt,
                topic_name=name,
                topic_hint=hint,
                group=group,
                count=count,
                model=self.gen_cfg["model"],
                extra_suggestions=self.diversifier_suggestions,
            )
        except Exception as e:
            print(f"[generator] topic={name} failed: {e}")
            return []

        # Deterministic forbidden scan first (cheap, no API call)
        bad = set(scan_for_forbidden(raw, self.forbidden))
        raw = [s for i, s in enumerate(raw) if i not in bad]
        if not raw:
            return []

        if not self.skip_critic:
            try:
                critic_verdicts = run_critic(
                    client=self.client,
                    system_prompt=self.crit_prompt,
                    samples=raw,
                    model=self.crit_cfg["model"],
                )
            except Exception as e:
                print(f"[critic] topic={name} failed: {e}")
                return []

            raw = [s for s, v in zip(raw, critic_verdicts, strict=False) if v["verdict"] == "accept"]
            if not raw:
                return []

        try:
            guardian_verdicts = run_persona_guardian(
                client=self.client,
                system_prompt=self.guard_prompt,
                samples=raw,
                model=self.guard_cfg["model"],
            )
        except Exception as e:
            print(f"[guardian] topic={name} failed: {e}")
            return []

        final = [s for s, v in zip(raw, guardian_verdicts, strict=False) if v["verdict"] == "pass"]
        return final

    def _maybe_run_diversifier(self) -> None:
        trigger = self.div_cfg.get("trigger_every", 1000)
        if len(self.accepted) < trigger:
            return
        if len(self.accepted) % trigger != 0:
            return
        try:
            self.diversifier_suggestions = run_diversifier(
                client=self.client,
                system_prompt=self.div_prompt,
                samples=self.accepted[-trigger:],
                model=self.div_cfg["model"],
            )
            print(f"[diversifier] updated suggestions: {self.diversifier_suggestions.get('notes', '')}")
        except Exception as e:
            print(f"[diversifier] failed (non-fatal): {e}")

    def run(self) -> None:
        topics = self._all_topics()
        batch_size = self.gen_cfg.get("batch_size", 50)
        round_idx = 0

        while len(self.accepted) < self.target_total and not self._budget_exceeded():
            round_idx += 1
            print(
                f"\n=== round {round_idx} | accepted={len(self.accepted)}/{self.target_total} "
                f"| cost=${self.client.total_cost_usd:.2f} | workers={self.num_workers} "
                f"| skip_critic={self.skip_critic} ==="
            )

            round_jobs: list[tuple[str, str, str, int]] = []
            for name, hint, group in topics:
                if len(self.accepted) + len(round_jobs) * batch_size >= self.target_total:
                    break
                remaining = self.target_total - len(self.accepted) - len(round_jobs) * batch_size
                count_this_call = min(batch_size, remaining)
                if count_this_call <= 0:
                    break
                round_jobs.append((name, hint, group, count_this_call))

            if not round_jobs:
                break

            progress_before = len(self.accepted)
            with ThreadPoolExecutor(max_workers=self.num_workers) as pool:
                futures = {
                    pool.submit(self._generate_for_topic, name, hint, group, count): (name, group)
                    for (name, hint, group, count) in round_jobs
                }
                for fut in as_completed(futures):
                    if self._budget_exceeded():
                        # Don't cancel running futures (they're waiting on claude -p);
                        # just stop consuming results to let the while loop exit.
                        break
                    name, group = futures[fut]
                    try:
                        accepted = fut.result()
                    except Exception as e:
                        print(f"[worker] {group}/{name} raised: {e}")
                        continue
                    self.accepted.extend(accepted)
                    print(
                        f"  [{group}/{name}] +{len(accepted)} | total={len(self.accepted)} "
                        f"| cost=${self.client.total_cost_usd:.2f}"
                    )
                    self._maybe_run_diversifier()
                    self._save()  # checkpoint every completed topic

            # Safety valve: if an entire round made zero progress, bail
            if round_idx >= 3 and len(self.accepted) == progress_before:
                print("[orchestrator] zero progress this round and >= 3 rounds done, stopping")
                break

        self._save()
        print(
            f"\ndone. accepted={len(self.accepted)} | "
            f"cost=${self.client.total_cost_usd:.2f} | "
            f"saved to {self.out_path}"
        )

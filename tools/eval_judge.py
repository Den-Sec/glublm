"""Eval judge: score baseline outputs with Claude (Sonnet 4.6 by default).

Uses the headless `claude -p` CLI via data_gen.client.ClaudeClient — same
pattern as the dataset generation pipeline. Two passes per (prompt_id, seed)
measure judge stochastic variance via quadratic-weighted Cohen's kappa
downstream.

Auth: relies on the user's Claude Max subscription via the `claude` CLI —
no ANTHROPIC_API_KEY required.
"""
from __future__ import annotations

import argparse
import json
import os
import re
import sys
import time
from datetime import datetime, timezone
from pathlib import Path

# data_gen lives at repo root; eval_judge.py is in tools/. Make data_gen importable.
_REPO_ROOT = Path(__file__).resolve().parent.parent
if str(_REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(_REPO_ROOT))

from data_gen.client import ClaudeClient, ClaudeCodeError  # noqa: E402

JSON_RE = re.compile(r"\{.*?\}", re.DOTALL)
AXES = ("conversational", "goldfish_identity", "forgetful_trait", "length_appropriateness")


def load_jsonl(path: Path) -> list[dict]:
    rows = []
    with path.open(encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if line:
                rows.append(json.loads(line))
    return rows


def existing_keys(path: Path) -> set[tuple[str, int]]:
    if not path.exists():
        return set()
    seen = set()
    with path.open(encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if not line:
                continue
            try:
                row = json.loads(line)
                seen.add((row["prompt_id"], int(row["seed"])))
            except (json.JSONDecodeError, KeyError):
                continue
    return seen


def parse_score_response(text: str) -> dict | None:
    text = text.strip()
    if text.startswith("```"):
        text = re.sub(r"^```(?:json)?\s*", "", text)
        text = re.sub(r"\s*```$", "", text)
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        m = JSON_RE.search(text)
        if not m:
            return None
        try:
            return json.loads(m.group(0))
        except json.JSONDecodeError:
            return None


def validate_score(obj: dict) -> bool:
    for axis in AXES:
        v = obj.get(axis)
        if not isinstance(v, int) or v < 1 or v > 5:
            return False
    return True


def call_judge(
    client: ClaudeClient,
    *,
    model: str,
    rubric: str,
    prompt: str,
    output: str,
    pass_id: int,
) -> dict:
    """Single judge call. ClaudeClient handles retries internally."""
    user_text = (
        f"[Pass {pass_id}] Score this GlubLM output against the rubric.\n\n"
        f"USER PROMPT: {prompt}\n"
        f"MODEL OUTPUT: {output if output else '(empty output)'}\n\n"
        "Respond with the JSON object only — no prose, no fences."
    )
    text = client.call(
        model=model,
        system=rubric,
        user=user_text,
        max_tokens=512,
        temperature=0.3,
    )
    parsed = parse_score_response(text)
    if parsed is None or not validate_score(parsed):
        return {"_parse_failed": True, "_raw": text[:500]}
    return parsed


def main() -> None:
    ap = argparse.ArgumentParser(description="GlubLM eval judge (claude -p CLI)")
    ap.add_argument("--baseline", required=True, help="Path to baseline JSONL")
    ap.add_argument("--rubric", required=True, help="Path to rubric markdown")
    ap.add_argument("--output", required=True, help="Output scores JSONL")
    ap.add_argument("--pass-id", type=int, required=True, help="Pass identifier (1 or 2)")
    ap.add_argument(
        "--model",
        default="claude-sonnet-4-6",
        help="Anthropic model id (will be aliased: sonnet/opus/haiku)",
    )
    ap.add_argument("--sleep", type=float, default=0.5, help="Seconds between calls")
    ap.add_argument("--limit", type=int, default=None, help="Smoke mode: cap rows to N")
    ap.add_argument("--resume", action="store_true", help="Skip rows already in output")
    args = ap.parse_args()

    rubric = Path(args.rubric).read_text(encoding="utf-8")
    baseline = load_jsonl(Path(args.baseline))
    if args.limit is not None:
        baseline = baseline[: args.limit]

    out_path = Path(args.output)
    out_path.parent.mkdir(parents=True, exist_ok=True)

    skip = existing_keys(out_path) if args.resume else set()
    if skip:
        print(f"[judge] resume: skipping {len(skip)} already-scored rows", file=sys.stderr)

    try:
        client = ClaudeClient()
    except ClaudeCodeError as e:
        print(f"[judge] FATAL: {e}", file=sys.stderr)
        sys.exit(1)

    print(f"[judge] model={args.model} pass={args.pass_id} rows={len(baseline)}", file=sys.stderr)

    n_done = 0
    n_failed = 0
    t0 = time.time()
    mode = "a" if args.resume and out_path.exists() else "w"
    with out_path.open(mode, encoding="utf-8") as f:
        for i, row in enumerate(baseline, start=1):
            key = (row["prompt_id"], int(row["seed"]))
            if key in skip:
                continue

            try:
                parsed = call_judge(
                    client,
                    model=args.model,
                    rubric=rubric,
                    prompt=row["prompt"],
                    output=row["output"],
                    pass_id=args.pass_id,
                )
            except Exception as e:
                print(f"[judge] HARD FAIL on {key}: {e}", file=sys.stderr)
                n_failed += 1
                continue

            if parsed.get("_parse_failed"):
                print(
                    f"[judge] parse-failed on {key}, raw: {parsed.get('_raw', '')[:120]}",
                    file=sys.stderr,
                )
                out_row = {
                    "prompt_id": row["prompt_id"],
                    "seed": int(row["seed"]),
                    "pass_id": args.pass_id,
                    "parse_failed": True,
                    "raw_excerpt": parsed.get("_raw", ""),
                    "timestamp": datetime.now(timezone.utc).isoformat(timespec="seconds"),
                }
                n_failed += 1
            else:
                out_row = {
                    "prompt_id": row["prompt_id"],
                    "seed": int(row["seed"]),
                    "pass_id": args.pass_id,
                    "conversational": int(parsed["conversational"]),
                    "goldfish_identity": int(parsed["goldfish_identity"]),
                    "forgetful_trait": int(parsed["forgetful_trait"]),
                    "length_appropriateness": int(parsed["length_appropriateness"]),
                    "reasoning": str(parsed.get("reasoning", "")),
                    "timestamp": datetime.now(timezone.utc).isoformat(timespec="seconds"),
                }

            f.write(json.dumps(out_row, ensure_ascii=False) + "\n")
            f.flush()
            os.fsync(f.fileno())
            n_done += 1

            if i == 1 or i % 10 == 0 or i == len(baseline):
                est_cost = client.total_cost_usd
                print(
                    f"[judge] {i}/{len(baseline)} done ({(time.time() - t0):.1f}s) "
                    f"calls={client.total_calls} est_cost=${est_cost:.4f}",
                    file=sys.stderr,
                )

            time.sleep(args.sleep)

    print(
        f"[judge] wrote {n_done} rows ({n_failed} failed) to {out_path} "
        f"| total est_cost=${client.total_cost_usd:.4f}",
        file=sys.stderr,
    )


if __name__ == "__main__":
    main()

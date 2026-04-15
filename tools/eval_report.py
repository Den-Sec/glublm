"""Eval report: join baseline + 2 judge passes, compute kappa + per-axis means.

Outputs:
- a markdown report with per-axis / per-category tables and outlier flags
- a long-format CSV (prompt_id, seed, pass, axis, score, reasoning) for ad-hoc analysis
"""
from __future__ import annotations

import argparse
import csv
import json
import statistics
from collections import defaultdict
from pathlib import Path

try:
    from sklearn.metrics import cohen_kappa_score
except ImportError as e:
    raise SystemExit(f"[report] FATAL: scikit-learn missing. Install with `uv sync --extra eval`. ({e})")


AXES = ("conversational", "goldfish_identity", "forgetful_trait", "length_appropriateness")
AXIS_LABEL = {
    "conversational": "Conversational Quality",
    "goldfish_identity": "Goldfish Identity",
    "forgetful_trait": "Forgetful Trait",
    "length_appropriateness": "Length Appropriateness",
}


def load_jsonl(path: Path) -> list[dict]:
    rows = []
    with path.open(encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if line:
                rows.append(json.loads(line))
    return rows


def join_data(baseline: list[dict], pass1: list[dict], pass2: list[dict]) -> list[dict]:
    """Inner join on (prompt_id, seed). Drops parse-failed score rows."""
    p1_idx = {(r["prompt_id"], r["seed"]): r for r in pass1 if not r.get("parse_failed")}
    p2_idx = {(r["prompt_id"], r["seed"]): r for r in pass2 if not r.get("parse_failed")}
    joined = []
    for b in baseline:
        key = (b["prompt_id"], b["seed"])
        if key in p1_idx and key in p2_idx:
            joined.append({"baseline": b, "pass1": p1_idx[key], "pass2": p2_idx[key]})
    return joined


def per_axis_stats(joined: list[dict]) -> dict[str, dict[str, float]]:
    """Mean/median/std per axis, averaging the two passes per row."""
    out = {}
    for axis in AXES:
        vals = []
        for j in joined:
            vals.append((j["pass1"][axis] + j["pass2"][axis]) / 2.0)
        if not vals:
            out[axis] = {"mean": 0.0, "median": 0.0, "stddev": 0.0, "n": 0}
            continue
        out[axis] = {
            "mean": statistics.fmean(vals),
            "median": statistics.median(vals),
            "stddev": statistics.pstdev(vals) if len(vals) > 1 else 0.0,
            "n": len(vals),
        }
    return out


def per_axis_kappa(joined: list[dict]) -> dict[str, float]:
    """Quadratic-weighted Cohen's kappa per axis between pass1 and pass2."""
    out = {}
    for axis in AXES:
        p1 = [j["pass1"][axis] for j in joined]
        p2 = [j["pass2"][axis] for j in joined]
        if not p1 or all(x == p1[0] for x in p1) and all(x == p2[0] for x in p2):
            out[axis] = float("nan")
            continue
        try:
            out[axis] = float(cohen_kappa_score(p1, p2, weights="quadratic"))
        except ValueError:
            out[axis] = float("nan")
    return out


def per_category_axis(joined: list[dict]) -> dict[str, dict[str, float]]:
    """Mean per (category, axis), averaged over passes and seeds."""
    bucket: dict[tuple[str, str], list[float]] = defaultdict(list)
    for j in joined:
        cat = j["baseline"]["category"]
        for axis in AXES:
            bucket[(cat, axis)].append((j["pass1"][axis] + j["pass2"][axis]) / 2.0)
    out: dict[str, dict[str, float]] = defaultdict(dict)
    for (cat, axis), vals in bucket.items():
        out[cat][axis] = statistics.fmean(vals) if vals else 0.0
    return dict(out)


def per_prompt_overall(joined: list[dict]) -> list[tuple[str, str, float]]:
    """Overall score per prompt = mean of (mean of 4 axes) over seeds and passes."""
    bucket: dict[str, list[float]] = defaultdict(list)
    prompt_text: dict[str, str] = {}
    for j in joined:
        pid = j["baseline"]["prompt_id"]
        prompt_text[pid] = j["baseline"]["prompt"]
        row_mean = statistics.fmean(
            [(j["pass1"][a] + j["pass2"][a]) / 2.0 for a in AXES]
        )
        bucket[pid].append(row_mean)
    return sorted(
        [(pid, prompt_text[pid], statistics.fmean(vs)) for pid, vs in bucket.items()],
        key=lambda x: x[2],
        reverse=True,
    )


def outliers(joined: list[dict]) -> list[dict]:
    """Flag rows where |p1 - p2| > 2 on any axis OR seed-stddev > 1.5 on any axis."""
    flags: list[dict] = []

    seen_keys = set()
    for j in joined:
        key = (j["baseline"]["prompt_id"], j["baseline"]["seed"])
        if key in seen_keys:
            continue
        seen_keys.add(key)
        for axis in AXES:
            diff = abs(j["pass1"][axis] - j["pass2"][axis])
            if diff > 2:
                flags.append(
                    {
                        "type": "inter_pass_disagreement",
                        "prompt_id": j["baseline"]["prompt_id"],
                        "seed": j["baseline"]["seed"],
                        "axis": axis,
                        "p1": j["pass1"][axis],
                        "p2": j["pass2"][axis],
                        "prompt": j["baseline"]["prompt"],
                        "output": j["baseline"]["output"],
                    }
                )

    by_prompt: dict[str, dict[str, list[float]]] = defaultdict(lambda: defaultdict(list))
    for j in joined:
        pid = j["baseline"]["prompt_id"]
        for axis in AXES:
            by_prompt[pid][axis].append((j["pass1"][axis] + j["pass2"][axis]) / 2.0)
    for pid, axis_vals in by_prompt.items():
        for axis, vals in axis_vals.items():
            if len(vals) >= 2:
                sd = statistics.pstdev(vals)
                if sd > 1.5:
                    flags.append(
                        {
                            "type": "high_seed_variance",
                            "prompt_id": pid,
                            "axis": axis,
                            "stddev": round(sd, 3),
                            "values": vals,
                        }
                    )
    return flags


def write_csv(joined: list[dict], path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8", newline="") as f:
        w = csv.writer(f)
        w.writerow(["prompt_id", "category", "prompt", "seed", "pass", "axis", "score", "reasoning"])
        for j in joined:
            for pass_key, pass_id in (("pass1", 1), ("pass2", 2)):
                p = j[pass_key]
                for axis in AXES:
                    w.writerow(
                        [
                            j["baseline"]["prompt_id"],
                            j["baseline"]["category"],
                            j["baseline"]["prompt"],
                            j["baseline"]["seed"],
                            pass_id,
                            axis,
                            p[axis],
                            p.get("reasoning", ""),
                        ]
                    )


def fmt_float(x: float) -> str:
    if x != x:  # NaN
        return "n/a"
    return f"{x:.2f}"


def write_markdown(
    *,
    out_path: Path,
    model_version: str,
    joined: list[dict],
    axis_stats: dict[str, dict[str, float]],
    kappas: dict[str, float],
    cat_axis: dict[str, dict[str, float]],
    prompt_ranking: list[tuple[str, str, float]],
    outlier_flags: list[dict],
    n_baseline: int,
    n_pass1: int,
    n_pass2: int,
    n_pass1_failed: int,
    n_pass2_failed: int,
) -> None:
    out_path.parent.mkdir(parents=True, exist_ok=True)
    lines: list[str] = []
    a = lines.append

    a(f"# GlubLM Eval Report — {model_version}")
    a("")
    a(f"- Baseline rows: **{n_baseline}**")
    a(f"- Pass 1 scored: **{n_pass1 - n_pass1_failed}** ({n_pass1_failed} parse-failed)")
    a(f"- Pass 2 scored: **{n_pass2 - n_pass2_failed}** ({n_pass2_failed} parse-failed)")
    a(f"- Joined (rows with both passes valid): **{len(joined)}**")
    a("")

    a("## 1. Per-axis summary")
    a("")
    a("| Axis | Mean | Median | Stddev | n |")
    a("|---|---:|---:|---:|---:|")
    for axis in AXES:
        s = axis_stats[axis]
        a(f"| {AXIS_LABEL[axis]} | {fmt_float(s['mean'])} | {fmt_float(s['median'])} | {fmt_float(s['stddev'])} | {s['n']} |")
    a("")

    a("## 2. Inter-rater agreement (quadratic-weighted Cohen's κ, pass1 vs pass2)")
    a("")
    a("| Axis | Quadratic κ | Interpretation |")
    a("|---|---:|---|")
    for axis in AXES:
        k = kappas[axis]
        if k != k:
            interp = "n/a (no variance)"
        elif k >= 0.8:
            interp = "almost perfect"
        elif k >= 0.6:
            interp = "substantial"
        elif k >= 0.4:
            interp = "moderate"
        elif k >= 0.2:
            interp = "fair"
        else:
            interp = "poor — rubric likely ambiguous on this axis"
        a(f"| {AXIS_LABEL[axis]} | {fmt_float(k)} | {interp} |")
    a("")

    a("## 3. Per-category × axis (mean of 2 passes, averaged over seeds)")
    a("")
    cats = sorted(cat_axis.keys())
    header = "| Category | " + " | ".join(AXIS_LABEL[a_] for a_ in AXES) + " |"
    sep = "|---|" + "|".join(["---:"] * len(AXES)) + "|"
    a(header)
    a(sep)
    for cat in cats:
        row = [cat] + [fmt_float(cat_axis[cat].get(axis, float("nan"))) for axis in AXES]
        a("| " + " | ".join(row) + " |")
    a("")

    a("**Weakest cell per axis** (lowest category):")
    a("")
    for axis in AXES:
        per_cat = [(cat, cat_axis[cat].get(axis, float("nan"))) for cat in cats]
        per_cat = [(c, v) for c, v in per_cat if v == v]
        if not per_cat:
            continue
        worst_cat, worst_val = min(per_cat, key=lambda x: x[1])
        a(f"- {AXIS_LABEL[axis]}: **{worst_cat}** ({fmt_float(worst_val)})")
    a("")

    a("## 4. Top 5 best prompts (by overall mean)")
    a("")
    a("| Rank | Prompt ID | Prompt | Overall mean |")
    a("|---:|---|---|---:|")
    for i, (pid, ptext, score) in enumerate(prompt_ranking[:5], start=1):
        a(f"| {i} | {pid} | {ptext} | {fmt_float(score)} |")
    a("")

    a("## 5. Bottom 5 prompts (regression watchlist)")
    a("")
    a("| Rank | Prompt ID | Prompt | Overall mean |")
    a("|---:|---|---|---:|")
    for i, (pid, ptext, score) in enumerate(prompt_ranking[-5:], start=1):
        a(f"| {i} | {pid} | {ptext} | {fmt_float(score)} |")
    a("")

    a(f"## 6. Outliers ({len(outlier_flags)} flags — eyeball before trusting)")
    a("")
    if not outlier_flags:
        a("_No outliers above thresholds._")
    else:
        a("| Type | Prompt ID | Seed | Axis | Detail |")
        a("|---|---|---:|---|---|")
        for f in outlier_flags:
            if f["type"] == "inter_pass_disagreement":
                detail = f"p1={f['p1']} vs p2={f['p2']} (Δ={abs(f['p1'] - f['p2'])})"
                a(f"| {f['type']} | {f['prompt_id']} | {f['seed']} | {f['axis']} | {detail} |")
            else:
                detail = f"σ={f['stddev']} over {f['values']}"
                a(f"| {f['type']} | {f['prompt_id']} | — | {f['axis']} | {detail} |")
    a("")

    pct_flagged = (len(outlier_flags) / max(len(joined), 1)) * 100
    a(f"_Outlier rate: {pct_flagged:.1f}% of rows. Plan target: <10%._")
    a("")

    a("## 7. Limitations")
    a("")
    a("- **Single-model 2-pass inter-rater** measures judge stochastic variance, not judge bias. ")
    a("  A second judge model (e.g. Opus) would be needed to detect systematic skew; that is out of scope for v1.")
    a("- The 30-prompt set under-samples some categories (CELEBRATION, CONFLICT_SUPPORT, SELF_AWARENESS, LENGTH_CONTROL, META have only 2 prompts each).")
    a("- Rubric scoring is anchored to descriptors; novel failure modes may collapse to score 3 by central tendency.")
    a("")

    out_path.write_text("\n".join(lines), encoding="utf-8")


def main() -> None:
    ap = argparse.ArgumentParser(description="GlubLM eval report")
    ap.add_argument("--baseline", required=True, help="Path to baseline JSONL")
    ap.add_argument("--pass1", required=True, help="Path to pass 1 scores JSONL")
    ap.add_argument("--pass2", required=True, help="Path to pass 2 scores JSONL")
    ap.add_argument("--report", required=True, help="Output markdown path")
    ap.add_argument("--csv", required=True, help="Output CSV path")
    ap.add_argument("--model-version", default=None, help="Override model version label in report")
    args = ap.parse_args()

    baseline = load_jsonl(Path(args.baseline))
    pass1 = load_jsonl(Path(args.pass1))
    pass2 = load_jsonl(Path(args.pass2))

    joined = join_data(baseline, pass1, pass2)
    if not joined:
        raise SystemExit("[report] FATAL: no rows joined — check pass1/pass2 paths")

    model_version = args.model_version or baseline[0].get("model_version", "unknown")

    axis_stats = per_axis_stats(joined)
    kappas = per_axis_kappa(joined)
    cat_axis = per_category_axis(joined)
    ranking = per_prompt_overall(joined)
    flags = outliers(joined)

    n_p1_failed = sum(1 for r in pass1 if r.get("parse_failed"))
    n_p2_failed = sum(1 for r in pass2 if r.get("parse_failed"))

    write_csv(joined, Path(args.csv))
    write_markdown(
        out_path=Path(args.report),
        model_version=model_version,
        joined=joined,
        axis_stats=axis_stats,
        kappas=kappas,
        cat_axis=cat_axis,
        prompt_ranking=ranking,
        outlier_flags=flags,
        n_baseline=len(baseline),
        n_pass1=len(pass1),
        n_pass2=len(pass2),
        n_pass1_failed=n_p1_failed,
        n_pass2_failed=n_p2_failed,
    )

    print(f"[report] wrote {args.report} ({len(joined)} joined rows, {len(flags)} flags)")
    print(f"[report] wrote {args.csv}")


if __name__ == "__main__":
    main()

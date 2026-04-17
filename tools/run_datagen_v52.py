"""Run the v5.2 hotfix dataset generation (self_awareness_multi_anchor)."""
from __future__ import annotations

import sys
from pathlib import Path

sys.stdout.reconfigure(encoding="utf-8", errors="replace")
sys.stderr.reconfigure(encoding="utf-8", errors="replace")

project_root = Path(__file__).parent.parent
sys.path.insert(0, str(project_root))

from data_gen.orchestrator import Orchestrator  # noqa: E402


def main() -> None:
    orch = Orchestrator(
        topics_path=str(project_root / "data_gen" / "topics_v52.yaml"),
        team_config_path=str(project_root / "data_gen" / "team_config_v52.yaml"),
        out_path="C:/Users/Dennis/glublm_v52_batch2.json",
        target_total=450,
        num_workers=4,
        skip_critic=True,
        only_group="ted_lasso_wisdom",
    )
    orch.run()
    print("done!")


if __name__ == "__main__":
    main()

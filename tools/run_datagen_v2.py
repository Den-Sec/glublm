"""Run the v2 supplemental dataset generation as a standalone process."""
from __future__ import annotations

import sys
from pathlib import Path

# Add project root to path
project_root = Path(__file__).parent.parent
sys.path.insert(0, str(project_root))

from data_gen.orchestrator import Orchestrator  # noqa: E402


def main() -> None:
    orch = Orchestrator(
        topics_path=str(project_root / "data_gen" / "topics_v4.yaml"),
        team_config_path=str(project_root / "data_gen" / "team_config_v4.yaml"),
        out_path="C:/Users/Dennis/glublm_forgetful_15k.json",
        target_total=15000,
        num_workers=4,
        skip_critic=True,
    )
    orch.run()
    print("done!")


if __name__ == "__main__":
    main()

"""CLI wrapper cho MOBO engine — giao tiếp JSON qua subprocess với backend Java Spring Boot."""

from __future__ import annotations

import json
import sys
from pathlib import Path

# Thêm thư mục worker để import vehicsim_core
WORKER_DIR = Path(__file__).resolve().parent
if str(WORKER_DIR) not in sys.path:
    sys.path.insert(0, str(WORKER_DIR))

from vehicsim_core.mobo import (
    DEFAULT_SEARCH_SPACE,
    MoboOptimizer,
    MoboSearchSpace,
    MoboTrial,
    evaluate_pareto_front,
)


def run_mobo(payload: dict) -> dict:
    bounds = payload.get("search_space") or DEFAULT_SEARCH_SPACE
    # Chuyển đổi bounds sang dạng tuple
    space_bounds: dict[str, tuple[float, float]] = {}
    for k, v in bounds.items():
        if isinstance(v, (list, tuple)) and len(v) == 2:
            space_bounds[k] = (float(v[0]), float(v[1]))
        elif isinstance(v, dict) and "min" in v and "max" in v:
            space_bounds[k] = (float(v["min"]), float(v["max"]))

    search_space = MoboSearchSpace(bounds=space_bounds if space_bounds else DEFAULT_SEARCH_SPACE)
    n_initial = payload.get("n_initial_points", 5)
    seed = payload.get("seed", 42)

    raw_trials = payload.get("trials", [])
    trials: list[MoboTrial] = []
    for rt in raw_trials:
        t = MoboTrial(
            trial_number=rt.get("trial_number", len(trials) + 1),
            params=rt.get("params", {}),
            rms_jerk=rt.get("rms_jerk"),
            impact_speed=rt.get("impact_speed"),
            stopping_distance=rt.get("stopping_distance"),
            constraint_violated=rt.get("constraint_violated", False),
            sampling_source=rt.get("sampling_source", "INITIAL_DESIGN"),
        )
        trials.append(t)

    optimizer = MoboOptimizer(
        search_space=search_space,
        n_initial_points=n_initial,
        seed=seed,
        acquisition_function=payload.get("acquisition_function", "qEHVI"),
    )
    proposed, source, acq_val = optimizer.propose_candidate(trials)
    pareto_numbers = evaluate_pareto_front(trials)

    return {
        "proposed_params": proposed,
        "sampling_source": source,
        "acquisition_value": acq_val,
        "pareto_trial_numbers": pareto_numbers,
    }


def main() -> None:
    if len(sys.argv) > 1 and sys.argv[1] == "--stdin":
        content = sys.stdin.read()
    elif len(sys.argv) > 1 and Path(sys.argv[1]).is_file():
        content = Path(sys.argv[1]).read_text(encoding="utf-8")
    else:
        # Nhận trực tiếp chuỗi JSON từ stdin
        content = sys.stdin.read()

    if not content.strip():
        sys.exit(json.dumps({"error": "Empty input payload"}))

    try:
        payload = json.loads(content)
        result = run_mobo(payload)
        sys.stdout.write(json.dumps(result, indent=2))
    except Exception as e:
        sys.stderr.write(f"MOBO error: {e}\n")
        sys.exit(1)


if __name__ == "__main__":
    main()

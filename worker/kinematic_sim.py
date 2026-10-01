"""Chạy MỘT biến thể bằng bộ mô phỏng động học — cùng giao diện với ``run_variant.py``.

    python worker/kinematic_sim.py vehicsim-run-42.json
    python worker/kinematic_sim.py vehicsim-run-42.json --aeb aeb_candidate.json --out runs/cand

Không cần CARLA, GPU hay venv riêng: chỉ thư viện chuẩn, Python >= 3.10. Kết quả
trùng từng khung với lần chạy trên web nếu cùng bundle (cùng biến thể + AEB + seed).
"""

from __future__ import annotations

import argparse

import sim_common

from src.services.vehicsim.bundle import KINEMATIC_SIMULATOR
from src.services.vehicsim.simulator import simulate


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    sim_common.add_common_args(parser)
    args = parser.parse_args(argv)
    spec = sim_common.load_spec(args)
    outcome = simulate(spec.case, spec.params, seed=spec.seed, vehicle=spec.vehicle)
    return sim_common.finish(args, spec, outcome, simulator=KINEMATIC_SIMULATOR)


if __name__ == "__main__":
    raise SystemExit(main())

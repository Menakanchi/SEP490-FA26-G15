"""CLI giả CARLA cho test: đúng hợp đồng của ``worker/run_variant.py``.

Bên trong chạy bộ động học nhưng báo tên ``carla-<version>`` — để kiểm đường tiến
trình con của backend (ghi bundle, gọi lệnh, đọc result.json, lưu artifact) mà
không cần server CARLA. ``--exit-code`` giả lập CARLA crash; ``--hang`` giả lập
CARLA treo — khi bị xin dừng, khối ``finally`` ghi ``cleaned_up`` vào ``--out``
(thay cho việc xoá actor / trả server về chế độ thường của runner thật).
"""

from __future__ import annotations

import argparse
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "worker"))

import sim_common  # noqa: E402

from src.services.vehicsim.bundle import carla_simulator  # noqa: E402
from src.services.vehicsim.simulator import simulate  # noqa: E402


def main() -> int:
    parser = argparse.ArgumentParser()
    sim_common.add_common_args(parser)
    parser.add_argument("--report-version", default="0.9.15")
    parser.add_argument("--exit-code", type=int, default=0)
    parser.add_argument("--hang", action="store_true")
    args = parser.parse_args()
    sim_common.install_stop_handlers()
    if args.exit_code:
        print("CARLA lỗi: giả lập server sập", file=sys.stderr)
        return args.exit_code
    if args.hang:
        out = sim_common.out_dir(args)
        try:
            while True:  # ngủ từng nhịp ngắn: trên Windows tín hiệu chỉ được xử lý giữa hai lệnh Python
                time.sleep(0.05)
        finally:
            (out / "cleaned_up").write_text("ok", encoding="utf-8")
    spec = sim_common.load_spec(args)
    outcome = simulate(spec.case, spec.params, seed=spec.seed, vehicle=spec.vehicle)
    return sim_common.finish(args, spec, outcome, simulator=carla_simulator(args.report_version))


if __name__ == "__main__":
    raise SystemExit(main())

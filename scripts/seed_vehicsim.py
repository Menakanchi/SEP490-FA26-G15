"""Tạo dữ liệu mặc định cho vòng MVP VehicSim trên MySQL.

    uv run python scripts/seed_vehicsim.py --owner admin@vehicsim.vn [--demo]

- Tạo workspace "AEB Pedestrian", project, xe VF8 v1.2, AEB system, baseline v1.0.
- ``--demo``: thêm một họ "Pedestrian Crossing" (48 biến thể) và chạy baseline
  NGAY trong process này (không cần Celery worker) để giao diện có dữ liệu.

Idempotent: chạy lại không tạo trùng project.
"""

from __future__ import annotations

import argparse
import os
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--owner", required=True, help="email tài khoản sở hữu project (đã đăng ký)")
    parser.add_argument("--demo", action="store_true", help="tạo họ kịch bản mẫu và chạy baseline")
    args = parser.parse_args()

    if args.demo:
        os.environ["VEHICSIM_RUN_MODE"] = "inline"

    from src.services.auth import users
    from src.services.vehicsim import family, runs, views
    from src.services.vehicsim.bootstrap import ensure_default_project

    owner = users.get_by_email(args.owner)
    if owner is None:
        print(
            f"Không có tài khoản {args.owner} — đăng ký hoặc tạo bằng scripts/create_admin.py trước.", file=sys.stderr
        )
        return 1

    info = ensure_default_project(owner.id)
    print("Project:", "đã tạo" if info["created"] else "đã có sẵn", f"(id {info['project_id']})")

    if args.demo:
        if views.families():
            print("Đã có họ kịch bản — bỏ qua phần demo.")
            return 0
        spec = family.FamilySpec(
            ego_speeds_kmh=[40, 50, 60, 70],
            trigger_distances_m=[20, 30, 40],
            pedestrian_speeds_mps=[1.5, 3.0],
            stops_at_curb=[False, True],
            weathers=["CLEAR"],
            times_of_day=["DAY", "NIGHT"],
        )
        created = family.create_family(info["project_id"], spec, owner.id)
        print(f"Họ {created['code']}: {created['variants']} biến thể — đang chạy baseline…")
        ids = runs.run_family(project_id=info["project_id"], scenario_id=created["scenario_id"], user_id=owner.id)
        print(f"Đã chạy {len(ids)} lần mô phỏng.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

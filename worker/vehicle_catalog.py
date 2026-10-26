"""Đọc thông số xe từ CARLA để thêm vào danh mục ``carla_vehicle_models`` (FE-04-01/02, exec plan 26/10).

    worker/.venv-carla/Scripts/python worker/vehicle_catalog.py --out data/vehicle-catalog [--study data/vehicle-study/vehicle_study.json]

Mỗi blueprint: spawn ở Town04 road 40 (cùng đoạn ``measure_brake.py``), đọc physics **mặc định** của CARLA (không ép gì) và kích thước mesh,
rồi đổi sang đúng cột của bảng. ``--study`` lấy giảm tốc phanh 100% đo bằng ``vehicle_study.py`` (nhóm gốc, cùng physics mặc định) cho cột
``carla_full_brake_decel_mps2``; không có số đo thì để trống, không tự điền.

Ghi ``<out>/vehicle_catalog.json`` và ``<out>/vehicle_catalog.sql`` (INSERT bỏ qua blueprint đã có). **Không** ghi DB: SQL được chép vào migration.
``max_brake_decel_mps2`` (giới hạn phanh của bộ động học) không đo được trên CARLA vì CARLA phanh yếu hơn xe thật (TD-17); giá trị là quyết định của
nhóm, truyền bằng ``--kinematic-brake`` (mặc định 9,5 như e-tron). Chỉ chạy khi server rảnh (tự tick ở chế độ đồng bộ).
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

import run_xosc
from carla_physics import physics_snapshot

# (blueprint, tên hiển thị, dùng được cho run) — 4 xe đã đo ở exec plan 22/10 mục 6. Xe tải 6 bánh chỉ để xem: giới hạn phanh 9,5 m/s² không đúng với xe tải.
DEFAULT_VEHICLES = (
    ("vehicle.tesla.model3", "Tesla Model 3", True),
    ("vehicle.nissan.patrol_2021", "Nissan Patrol 2021", True),
    ("vehicle.mercedes.sprinter", "Mercedes Sprinter", True),
    ("vehicle.carlamotors.european_hgv", "CarlaMotors European HGV", False),
)
DEFAULT_KINEMATIC_BRAKE = 9.5
STEP_S = 0.01
SETTLE_S = 0.5
ROAD_ID, LANE_ID, START_S = 40, -4, 10.0


def axle_wheelbase_m(positions) -> float | None:
    """Chiều dài cơ sở từ trục trước (hai bánh đầu) tới trục sau cùng (hai bánh cuối), vị trí CARLA tính bằng cm. Xe 6 bánh lấy trục cuối, không lấy trục giữa."""
    if len(positions) < 4:
        return None
    fx, fy = (positions[0].x + positions[1].x) / 2, (positions[0].y + positions[1].y) / 2
    rx, ry = (positions[-2].x + positions[-1].x) / 2, (positions[-2].y + positions[-1].y) / 2
    return ((fx - rx) ** 2 + (fy - ry) ** 2) ** 0.5 / 100.0


def study_decel(study: dict) -> dict[str, float]:
    """Giảm tốc phanh 100% (trung bình nhóm gốc) theo blueprint từ ``vehicle_study.json``. Xe lỗi hoặc thiếu dải đo thì không có mặt."""
    out = {}
    for vehicle in study.get("vehicles", []):
        decel = ((vehicle.get("groups") or {}).get("base") or {}).get("decel_mps2")
        if decel and decel.get("mean") is not None:
            out[vehicle["blueprint"]] = round(decel["mean"], 2)
    return out


def _round(value: float | None, digits: int) -> float | None:
    return None if value is None else round(value, digits)


def catalog_row(blueprint: str, display_name: str, supported: bool, snapshot: dict, wheelbase: float | None,
                full_brake_decel: float | None, kinematic_brake: float) -> dict:
    """Một dòng ``carla_vehicle_models`` từ physics mặc định đọc được.

    Ma sát lốp và mô-men phanh là một số cho mọi bánh: CARLA để mô-men phanh trước/sau khác nhau, nên lấy bánh lớn nhất và ghi đủ từng bánh vào JSON.
    ``max_speed_mps`` không có trong physics CARLA nên để trống.
    """
    wheels = snapshot["wheels"]
    com = snapshot["center_of_mass"]
    return {
        "carla_blueprint_id": blueprint,
        "display_name": display_name,
        "length_m": _round(snapshot["length_m"], 3),
        "width_m": _round(snapshot["width_m"], 3),
        "height_m": _round(snapshot["height_m"], 3),
        "num_wheels": len(wheels),
        "mass_kg": _round(snapshot["mass"], 2),
        "drag_coefficient": _round(snapshot["drag_coefficient"], 3),
        "center_of_mass_x_m": _round(com["x"], 3),
        "center_of_mass_y_m": _round(com["y"], 3),
        "center_of_mass_z_m": _round(com["z"], 3),
        "tire_friction": _round(max(w["tire_friction"] for w in wheels), 2),
        "max_brake_torque_nm": _round(max(w["max_brake_torque"] for w in wheels), 2),
        "wheelbase_m": _round(wheelbase, 3),
        "max_speed_mps": None,
        "max_brake_decel_mps2": kinematic_brake,
        "carla_full_brake_decel_mps2": full_brake_decel,
        "is_supported": supported,
    }


COLUMNS = ("carla_blueprint_id", "display_name", "length_m", "width_m", "height_m", "num_wheels", "mass_kg", "drag_coefficient",
           "center_of_mass_x_m", "center_of_mass_y_m", "center_of_mass_z_m", "tire_friction", "max_brake_torque_nm", "wheelbase_m",
           "max_speed_mps", "max_brake_decel_mps2", "carla_full_brake_decel_mps2", "is_supported")


def _sql_value(value) -> str:
    if value is None:
        return "NULL"
    if isinstance(value, bool):
        return "TRUE" if value else "FALSE"
    if isinstance(value, str):
        return "'" + value.replace("'", "''") + "'"
    return repr(value)


def sql_insert(rows: list[dict]) -> str:
    """INSERT chỉ thêm blueprint chưa có — chạy lại không đụng dòng cũ (e-tron và run cũ giữ nguyên)."""
    selects = ["SELECT " + ", ".join(f"{_sql_value(row[c])} AS {c}" for c in COLUMNS) for row in rows]
    return (f"INSERT INTO carla_vehicle_models ({', '.join(COLUMNS)})\n"
            "SELECT * FROM (\n  " + "\n  UNION ALL ".join(selects) + "\n) AS v\n"
            "WHERE v.carla_blueprint_id NOT IN (SELECT carla_blueprint_id FROM (SELECT carla_blueprint_id FROM carla_vehicle_models) AS existing);\n")


def read_vehicle(world, blueprint: str) -> dict:  # noqa: ANN001
    """Spawn xe, chờ tiếp đất, đọc physics mặc định + kích thước mesh, rồi xoá xe."""
    waypoint = world.get_map().get_waypoint_xodr(ROAD_ID, LANE_ID, START_S)
    transform = waypoint.transform
    transform.location.z += 0.3
    vehicle = world.spawn_actor(world.get_blueprint_library().find(blueprint), transform)
    try:
        for _ in range(int(SETTLE_S / STEP_S)):
            world.tick()
        pc = vehicle.get_physics_control()
        snapshot = physics_snapshot(pc, vehicle.bounding_box.extent)
        return {"snapshot": snapshot, "wheelbase_m": axle_wheelbase_m([w.position for w in pc.wheels])}
    finally:
        vehicle.destroy()


def main(argv: list[str] | None = None) -> int:
    run_xosc._console_safe()
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--out", type=Path, required=True)
    parser.add_argument("--study", type=Path, help="vehicle_study.json để lấy giảm tốc phanh 100% đo trên CARLA")
    parser.add_argument("--kinematic-brake", type=float, default=DEFAULT_KINEMATIC_BRAKE, help="max_brake_decel_mps2 cho bộ động học (m/s²)")
    parser.add_argument("--host", default="127.0.0.1")
    parser.add_argument("--port", type=int, default=2000)
    args = parser.parse_args(argv)
    decels = study_decel(json.loads(args.study.read_text(encoding="utf-8"))) if args.study else {}
    import carla

    client = carla.Client(args.host, args.port)
    client.set_timeout(60.0)
    world = client.get_world()
    if world.get_map().name.split("/")[-1] != "Town04":
        world = client.load_world("Town04")
    run_xosc.release_world(client)
    settings = world.get_settings()
    settings.synchronous_mode, settings.fixed_delta_seconds = True, STEP_S
    world.apply_settings(settings)
    rows, raw = [], []
    try:
        for blueprint, name, supported in DEFAULT_VEHICLES:
            read = read_vehicle(world, blueprint)
            raw.append({"blueprint": blueprint, **read})
            rows.append(catalog_row(blueprint, name, supported, read["snapshot"], read["wheelbase_m"], decels.get(blueprint), args.kinematic_brake))
    finally:
        run_xosc.release_world(client)
    args.out.mkdir(parents=True, exist_ok=True)
    meta = {"server": client.get_server_version(), "map": "Town04", "study": str(args.study) if args.study else None,
            "kinematic_brake_mps2": args.kinematic_brake}
    (args.out / "vehicle_catalog.json").write_text(json.dumps({"meta": meta, "rows": rows, "raw": raw}, indent=1, ensure_ascii=False),
                                                   encoding="utf-8")
    sql = sql_insert(rows)
    (args.out / "vehicle_catalog.sql").write_text(sql, encoding="utf-8")
    print(sql)
    missing = [r["carla_blueprint_id"] for r in rows if r["carla_full_brake_decel_mps2"] is None]
    if missing:
        print("Chưa có giảm tốc đo trên CARLA:", ", ".join(missing))
    return 0


if __name__ == "__main__":
    sys.exit(main())

"""Đo giảm tốc khi phanh 100% của một xe trên CARLA để hiệu chuẩn bàn đạp AEB (TD-17; kế hoạch 20/10 việc 4).

    worker/.venv-carla/Scripts/python worker/measure_brake.py --blueprint vehicle.audi.etron --mass 2100 --speeds 30 40 50 60 --out data/brake-etron

Đặt xe trên đoạn thẳng Town04 road 40 / lane -4 (cùng đoạn bộ xuất ``.xosc`` dùng), giữ tốc độ đều, rồi phanh 100% và ghi tốc độ mỗi tick
(chế độ đồng bộ 0,01 s, do công cụ tự tick — chỉ chạy khi server rảnh, không chạy song song với web/ScenarioRunner). Giảm tốc đo trên dải
từ 95% tốc độ đầu xuống ``LOW_SPEED_MPS``: dưới mức đó CARLA dừng gần như tức thì (21–27 m/s², TD-17) nên không đại diện cho bàn đạp.

Chỉ đo và ghi ``<out>/brake_measurement.json``; **không** ghi DB. Giá trị đề xuất cho ``carla_vehicle_models.carla_full_brake_decel_mps2``
là trung bình các tốc độ; ghi vào DB làm đổi kết quả CARLA của xe đó, nên phải theo quyết định ghi trong exec plan.
"""

from __future__ import annotations

import argparse
import json
import statistics
import sys
from pathlib import Path

import run_xosc
from carla_physics import apply_physics_overrides, physics_snapshot

ROAD_ID, LANE_ID, START_S = 40, -4, 10.0
STEP_S = 0.01
LOW_SPEED_MPS = 6.0
# Dải đo ngắn hơn thì ít mẫu và nhạy với dao động đầu lúc đạp phanh (đo 22/10: 30 km/h chỉ 0,3 s cho 5,56 m/s², 40–60 km/h cho 4,64–4,72).
MIN_BAND_S = 0.5
SETTLE_S = 1.5
MAX_BRAKE_S = 15.0


def decel_from_samples(samples: list[tuple[float, float]], v0: float, low: float = LOW_SPEED_MPS) -> dict:
    """``samples`` = (t, speed m/s) từ lúc đạp phanh. Giảm tốc trung bình (hồi quy tuyến tính tốc độ theo thời gian) trên dải 0,95·v0 → ``low``."""
    band = [(t, v) for t, v in samples if low <= v <= 0.95 * v0]
    if len(band) < 3:
        return {"decel_mps2": None, "samples": len(band)}
    ts, vs = [t for t, _ in band], [v for _, v in band]
    slope = statistics.linear_regression(ts, vs).slope
    return {"decel_mps2": round(-slope, 3), "samples": len(band), "from_mps": round(vs[0], 3), "to_mps": round(vs[-1], 3),
            "duration_s": round(ts[-1] - ts[0], 3)}


def stopping_distance(samples: list[tuple[float, float]]) -> float:
    """Quãng từ lúc đạp phanh tới khi dừng (tích phân hình thang tốc độ)."""
    return round(sum((t1 - t0) * (v0 + v1) / 2 for (t0, v0), (t1, v1) in zip(samples, samples[1:])), 3)


def measure_once(world, carla, blueprint: str, physics: dict, speed_kmh: float) -> dict:  # noqa: ANN001
    carla_map = world.get_map()
    waypoint = carla_map.get_waypoint_xodr(ROAD_ID, LANE_ID, START_S)
    transform = waypoint.transform
    transform.location.z += 0.3
    vehicle = world.spawn_actor(world.get_blueprint_library().find(blueprint), transform)
    try:
        if physics:
            pc = vehicle.get_physics_control()
            apply_physics_overrides(pc, physics, carla.Vector3D)
            vehicle.apply_physics_control(pc)
        for _ in range(int(0.5 / STEP_S)):  # xe tiếp đất
            world.tick()
        v_target = speed_kmh / 3.6
        vehicle.enable_constant_velocity(carla.Vector3D(v_target, 0.0, 0.0))
        for _ in range(int(SETTLE_S / STEP_S)):
            world.tick()
        vehicle.disable_constant_velocity()
        vehicle.apply_control(carla.VehicleControl(throttle=0.0, brake=1.0))
        start = world.get_snapshot().timestamp.elapsed_seconds
        samples = []
        for _ in range(int(MAX_BRAKE_S / STEP_S)):
            world.tick()
            vel = vehicle.get_velocity()
            speed = (vel.x ** 2 + vel.y ** 2) ** 0.5
            samples.append((world.get_snapshot().timestamp.elapsed_seconds - start, speed))
            vehicle.apply_control(carla.VehicleControl(throttle=0.0, brake=1.0))
            if speed < 0.05:
                break
        v0 = samples[0][1] if samples else 0.0
        return {"speed_kmh": speed_kmh, "v0_mps": round(v0, 3), **decel_from_samples(samples, v0),
                "stopping_distance_m": stopping_distance(samples), "stopped": bool(samples and samples[-1][1] < 0.05),
                "physics_applied": physics_snapshot(vehicle.get_physics_control(), vehicle.bounding_box.extent)}
    finally:
        vehicle.destroy()


def main(argv: list[str] | None = None) -> int:
    run_xosc._console_safe()
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--blueprint", default="vehicle.audi.etron")
    parser.add_argument("--mass", type=float, help="khối lượng xe trong DB (kg) — ép như lúc chạy thật")
    parser.add_argument("--speeds", type=float, nargs="+", default=[30.0, 40.0, 50.0, 60.0])
    parser.add_argument("--out", type=Path, required=True)
    parser.add_argument("--host", default="127.0.0.1")
    parser.add_argument("--port", type=int, default=2000)
    args = parser.parse_args(argv)
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
    physics = {"mass": args.mass} if args.mass else {}
    rows = []
    try:
        for speed in args.speeds:
            row = measure_once(world, carla, args.blueprint, physics, speed)
            rows.append(row)
            print(f"{speed:5.0f} km/h: giảm tốc {row['decel_mps2']} m/s² (dải {row.get('from_mps')}→{row.get('to_mps')} m/s), "
                  f"quãng dừng {row['stopping_distance_m']} m")
    finally:
        run_xosc.release_world(client)
    measured = [r["decel_mps2"] for r in rows if r["decel_mps2"] is not None and r.get("duration_s", 0) >= MIN_BAND_S]
    excluded = [{"speed_kmh": r["speed_kmh"], "duration_s": r.get("duration_s")} for r in rows
                if r["decel_mps2"] is None or r.get("duration_s", 0) < MIN_BAND_S]
    report = {"blueprint": args.blueprint, "mass_kg": args.mass, "server": client.get_server_version(), "step_s": STEP_S,
              "low_speed_cutoff_mps": LOW_SPEED_MPS, "min_band_s": MIN_BAND_S, "excluded_short_band": excluded, "rows": rows,
              "proposed_full_brake_decel_mps2": round(statistics.fmean(measured), 2) if measured else None,
              "spread_mps2": round(max(measured) - min(measured), 3) if measured else None}
    args.out.mkdir(parents=True, exist_ok=True)
    (args.out / "brake_measurement.json").write_text(json.dumps(report, indent=1, ensure_ascii=False), encoding="utf-8")
    print(f"Đề xuất carla_full_brake_decel_mps2 = {report['proposed_full_brake_decel_mps2']} (chênh giữa các tốc độ {report['spread_mps2']})")
    return 0 if measured else 3


if __name__ == "__main__":
    sys.exit(main())

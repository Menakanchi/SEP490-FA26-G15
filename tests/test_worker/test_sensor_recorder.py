"""Phần xử lý số của ``worker/sensor_recorder.py`` — không cần CARLA."""

from __future__ import annotations

import importlib.util
import math
from pathlib import Path
from types import SimpleNamespace

_SPEC = importlib.util.spec_from_file_location(
    "worker_sensor_recorder", Path(__file__).parents[2] / "worker" / "sensor_recorder.py"
)
assert _SPEC and _SPEC.loader
sensor_recorder = importlib.util.module_from_spec(_SPEC)
_SPEC.loader.exec_module(sensor_recorder)


def _det(depth: float, velocity: float, azimuth_deg: float = 0.0, altitude_deg: float = 0.0) -> SimpleNamespace:
    return SimpleNamespace(
        depth=depth, velocity=velocity, azimuth=math.radians(azimuth_deg), altitude=math.radians(altitude_deg)
    )


def test_nearest_target_ahead_gives_ttc() -> None:
    target = sensor_recorder.nearest_radar_target([_det(30.0, -5.0), _det(10.0, -2.5), _det(5.0, -1.0, azimuth_deg=20)])
    assert target == {"radar_depth_m": 10.0, "radar_rel_velocity_ms": -2.5, "radar_ttc_s": 4.0}


def test_road_returns_and_spawn_glitches_are_ignored() -> None:
    # Mặt đường (góc âm) và vận tốc phi vật lý lúc spawn không được thành mục tiêu.
    assert sensor_recorder.nearest_radar_target([_det(3.0, -8.0, altitude_deg=-5), _det(60.0, -5604.0)]) is None


def test_far_road_surface_is_not_a_target() -> None:
    # Mặt đường cách 45 m chỉ ở -0,85°: lọt bộ lọc góc, nhưng điểm dội cao ~0 m.
    road = _det(45.0, -16.4, altitude_deg=-0.85)
    car = _det(30.0, -4.0, altitude_deg=0.5)
    assert sensor_recorder.nearest_radar_target([road]) is None
    assert sensor_recorder.nearest_radar_target([road, car])["radar_depth_m"] == 30.0


def test_receding_target_has_no_ttc() -> None:
    assert sensor_recorder.nearest_radar_target([_det(12.0, 1.5)])["radar_ttc_s"] is None


def test_static_radar_clutter_is_kept_out_of_moving_ttc() -> None:
    rows = [
        # Rào chắn phía trước: vận tốc mặt đất ~0, TTC 2,8 s — không phải xe tạt đầu.
        {"sim_time_s": 2.0, "ego_speed_ms": 16.4, "radar_rel_velocity_ms": -16.37, "radar_ttc_s": 2.8},
        {"sim_time_s": 10.0, "ego_speed_ms": 16.6, "radar_rel_velocity_ms": -5.6, "radar_ttc_s": 1.55},
    ]
    summary = sensor_recorder.summarise(rows, [])
    assert summary["radar_min_ttc_s"] == 1.55
    assert summary["radar_min_ttc_static_s"] == 2.8


def test_summary_reports_braking_and_collision() -> None:
    rows = [
        {"sim_time_s": 0.1, "brake": 0.3, "imu_accel_x_ms2": -47.0},  # khởi tạo của ScenarioRunner
        {"sim_time_s": 0.5, "brake": 0.0, "imu_accel_x_ms2": 0.2, "radar_ttc_s": 3.0},
        {
            "sim_time_s": 1.0,
            "brake": 0.8,
            "imu_accel_x_ms2": -6.5,
            "imu_jerk_ms3": -13.4,
            "radar_ttc_s": 1.2,
            "ego_speed_ms": 8.0,
            "radar_rel_velocity_ms": -3.0,
        },
        {"sim_time_s": 1.5, "brake": 1.0, "imu_accel_x_ms2": -8.0, "obstacle_distance_m": 1.5},
        {"sim_time_s": 2.0, "brake": 1.0, "imu_accel_x_ms2": -40.0},  # xung lực đâm xe
    ]
    summary = sensor_recorder.summarise(rows, [{"sim_time_s": 2.0}])
    assert summary["radar_min_ttc_s"] == 1.2
    assert summary["max_deceleration_ms2"] == 8.0
    assert summary["max_abs_jerk_ms3"] == 13.4
    assert summary["first_brake_time_s"] == 1.0
    assert summary["duration_s"] == 1.9
    assert summary["impact_peak_accel_ms2"] == 40.0
    assert summary["collisions"] == 1
    assert summary["obstacle_min_distance_m"] == 1.5


def test_payload_matches_backend_contract_and_is_downsampled() -> None:
    """Payload phải qua ``SensorData`` (cấm trường lạ) — lệch là backend 422 và mất kết quả CARLA."""
    from src.models.schemas import ExecutionResult

    rows = [
        {
            "frame": i,
            "sim_time_s": i * 0.05,
            "ego_speed_ms": 8.0,
            "brake": 0.0,
            "steer": 0.0,
            "radar_points": 40,
            "radar_ttc_s": 3.0 - i * 0.002 if i % 7 else None,
            "obstacle_actor": "vehicle.tesla.model3",
            "imu_accel_x_ms2": -0.1,
            "imu_jerk_ms3": 0.4,
        }
        for i in range(1000)
    ]
    collisions = [{"frame": 990, "sim_time_s": 49.5, "other_actor": "vehicle.tesla.model3", "impulse_ns": 3323.9}]
    summary = {**sensor_recorder.summarise(rows, collisions), "error": "không phải số"}

    payload = sensor_recorder.to_payload(rows, collisions, summary, max_samples=100)

    assert len(payload["samples"]) <= 101
    assert payload["samples"][-1]["t"] == rows[-1]["sim_time_s"]
    assert "error" not in payload["summary"]
    result = ExecutionResult.model_validate(
        {"scenario_id": "sc", "xosc_path": "sc.xosc", "success": True, "sensor_data": payload}
    )
    assert result.sensor_data.collisions[0].impulse_ns == 3323.9
    assert result.sensor_data.samples[1].radar_ttc_s is not None

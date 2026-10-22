"""Phần xử lý số của ``worker/sensor_recorder.py`` — không cần CARLA."""

from __future__ import annotations

import math
from types import SimpleNamespace

import sensor_recorder


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


def test_receding_target_has_no_ttc() -> None:
    assert sensor_recorder.nearest_radar_target([_det(12.0, 1.5)])["radar_ttc_s"] is None


def test_summary_reports_braking_and_collision() -> None:
    rows = [
        {"sim_time_s": 0.1, "brake": 0.3, "imu_accel_x_ms2": -47.0},  # khởi tạo của ScenarioRunner
        {"sim_time_s": 0.5, "brake": 0.0, "imu_accel_x_ms2": 0.2, "radar_ttc_s": 3.0},
        {"sim_time_s": 1.0, "brake": 0.8, "imu_accel_x_ms2": -6.5, "imu_jerk_ms3": -13.4, "radar_ttc_s": 1.2},
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

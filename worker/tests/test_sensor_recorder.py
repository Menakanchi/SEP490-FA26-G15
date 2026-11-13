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


def _snap(x: float, y: float, vel: tuple, acc: tuple, yaw: float = 0.0) -> SimpleNamespace:
    v3 = lambda t: SimpleNamespace(x=t[0], y=t[1], z=t[2])  # noqa: E731
    tf = SimpleNamespace(location=SimpleNamespace(x=x, y=y, z=0.0), rotation=SimpleNamespace(yaw=yaw))
    return SimpleNamespace(get_transform=lambda: tf, get_velocity=lambda: v3(vel), get_acceleration=lambda: v3(acc))


def test_accel_along_velocity_sign_tells_speeding_up_from_braking() -> None:
    assert sensor_recorder.accel_along_velocity((10.0, 0.0, 0.0), (-6.0, 0.0, 0.0)) == -6.0
    assert sensor_recorder.accel_along_velocity((0.0, -3.0, 0.0), (0.0, -1.0, 0.0)) == 1.0
    # gia tốc vuông góc vận tốc: đổi hướng, không nhanh/chậm dần
    assert sensor_recorder.accel_along_velocity((5.0, 0.0, 0.0), (0.0, 2.0, 0.0)) == 0.0
    # đứng yên: không xác định hướng, không chia cho 0
    assert sensor_recorder.accel_along_velocity((0.0, 0.0, 0.0), (1.0, 0.0, 0.0)) is None


def test_gt_row_keeps_full_vectors() -> None:
    row = sensor_recorder.gt_row(7, 31, "target", "walker.pedestrian.0001", _snap(60.0, -3.6, (0.0, 3.0, 0.0), (0.0, 0.5, 0.0), 90.0))
    assert row == {
        "frame": 7, "actor_id": 31, "role": "target", "type_id": "walker.pedestrian.0001",
        "x_m": 60.0, "y_m": -3.6, "z_m": 0.0, "yaw_deg": 90.0,
        "vx_ms": 0.0, "vy_ms": 3.0, "vz_ms": 0.0, "ax_ms2": 0.0, "ay_ms2": 0.5, "az_ms2": 0.0,
        "speed_ms": 3.0, "a_along_v_ms2": 0.5,
    }
    assert set(row) | {"sim_time_s"} == set(sensor_recorder.GT_COLUMNS)


def _gt(frame: int, role: str, actor_id: int, vx: float, vy: float) -> dict:
    return {"frame": frame, "role": role, "actor_id": actor_id, "vx_ms": vx, "vy_ms": vy, "vz_ms": 0.0,
            "speed_ms": round((vx**2 + vy**2) ** 0.5, 3)}


def test_impact_uses_last_frame_before_contact_and_vector_difference() -> None:
    rows = [
        _gt(10, "ego", 1, 8.0, 0.0), _gt(10, "target", 31, 0.0, 3.0),
        _gt(11, "ego", 1, 6.0, 0.0), _gt(11, "target", 31, 0.0, 4.0),
        _gt(12, "ego", 1, 1.0, 0.0), _gt(12, "target", 31, 9.0, 9.0),  # frame va chạm: đã chịu xung lực
    ]
    impact = sensor_recorder.impact_from_ground_truth({"frame": 12, "other_actor_id": 31}, rows)
    # băng ngang: |(6,0) - (0,4)| = 7,211, không phải 6 - 4 = 2
    assert impact == {"gt_frame_before": 11, "ego_speed_before_ms": 6.0, "other_speed_before_ms": 4.0,
                      "relative_speed_before_ms": 7.211}


def test_impact_without_ground_truth_is_left_empty_not_zero() -> None:
    assert sensor_recorder.impact_from_ground_truth({"frame": 5, "other_actor_id": 99}, [_gt(4, "ego", 1, 5.0, 0.0)]) == {}
    assert sensor_recorder.impact_from_ground_truth({"frame": 5, "other_actor_id": None}, []) == {}


def test_ground_truth_summary_reports_step_gaps_and_actors() -> None:
    rows = [dict(_gt(f, "ego", 1, 5.0, 0.0), sim_time_s=round((f - 100) * 0.01, 3), type_id="vehicle.audi.etron")
            for f in (100, 101, 102, 104)]
    rows.append(dict(_gt(101, "target", 31, 0.0, 3.0), sim_time_s=0.01, type_id="walker.pedestrian.0001"))
    rows[0]["ax_ms2"] = -1664.37  # ScenarioRunner dịch xe lúc khởi tạo
    s = sensor_recorder.summarise_ground_truth(rows)
    assert s["frames"] == 4
    assert s["missing_frames"] == 1
    assert (s["implausible_accel_rows"], s["implausible_accel_last_t"]) == (1, 0.0)
    assert s["step_s"] == {"min": 0.01, "max": 0.02, "mean": 0.0133}
    assert [(a["role"], a["rows"]) for a in s["actors"]] == [("ego", 4), ("target", 1)]
    assert s["coordinates"]["units"]["acceleration"] == "m/s^2"

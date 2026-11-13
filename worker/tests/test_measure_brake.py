"""Phần tính của ``measure_brake.py`` (không cần CARLA)."""

from __future__ import annotations

import pytest
from measure_brake import LOW_SPEED_MPS, decel_from_samples, pedal_linearity, physics_for, stopping_distance


def _braking(v0: float, decel: float, dt: float = 0.01) -> list[tuple[float, float]]:
    samples, t, v = [], 0.0, v0
    while v > 0:
        samples.append((round(t, 4), v))
        # Dưới LOW_SPEED_MPS CARLA dừng gần như tức thì (TD-17): mô phỏng bằng giảm tốc rất lớn.
        v = max(0.0, v - (decel if v > LOW_SPEED_MPS else 25.0) * dt)
        t += dt
    samples.append((round(t, 4), 0.0))
    return samples


def test_decel_is_measured_on_the_band_above_the_instant_stop() -> None:
    result = decel_from_samples(_braking(40 / 3.6, 4.6), 40 / 3.6)
    assert result["decel_mps2"] == pytest.approx(4.6, abs=0.01)  # đoạn dừng tức thì dưới 6 m/s không kéo số lên
    assert result["to_mps"] >= LOW_SPEED_MPS


def test_too_few_samples_give_no_value_instead_of_a_guess() -> None:
    assert decel_from_samples([(0.0, 5.0), (0.01, 4.0)], 5.0)["decel_mps2"] is None


def test_stopping_distance_integrates_speed() -> None:
    assert stopping_distance([(0.0, 10.0), (1.0, 0.0)]) == 5.0


def test_physics_matches_the_bundle_shape_backend_sends() -> None:
    # ADR-051: backend đưa max_brake_torque_nm vào physics.wheels dạng một object cho mọi bánh; phép đo phải ép đúng như vậy.
    assert physics_for(2100.0, 2400.0) == {"mass": 2100.0, "wheels": {"max_brake_torque": 2400.0}}
    assert physics_for(None, None) == {}


def test_pedal_linearity_is_relative_to_full_brake_at_the_same_speed() -> None:
    rows = [{"speed_kmh": 50, "pedal": 1.0, "decel_mps2": 9.6}, {"speed_kmh": 50, "pedal": 0.5, "decel_mps2": 4.32},
            {"speed_kmh": 70, "pedal": 0.5, "decel_mps2": 4.0}]  # 70 km/h không có phép đo 100%: không suy đoán
    assert pedal_linearity(rows) == [{"speed_kmh": 50, "pedal": 0.5, "decel_ratio": 0.45, "error": -0.05}]

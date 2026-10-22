"""Phần tính của ``measure_brake.py`` (không cần CARLA)."""

from __future__ import annotations

import pytest
from measure_brake import LOW_SPEED_MPS, decel_from_samples, stopping_distance


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

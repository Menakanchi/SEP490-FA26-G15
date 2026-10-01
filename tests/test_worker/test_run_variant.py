"""Phần thuần của ``worker/run_variant.py`` (CARLA runner) — kiểm không cần server CARLA.

Phần gọi CARLA thật được kiểm tay trên máy có CARLA; bằng chứng ở exec plan
``docs/exec-plans/completed/2026-10-01-carla-variant-runner.md``.
"""

from __future__ import annotations

import sys
from pathlib import Path

import pytest

WORKER = Path(__file__).parents[2] / "worker"
sys.path.insert(0, str(WORKER))
import run_variant  # noqa: E402

sys.path.remove(str(WORKER))

from src.services.vehicsim import simulator  # noqa: E402
from src.services.vehicsim.bundle import read_spec  # noqa: E402
from src.services.vehicsim.simulator import CURB_STOP_Y_M, PEDESTRIAN_START_Y_M, PedestrianCrossingCase  # noqa: E402


def test_module_imports_without_carla() -> None:
    """``carla`` chỉ được import trong ``run_on_carla`` — nạp module không cần CARLA."""
    assert "carla" not in vars(run_variant)


@pytest.mark.parametrize("weather", ["CLEAR", "CLOUDY", "RAIN", "HEAVY_RAIN", "FOG"])
@pytest.mark.parametrize("time_of_day", ["DAY", "DUSK", "NIGHT"])
def test_every_weather_code_maps_to_carla_parameters(weather: str, time_of_day: str) -> None:
    params = run_variant.weather_parameters(weather, time_of_day)
    assert set(params) >= {"cloudiness", "precipitation", "fog_density", "wetness", "sun_altitude_angle"}
    assert (params["sun_altitude_angle"] < 0) == (time_of_day == "NIGHT")
    assert (params["precipitation"] > 0) == (weather in ("RAIN", "HEAVY_RAIN"))


def test_crossing_frame_matches_the_kinematic_axes() -> None:
    """CARLA tay trái: đi theo +x thì bên phải là +y. Người đi bộ bên phải -> y âm như bộ động học."""
    frame = run_variant.CrossingFrame(ox=100.0, oy=50.0, fx=1.0, fy=0.0, rx=0.0, ry=1.0)
    assert frame.along(90.0, 50.0) == -10.0  # mũi xe còn cách vạch 10 m -> gap = 10
    assert frame.left(100.0, 50.0 - PEDESTRIAN_START_Y_M) == pytest.approx(PEDESTRIAN_START_Y_M)
    assert frame.velocity_left(0.0, -1.4) == 1.4  # đi về bên trái
    assert frame.velocity_along(11.1, 0.0) == 11.1

    # Đường hướng +y (yaw 90°): bên phải là -x, nên người đứng ở x = -3,6 là bên phải.
    rotated = run_variant.CrossingFrame(ox=0.0, oy=0.0, fx=0.0, fy=1.0, rx=-1.0, ry=0.0)
    assert rotated.along(0.0, -20.0) == -20.0
    assert rotated.left(-3.6, 0.0) == -3.6 and rotated.left(3.6, 0.0) == 3.6


def test_walker_speed_follows_the_kinematic_curb_rule() -> None:
    crossing = PedestrianCrossingCase(ego_speed_kmh=40, trigger_distance_m=20, pedestrian_speed_mps=1.5)
    curb = PedestrianCrossingCase(ego_speed_kmh=40, trigger_distance_m=20, pedestrian_speed_mps=1.5, stops_at_curb=True)

    assert run_variant.walker_speed(crossing, PEDESTRIAN_START_Y_M, started=False) == 0.0
    assert run_variant.walker_speed(crossing, 0.0, started=True) == 1.5
    assert run_variant.walker_speed(curb, PEDESTRIAN_START_Y_M, started=True) == 1.5
    assert 0.0 < run_variant.walker_speed(curb, CURB_STOP_Y_M - 0.2, started=True) < 1.5
    assert run_variant.walker_speed(curb, CURB_STOP_Y_M, started=True) == 0.0


def test_brake_pedal_maps_deceleration_into_zero_one() -> None:
    assert run_variant.brake_pedal(0.0, 0.0, 4.6) == 0.0
    assert run_variant.brake_pedal(2.3, 2.3, 4.6) == pytest.approx(0.5)
    assert run_variant.brake_pedal(8.0, 4.0, 4.6) == 1.0
    assert run_variant.brake_pedal(1.0, 9.0, 4.6) == 0.0  # đo thấy phanh quá tay -> nhả


def test_decel_meter_ignores_cruise_jitter_averages_sawtooth_and_clamps() -> None:
    meter = run_variant.DecelMeter(limit=9.81)
    assert [meter.update(v, braking=False) for v in (11.0, 11.2, 11.0)] == [0.0, 0.0, 0.0]

    meter = run_variant.DecelMeter(limit=9.81)
    readings = [meter.update(v, braking=True) for v in (10.79, 10.69, 10.33, 10.23, 9.87)]
    assert readings[2:] == pytest.approx([4.6, 4.6, 4.6], abs=0.01)  # 2 rồi 7,3 m/s² xen kẽ

    meter.update(6.0, braking=True)
    assert meter.update(3.5, braking=True) == 9.81 and meter.clamped == 2


def test_required_length_covers_the_approach_and_the_pass() -> None:
    spec = read_spec({"ego_speed_kmh": 130, "trigger_distance_m": 80, "pedestrian_speed_mps": 1.4})
    assert run_variant.required_length_m(spec) == pytest.approx(80 + 130 / 3.6 * 1.5 + 4.75 + 15)


def test_runner_reuses_the_kinematic_aeb_and_result_builders() -> None:
    """Cùng AEB, cùng frame, cùng số đo: đổi ``AebStack`` là đổi cả hai bộ mô phỏng."""
    for name in ("new_aeb_stack", "make_frame", "build_outcome", "ground_truth_ttc", "MotionStats"):
        assert getattr(run_variant, name) is getattr(simulator, name), name

"""Phần thuần của ``worker/run_variant.py`` (CARLA runner) — kiểm không cần server CARLA.

Phần gọi CARLA thật được kiểm tay trên máy có CARLA; bằng chứng ở exec plan
``docs/exec-plans/completed/2026-10-01-carla-variant-runner.md``.
"""

from __future__ import annotations

import sys
from pathlib import Path
from types import SimpleNamespace

import pytest

WORKER = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(WORKER))
import run_variant  # noqa: E402
from vehicsim_core import simulator  # noqa: E402
from vehicsim_core.bundle import WHEEL_FIELDS, read_spec  # noqa: E402
from vehicsim_core.simulator import CURB_STOP_Y_M, PEDESTRIAN_START_Y_M, PedestrianCrossingCase  # noqa: E402


def test_module_imports_without_carla() -> None:
    """``carla`` chỉ được import trong ``run_on_carla`` — nạp module không cần CARLA."""
    assert "carla" not in vars(run_variant)


def _fake_physics_control() -> SimpleNamespace:
    """Như ``ego.get_physics_control()`` của audi.etron: 4 bánh, vị trí tính bằng cm."""

    def wheel(x: float, y: float) -> SimpleNamespace:
        values = dict.fromkeys(WHEEL_FIELDS, 1.0)
        values.update(tire_friction=3.5, max_brake_torque=700.0)
        return SimpleNamespace(**values, position=SimpleNamespace(x=x, y=y, z=30.0))

    return SimpleNamespace(
        mass=2500.0,
        drag_coefficient=0.3,
        max_rpm=6000.0,
        moi=1.0,
        final_ratio=4.0,
        center_of_mass=SimpleNamespace(x=0.0, y=0.0, z=-0.3),
        wheels=[wheel(300, -80), wheel(300, 80), wheel(5, -80), wheel(5, 80)],
    )


def test_db_vehicle_is_forced_into_carla_and_checked() -> None:
    """ADR-033: blueprint + vật lý từ DB vào CARLA; cái gì CARLA không nhận thì bảng đối chiếu nói rõ."""
    carla = {
        "blueprint": "vehicle.audi.etron",
        "physics": {"mass": 2400.0, "wheels": {"max_brake_torque": 900.0}},
        "dimensions": {"height_m": 1.67, "wheelbase_m": 2.95},
    }
    spec = read_spec(
        {
            "ego_speed_kmh": 40,
            "trigger_distance_m": 20,
            "pedestrian_speed_mps": 1.5,
            "vehicle": {"length_m": 4.75, "width_m": 1.93, "max_brake_decel_mps2": 9.5, "carla": carla},
        }
    )
    assert run_variant.ego_blueprint(spec, None) == "vehicle.audi.etron"
    assert run_variant.ego_blueprint(spec, "vehicle.tesla.model3") == "vehicle.tesla.model3"
    assert run_variant.ego_blueprint(read_spec({**_IR}), None) == run_variant.DEFAULT_BLUEPRINT

    pc = _fake_physics_control()
    run_variant.apply_physics_overrides(
        pc, spec.vehicle_carla["physics"], lambda x, y, z: SimpleNamespace(x=x, y=y, z=z)
    )
    assert pc.mass == 2400.0 and {w.max_brake_torque for w in pc.wheels} == {900.0}
    assert {w.tire_friction for w in pc.wheels} == {3.5}  # trường không yêu cầu thì giữ nguyên

    actual = run_variant.physics_snapshot(pc, SimpleNamespace(x=2.45, y=0.965, z=0.835))
    assert actual["wheelbase_m"] == pytest.approx(2.95)
    rows = {
        r["param"]: r
        for r in run_variant.vehicle_check(spec, actual, blueprint="vehicle.audi.etron", full_brake_decel=4.6)
    }
    assert {k: r["status"] for k, r in rows.items()} == {
        "blueprint": "MATCH",
        "length_m": "MISMATCH",  # 4,75 cấu hình vs 4,9 của mesh — không ép được
        "width_m": "MATCH",
        "height_m": "MATCH",
        "wheelbase_m": "MATCH",
        "mass": "APPLIED",
        "wheels.max_brake_torque": "APPLIED",
        "max_brake_decel_mps2": "UNREACHABLE",  # 9,5 m/s² nhưng CARLA phanh hết cỡ ~4,6
    }
    assert "TD-17" in rows["wheels.max_brake_torque"]["note"]

    pc.mass = 2500.0  # CARLA không nhận
    weaker = read_spec({**_IR, "vehicle": {"max_brake_decel_mps2": 4.0, "carla": carla}})
    rows = {
        r["param"]: r["status"]
        for r in run_variant.vehicle_check(
            weaker,
            run_variant.physics_snapshot(pc, SimpleNamespace(x=2.45, y=0.965, z=0.835)),
            blueprint="vehicle.tesla.model3",
            full_brake_decel=4.6,
        )
    }
    assert rows["mass"] == "NOT_APPLIED"
    assert rows["blueprint"] == "CLI_OVERRIDE"
    assert rows["max_brake_decel_mps2"] == "CONTROLLER_CAP"


def test_per_wheel_overrides_must_match_the_wheel_count() -> None:
    with pytest.raises(RuntimeError, match="2 phần tử nhưng xe có 4 bánh"):
        run_variant.apply_physics_overrides(_fake_physics_control(), {"wheels": [{"radius": 37.0}] * 2}, None)


_IR = {"ego_speed_kmh": 40, "trigger_distance_m": 20, "pedestrian_speed_mps": 1.5}


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

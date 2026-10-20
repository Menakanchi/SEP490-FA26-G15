"""Bước 0,01 s (100 Hz) cho đường CARLA mà không đổi hành vi AEB dùng chung với bộ động học."""

from __future__ import annotations

from pathlib import Path

import pytest
from openscenario_export import (
    LEGACY_FORMAT,
    PERCEPTION_PERIOD_S,
    STEP_S,
    export_xosc,
    read_profile,
    read_xosc,
)
from run_variant import DecelMeter
from vehicsim_core.aeb_stack import AebParams, AebStack
from vehicsim_core.bundle import BundleError, read_spec

IR = {"ego_speed_kmh": 40, "trigger_distance_m": 25, "pedestrian_speed_mps": 3, "weather": "CLEAR", "time_of_day": "DAY"}
SPEED = 11.0


def _stack(dt: float, period: float | None = None) -> AebStack:
    return AebStack(AebParams(), seed=7, weather="RAIN", time_of_day="NIGHT", vehicle_length_m=4.9, decel_limit=8.0,
                    events=[], dt=dt, perception_period_s=period)


def _drive(stack: AebStack, dt: float, duration_s: float = 3.0) -> list:
    """Cùng một thế giới liên tục (xe tiến tới người đứng trên đường) lấy mẫu theo ``dt``."""
    ticks = []
    for k in range(round(duration_s / dt) + 1):
        t = round(k * dt, 6)
        ticks.append(stack.step(t, gap=30.0 - SPEED * t, ped_y=0.3, ped_vy=0.0, ego_v=SPEED))
    return ticks


def test_v3_profile_is_100hz_with_20hz_perception(tmp_path: Path) -> None:
    path = tmp_path / "a.xosc"
    path.write_text(export_xosc(read_spec(IR)), encoding="utf-8")
    assert read_profile(path) == ("-xosc3", STEP_S, PERCEPTION_PERIOD_S) == ("-xosc3", 0.01, 0.05)


def test_v2_file_still_runs_as_20hz_with_its_own_identity(tmp_path: Path) -> None:
    text = export_xosc(read_spec(IR)).replace("vehicsim.xosc/v3", LEGACY_FORMAT)
    path = tmp_path / "old.xosc"
    path.write_text(text, encoding="utf-8")
    assert read_profile(path) == ("-xosc2", 0.05, 0.05)
    assert read_xosc(path) == read_spec(IR)


@pytest.mark.parametrize("step,period", [("0.05", "0.01"), ("0.01", "0.025"), ("0", "0.05"), ("x", "0.05")])
def test_incompatible_timing_metadata_is_rejected(tmp_path: Path, step: str, period: str) -> None:
    text = (export_xosc(read_spec(IR)).replace('"vs_fixed_delta_seconds" parameterType="string" value="0.01"',
                                                f'"vs_fixed_delta_seconds" parameterType="string" value="{step}"')
            .replace('value="0.05" />\n    <ParameterDeclaration name="vs_seed"', f'value="{period}" />\n    <ParameterDeclaration name="vs_seed"'))
    path = tmp_path / "bad.xosc"
    path.write_text(text, encoding="utf-8")
    with pytest.raises(BundleError):
        read_profile(path)


def test_perception_updates_on_the_sensor_period_while_control_runs_every_step() -> None:
    ticks = _drive(_stack(0.01, 0.05), 0.01)
    detected = [t.confidence for t in ticks]
    # Nhiễu độ tin cậy chỉ rút lại mỗi 5 bước: các bước còn lại giữ nguyên lần cảm biến gần nhất.
    for start in range(0, len(detected) - 5, 5):
        assert len(set(detected[start:start + 5])) == 1
    assert len(set(detected)) > 5
    braking = [t.decel_cmd for t in ticks if t.decel_cmd > 0]
    assert len(braking) > 20
    ramp = [round(b - a, 6) for a, b in zip(braking, braking[1:]) if b < 8.0]
    assert set(ramp) == {round(AebParams().decel_ramp_rate * 0.01, 6)}  # giảm tốc tăng theo bước 0,01 s, không theo 0,05 s


def test_decisions_match_the_20hz_stack_on_the_same_world() -> None:
    coarse, fine = _stack(0.05), _stack(0.01, 0.05)
    _drive(coarse, 0.05)
    _drive(fine, 0.01)
    # Cùng chuỗi nhiễu, cùng độ trễ perception 0,1 s: phát hiện, FCW và quyết định rơi vào đúng cùng khung cảm biến.
    assert (fine.first_detection_t, fine.fcw_t, fine.decision_t) == (coarse.first_detection_t, coarse.fcw_t, coarse.decision_t)
    assert fine.decision_t is not None
    # Phanh bắt đầu ngay khi hết trễ (độ phân giải 0,01 s thay vì 0,05 s).
    assert fine.brake_onset_t is not None and coarse.brake_onset_t is not None
    assert 0 <= coarse.brake_onset_t - fine.brake_onset_t < 0.05


def test_perception_lag_is_time_based_not_frame_counted() -> None:
    assert _stack(0.05).lag_frames == 2
    assert _stack(0.01, 0.05).lag_frames == 10


def test_default_stack_is_unchanged_for_the_kinematic_simulator() -> None:
    assert _stack(0.05)._perception_every == 1


def test_period_must_be_a_multiple_of_the_step() -> None:
    with pytest.raises(ValueError, match="bội số"):
        _stack(0.01, 0.025)


def test_decel_meter_window_is_a_time_span() -> None:
    """Cùng tín hiệu giảm tốc 4,6 m/s² lấy mẫu 20 Hz và 100 Hz phải ra cùng giá trị đo."""
    def measure(dt: float, window: int) -> float:
        meter, speed = DecelMeter(limit=9.81, window=window, dt=dt), 11.0
        value = 0.0
        for _ in range(round(0.5 / dt)):
            speed -= 4.6 * dt
            value = meter.update(speed, braking=True)
        return value

    assert measure(0.05, 2) == pytest.approx(4.6, abs=1e-6)
    assert measure(0.01, 10) == pytest.approx(4.6, abs=1e-6)

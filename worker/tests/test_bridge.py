"""Client cầu nối Java (ADR-042) và lớp vật lý CARLA mỏng. Test cầu nối chạy JVM thật từ ``target/classes`` (cần ``mvnw compile``)."""

from __future__ import annotations

from pathlib import Path
from types import SimpleNamespace

import bridge
import carla_physics
import pytest

CORE_CLASSES = bridge.ROOT / "target" / "classes" / "com" / "vehicsim" / "core" / "bridge" / "BridgeMain.class"
needs_core = pytest.mark.skipif(not CORE_CLASSES.is_file(), reason="chưa có lõi Java đã biên dịch (target/classes): chạy mvnw compile")


@needs_core
def test_xosc_info_reports_the_time_profile(xosc: Path) -> None:
    assert bridge.xosc_info(xosc) == {"suffix": "-xosc3", "step_s": 0.01, "perception_period_s": 0.05}


@needs_core
def test_xosc_info_rejects_files_outside_the_contract(tmp_path: Path) -> None:
    bad = tmp_path / "bad.xosc"
    bad.write_text("<OpenSCENARIO><ParameterDeclarations/></OpenSCENARIO>", encoding="utf-8")
    with pytest.raises(ValueError, match="vs_format"):
        bridge.xosc_info(bad)


@needs_core
def test_session_handshake_open_and_clean_shutdown(xosc: Path, tmp_path: Path) -> None:
    session = bridge.Bridge(tmp_path / "bridge.log")
    try:
        assert session.core
        opened = session.request("open", timeout=bridge.OPEN_TIMEOUT_S, xosc=str(xosc), out_dir=str(tmp_path / "out"), simulator_version="carla-0.9.16-xosc3")
        assert opened["profile"] == {"suffix": "-xosc3", "step_s": 0.01, "perception_period_s": 0.05}
        assert opened["constants"]["pedestrian_start_y_m"] == -3.6
        with pytest.raises(bridge.BridgeError, match="Java báo lỗi cho step"):
            session.request("step", t=0.0)  # chưa init: lỗi giao thức, không phải kết quả giả
        assert session.request("finish", reason="TIMEOUT")["finished"] is False  # chưa có khung nào: không ghi gì
    finally:
        session.close()
    assert session._proc.returncode == 0  # Java thoát vì stdin đóng


@needs_core
def test_a_dead_java_process_is_an_error_not_a_default(xosc: Path, tmp_path: Path) -> None:
    session = bridge.Bridge(tmp_path / "bridge.log")
    session._proc.kill()
    session._proc.wait()
    with pytest.raises(bridge.BridgeError):
        session.request("open", timeout=2.0, xosc=str(xosc), out_dir=str(tmp_path), simulator_version="x")
    session.close()


def test_missing_java_or_classes_are_reported_clearly(monkeypatch: pytest.MonkeyPatch, tmp_path: Path) -> None:
    monkeypatch.setenv("VEHICSIM_JAVA", str(tmp_path / "no-java"))
    monkeypatch.setenv("VEHICSIM_CORE_CLASSPATH", str(tmp_path / "no-classes"))
    with pytest.raises(bridge.BridgeError, match="lõi Java"):
        bridge.java_command()


AEB_LOGIC_MARKERS = ("AebStack", "ttc_threshold", "decel_cmd =", "brake_pedal(", "DecelMeter", "CrossingFrame", "evaluate(")


def test_no_aeb_logic_lives_in_the_python_worker() -> None:
    """Luật 8 (ADR-042): logic AEB, mô phỏng và chấm điểm chỉ ở ``com.vehicsim.core``; ``worker/`` chỉ còn adapter CARLA."""
    worker = bridge.ROOT / "worker"
    modules = sorted(worker.glob("*.py"))
    assert (worker / "vehicsim_aeb_control.py") in modules
    for module in modules:
        text = module.read_text(encoding="utf-8")
        for marker in AEB_LOGIC_MARKERS:
            assert marker not in text, f"{module.name} không được chứa logic AEB: {marker}"
        assert "vehicsim_core" not in text, f"{module.name} còn tham chiếu lõi Python đã xóa (vehicsim_core)"


def test_the_python_core_is_gone() -> None:
    worker = bridge.ROOT / "worker"
    assert not (worker / "vehicsim_core").exists()
    for name in ("kinematic_sim.py", "sim_common.py", "openscenario_export.py", "run_variant.py"):
        assert not (worker / name).exists(), f"{name} đã thuộc về lõi Java và phải ở lại git history"


def test_apply_physics_overrides_sets_scalars_com_and_wheels() -> None:
    wheels = [SimpleNamespace(tire_friction=1.0, max_brake_torque=1000.0) for _ in range(4)]
    pc = SimpleNamespace(mass=1500.0, drag_coefficient=0.3, center_of_mass=None, wheels=wheels)
    physics = {"mass": 2100.0, "center_of_mass": {"x": 0.0, "y": 0.1, "z": -0.3}, "wheels": {"tire_friction": 3.0}}
    carla_physics.apply_physics_overrides(pc, physics, lambda x, y, z: (x, y, z))
    assert pc.mass == 2100.0 and pc.drag_coefficient == 0.3
    assert pc.center_of_mass == (0.0, 0.1, -0.3)
    assert [w.tire_friction for w in pc.wheels] == [3.0] * 4 and [w.max_brake_torque for w in pc.wheels] == [1000.0] * 4


def test_apply_physics_overrides_refuses_unknown_fields_and_wheel_count_mismatch() -> None:
    pc = SimpleNamespace(mass=1.0, wheels=[SimpleNamespace(tire_friction=1.0)] * 4, center_of_mass=None)
    with pytest.raises(RuntimeError, match="không có trường"):
        carla_physics.apply_physics_overrides(pc, {"bogus": 1.0}, lambda *a: a)
    with pytest.raises(RuntimeError, match="3 phần tử nhưng xe có 4 bánh"):
        carla_physics.apply_physics_overrides(pc, {"wheels": [{"tire_friction": 2.0}] * 3}, lambda *a: a)


def test_wheelbase_and_snapshot_read_back_what_the_vehicle_uses() -> None:
    positions = [SimpleNamespace(x=150.0, y=-80.0), SimpleNamespace(x=150.0, y=80.0), SimpleNamespace(x=-150.0, y=-80.0), SimpleNamespace(x=-150.0, y=80.0)]
    assert carla_physics.wheelbase_m(positions) == pytest.approx(3.0)
    assert carla_physics.wheelbase_m(positions[:3]) is None
    wheel = SimpleNamespace(**{f: 1.5 for f in carla_physics.WHEEL_FIELDS}, position=positions[0])
    pc = SimpleNamespace(**{f: 2.0 for f in carla_physics.PHYSICS_SCALARS}, center_of_mass=SimpleNamespace(x=0.0, y=0.0, z=-0.3), wheels=[wheel] * 4)
    snap = carla_physics.physics_snapshot(pc, SimpleNamespace(x=2.4, y=1.0, z=0.8))
    assert snap["length_m"] == pytest.approx(4.8) and snap["width_m"] == pytest.approx(2.0) and snap["height_m"] == pytest.approx(1.6)
    assert snap["center_of_mass"]["z"] == -0.3 and len(snap["wheels"]) == 4 and snap["mass"] == 2.0


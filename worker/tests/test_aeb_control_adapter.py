"""Adapter ScenarioRunner (``vehicsim_aeb_control.py``) với ``carla``/``srunner`` giả: chạy được không cần CARLA.

Phần giả làm đúng hai hành vi đã đọc trong ScenarioRunner/CARLA 0.9.16: ``NpcVehicleControl.run_step`` lấy lệnh từ ``LocalPlanner.run_step`` rồi
``apply_control``; ``Vehicle.get_control()`` chỉ trả lệnh đã có hiệu lực ở tick trước.
"""

from __future__ import annotations

import importlib
import sys
import types
from types import SimpleNamespace

import pytest


class FakeControl(SimpleNamespace):
    pass


class FakeVehicle:
    def __init__(self) -> None:
        self.is_alive = True
        self.applied: list[FakeControl] = []
        self._ticked = FakeControl(steer=0.0, throttle=0.0, brake=0.0)

    def tick(self) -> None:  # server tick: lệnh cuối cùng của tick này có hiệu lực
        if self.applied:
            self._ticked = self.applied[-1]

    def get_control(self) -> FakeControl:
        return FakeControl(**vars(self._ticked))

    def apply_control(self, control: FakeControl) -> None:
        self.applied.append(control)

    def get_transform(self):  # noqa: ANN201
        return SimpleNamespace(location=SimpleNamespace(x=0.0, y=0.0), get_forward_vector=lambda: SimpleNamespace(x=1.0, y=0.0))

    def get_velocity(self):  # noqa: ANN201
        return SimpleNamespace(x=11.0, y=0.0)


class FakePlanner:
    def __init__(self) -> None:
        self.calls = 0

    def run_step(self, debug: bool = False) -> FakeControl:
        self.calls += 1
        return FakeControl(steer=0.1 * self.calls, throttle=0.5, brake=0.0)


class FakeNpcVehicleControl:
    def __init__(self, actor, args=None) -> None:  # noqa: ANN001
        self._actor = actor
        self._local_planner = FakePlanner()
        self._target_speed = 11.0
        self._init_speed = False

    def run_step(self) -> None:
        control = self._local_planner.run_step(debug=False)
        self._actor.apply_control(control)

    def reset(self) -> None:
        pass


class FakeBridge:
    def __init__(self, log) -> None:  # noqa: ANN001
        self.requests: list[str] = []
        self.steps: list[dict] = []

    def request(self, op: str, timeout: float = 10.0, **fields) -> dict:
        self.requests.append(op)
        if op == "step":
            self.steps.append(fields)
        if op == "open":
            return {"physics": {}, "constants": {"pedestrian_start_y_m": -3.6}}
        return {"skip": False, "decel_cmd": 3.0, "braking": True, "pedal": 0.6, "finished": None}

    def close(self, grace_s: float = 5.0) -> None:
        pass


@pytest.fixture
def adapter(monkeypatch: pytest.MonkeyPatch):  # noqa: ANN201
    carla = types.ModuleType("carla")
    carla.VehicleControl = FakeControl
    carla.Vector3D = lambda *a: a
    modules = {
        "carla": carla,
        "srunner": types.ModuleType("srunner"),
        "srunner.scenariomanager": types.ModuleType("srunner.scenariomanager"),
        "srunner.scenariomanager.actorcontrols": types.ModuleType("srunner.scenariomanager.actorcontrols"),
        "srunner.scenariomanager.actorcontrols.npc_vehicle_control": types.ModuleType("npc_vehicle_control"),
        "srunner.scenariomanager.carla_data_provider": types.ModuleType("carla_data_provider"),
        "srunner.scenariomanager.timer": types.ModuleType("timer"),
    }
    modules["srunner.scenariomanager.actorcontrols.npc_vehicle_control"].NpcVehicleControl = FakeNpcVehicleControl
    modules["srunner.scenariomanager.carla_data_provider"].CarlaDataProvider = SimpleNamespace(update_osc_global_params=lambda params: None)
    clock = SimpleNamespace(t=0.0)
    modules["srunner.scenariomanager.timer"].GameTime = SimpleNamespace(get_time=lambda: clock.t)
    for name, module in modules.items():
        monkeypatch.setitem(sys.modules, name, module)
    monkeypatch.delitem(sys.modules, "vehicsim_aeb_control", raising=False)
    module = importlib.import_module("vehicsim_aeb_control")
    monkeypatch.setattr(module, "Bridge", FakeBridge)
    return module, clock


def test_brake_override_keeps_this_ticks_steering(adapter, tmp_path) -> None:  # noqa: ANN001
    module, clock = adapter
    ego = FakeVehicle()
    ctrl = module.VehicsimAebControl(ego, {"out_dir": str(tmp_path), "xosc_file": "x.xosc", "simulator_version": "carla-0.9.16-xosc4"})
    # Bỏ qua _initialize (cần world CARLA): đặt sẵn trạng thái sau khi đã thấy người đi bộ.
    ctrl.initialized, ctrl.started_at = True, 0.0
    ctrl.walker = SimpleNamespace(get_location=lambda: SimpleNamespace(x=20.0, y=-3.6), get_velocity=lambda: SimpleNamespace(x=0.0, y=1.0))

    for tick in (1, 2, 3):
        clock.t = tick * 0.01
        ctrl.run_step()
        last = ego.applied[-1]
        assert last.steer == pytest.approx(0.1 * tick), "lệnh lái phải là lệnh planner vừa tính ở tick này, không phải tick trước"
        assert (last.throttle, last.brake) == (0.0, 0.6)  # phanh/ga do lõi Java quyết định
        ego.tick()
    assert all("radar" not in step for step in ctrl.bridge.steps), "lõi không yêu cầu radar thì step giữ nguyên như trước ADR-043"


def test_radar_points_of_the_latest_measurement_are_forwarded_raw(adapter, tmp_path) -> None:  # noqa: ANN001
    module, clock = adapter
    ctrl = module.VehicsimAebControl(FakeVehicle(), {"out_dir": str(tmp_path), "xosc_file": "x.xosc", "simulator_version": "carla-0.9.16-xosc4"})
    ctrl.initialized, ctrl.started_at = True, 0.0
    ctrl.walker = SimpleNamespace(get_location=lambda: SimpleNamespace(x=20.0, y=-3.6), get_velocity=lambda: SimpleNamespace(x=0.0, y=1.0))
    ctrl.radar = object()  # đã gắn cảm biến; điểm đến qua callback
    clock.t = 0.01
    ctrl.run_step()  # chưa có lần đo nào: gửi danh sách rỗng, không bịa điểm
    ctrl._radar_points = [[22.5, -0.15, 0.03, -10.6]]
    clock.t = 0.02
    ctrl.run_step()
    assert [s["radar"] for s in ctrl.bridge.steps] == [[], [[22.5, -0.15, 0.03, -10.6]]]

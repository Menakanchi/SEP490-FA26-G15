"""Vòng đời run CARLA: dọn world và dừng theo cờ, không cần server CARLA."""

from __future__ import annotations

import subprocess
import sys
import threading
import time
from types import SimpleNamespace

import pytest
import run_xosc


class FakeActor:
    def __init__(self, type_id: str, log: list[str], fail_destroy: bool = False) -> None:
        self.type_id = type_id
        self._log = log
        self._fail_destroy = fail_destroy

    def stop(self) -> None:
        self._log.append(f"stop {self.type_id}")

    def destroy(self) -> None:
        if self._fail_destroy:
            raise RuntimeError("not found")  # đã bị xoá cùng chủ
        self._log.append(f"destroy {self.type_id}")


class FakeWorld:
    def __init__(self, actors: list[FakeActor], synchronous: bool) -> None:
        self.actors = actors
        self.settings = SimpleNamespace(synchronous_mode=synchronous, fixed_delta_seconds=0.05)
        self.ticks = 0

    def get_settings(self):
        return self.settings

    def apply_settings(self, settings) -> None:
        self.settings = settings

    def wait_for_tick(self) -> None:
        # Lấy ảnh actor SAU khi đã trả về chế độ không đồng bộ, như CARLA thật.
        assert not self.settings.synchronous_mode
        self.ticks += 1

    def get_actors(self) -> list[FakeActor]:
        return self.actors


class FakeClient:
    def __init__(self, world: FakeWorld) -> None:
        self.world = world
        self.traffic_manager_sync = True

    def get_world(self) -> FakeWorld:
        return self.world

    def get_trafficmanager(self, _port: int):
        client = self

        class Manager:
            def set_synchronous_mode(self, value: bool) -> None:
                client.traffic_manager_sync = value

        return Manager()


def test_release_world_clears_leftovers_and_leaves_server_asynchronous():
    log: list[str] = []
    actors = [FakeActor("vehicle.tesla.model3", log), FakeActor("sensor.other.collision", log),
              FakeActor("walker.pedestrian.0001", log), FakeActor("controller.ai.walker", log),
              FakeActor("spectator", log), FakeActor("traffic.traffic_light", log)]
    world = FakeWorld(actors, synchronous=True)
    client = FakeClient(world)

    assert run_xosc.release_world(client) == 4
    assert world.settings.synchronous_mode is False and world.settings.fixed_delta_seconds is None
    assert client.traffic_manager_sync is False
    assert world.ticks == 1
    destroyed = [line for line in log if line.startswith("destroy")]
    assert sorted(destroyed) == ["destroy controller.ai.walker", "destroy sensor.other.collision",
                                 "destroy vehicle.tesla.model3", "destroy walker.pedestrian.0001"]
    # Cảm biến và controller dừng + xoá trước vehicle/walker chủ của chúng; spectator và đèn giao thông không bị chạm.
    assert max(log.index("destroy sensor.other.collision"), log.index("destroy controller.ai.walker")) < \
        min(log.index("destroy vehicle.tesla.model3"), log.index("destroy walker.pedestrian.0001"))
    assert not any("spectator" in line or "traffic" in line for line in log)


def test_release_world_ignores_actor_already_destroyed_with_its_owner():
    log: list[str] = []
    world = FakeWorld([FakeActor("sensor.other.collision", log, fail_destroy=True),
                       FakeActor("vehicle.tesla.model3", log)], synchronous=False)
    assert run_xosc.release_world(FakeClient(world)) == 2
    assert "destroy vehicle.tesla.model3" in log


def test_release_world_on_clean_server_reports_zero():
    assert run_xosc.release_world(FakeClient(FakeWorld([], synchronous=False))) == 0


def _sleeper(seconds: float) -> subprocess.Popen:
    return subprocess.Popen([sys.executable, "-c", f"import time; time.sleep({seconds})"])


def test_wait_for_exit_returns_exit_code_of_finished_process(tmp_path):
    proc = subprocess.Popen([sys.executable, "-c", "raise SystemExit(0)"])
    assert run_xosc.wait_for_exit(proc, 10, tmp_path / run_xosc.STOP_FLAG) == 0


def test_wait_for_exit_stops_quickly_when_flag_appears(tmp_path):
    flag = tmp_path / run_xosc.STOP_FLAG
    proc = _sleeper(30)
    try:
        threading.Timer(0.3, flag.write_text, args=("stop",)).start()
        started = time.monotonic()
        with pytest.raises(run_xosc.RunStoppedError):
            run_xosc.wait_for_exit(proc, 30, flag)
        assert time.monotonic() - started < 5  # không phải chờ hết 30 s
    finally:
        proc.kill()
        proc.wait()


def test_wait_for_exit_times_out_without_flag(tmp_path):
    proc = _sleeper(30)
    try:
        with pytest.raises(subprocess.TimeoutExpired):
            run_xosc.wait_for_exit(proc, 1, tmp_path / run_xosc.STOP_FLAG)
    finally:
        proc.kill()
        proc.wait()

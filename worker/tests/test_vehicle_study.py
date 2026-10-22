"""Phần tính và điều phối của ``vehicle_study.py`` (không cần CARLA): đo giả theo physics được ép."""

from __future__ import annotations

import pytest
import vehicle_study as vs


def _row(decel=4.6, duration=2.0, distance=20.0, stopped=True, physics=None) -> dict:
    return {"decel_mps2": decel, "duration_s": duration, "stopping_distance_m": distance, "stopped": stopped, "physics_applied": physics}


def _wheels() -> list[dict]:
    # trước-trái, trước-phải, sau-trái, sau-phải: mô-men phanh trước khác sau như xe thật
    return [{"tire_friction": 3.0, "max_brake_torque": 1500.0}, {"tire_friction": 3.0, "max_brake_torque": 1500.0},
            {"tire_friction": 3.0, "max_brake_torque": 900.0}, {"tire_friction": 3.0, "max_brake_torque": 900.0}]


def test_aggregate_uses_only_long_enough_bands_and_stopped_runs() -> None:
    rows = [_row(4.6, 2.0, 20.0), _row(4.7, 2.0, 20.2), _row(9.0, 0.2, 21.0), _row(None, 0.0, 30.0, stopped=False)]
    agg = vs.aggregate(rows)
    assert agg["usable_decel_runs"] == 2 and agg["decel_mps2"]["mean"] == pytest.approx(4.65)  # dải 0,2 s và None bị loại
    assert agg["stopping_distance_m"]["n"] == 3  # run chưa dừng không góp quãng dừng
    assert agg["all_stopped"] is False


def test_missing_data_is_none_not_zero() -> None:
    agg = vs.aggregate([_row(None, 0.0, 0.0, stopped=False)])
    assert agg["decel_mps2"] is None and agg["stopping_distance_m"] is None
    assert vs.aggregate([])["all_stopped"] is False
    assert vs.repeatable(agg) is None


def test_repeatable_compares_range_with_a_fraction_of_the_mean() -> None:
    tight = vs.aggregate([_row(4.60, distance=20.0), _row(4.62, distance=20.1), _row(4.61, distance=20.05)])
    loose = vs.aggregate([_row(4.60, distance=20.0), _row(4.62, distance=22.0)])
    assert vs.repeatable(tight) is True
    assert vs.repeatable(loose) is False
    assert vs.repeatable(vs.aggregate([_row()])) is None  # một mẫu không nói được dao động


def test_direction_verdict_separates_effect_from_noise_and_wrong_way() -> None:
    base = {"mean": 20.0, "range": 0.1}
    assert vs.direction_verdict(base, {"mean": 26.0, "range": 0.1}) == "OK"
    assert vs.direction_verdict(base, {"mean": 20.2, "range": 0.1}) == "NO_EFFECT"  # chênh nhỏ hơn 3% trung bình
    assert vs.direction_verdict(base, {"mean": 30.0, "range": 12.0}) == "NO_EFFECT"  # dao động lớn hơn chênh
    assert vs.direction_verdict(base, {"mean": 15.0, "range": 0.1}) == "WRONG_DIRECTION"
    assert vs.direction_verdict(None, {"mean": 26.0, "range": 0.1}) is None


def test_scaled_wheels_keeps_front_rear_difference_and_leaves_the_input_alone() -> None:
    wheels = _wheels()
    scaled = vs.scaled_wheels(wheels, "max_brake_torque", 0.5)
    assert [w["max_brake_torque"] for w in scaled] == [750.0, 750.0, 450.0, 450.0]
    assert all(set(w) == {"max_brake_torque"} for w in scaled)  # chỉ ép đúng một trường
    assert wheels[0]["max_brake_torque"] == 1500.0


def _fake_measure(effects: dict[str, float], calls: list | None = None):
    """Xe giả: quãng dừng gốc 20 m (+ chút dao động), cộng ``effects[tên nhóm]`` khi nhóm đó bị đổi physics."""
    counter = {"n": 0}

    def measure(blueprint: str, physics: dict, speed_kmh: float) -> dict:
        if calls is not None:
            calls.append((blueprint, physics, speed_kmh))
        counter["n"] += 1
        jitter = 0.01 * (counter["n"] % 3)
        extra = 0.0
        wheels = physics.get("wheels")
        if "mass" in physics:
            extra = effects.get("heavy_mass", 0.0)
        elif wheels and "tire_friction" in wheels[0]:
            extra = effects.get("low_friction", 0.0)
        elif wheels and "max_brake_torque" in wheels[0]:
            extra = effects.get("low_brake_torque", 0.0)
        return _row(4.6 + jitter, 2.0, 20.0 + extra + jitter, physics={"mass": 2000.0, "wheels": _wheels()})

    return measure


def test_study_vehicle_measures_default_physics_then_the_three_changes() -> None:
    calls: list = []
    result = vs.study_vehicle(_fake_measure({"heavy_mass": 6.0, "low_friction": 4.0, "low_brake_torque": 10.0}, calls),
                              "Sedan", "vehicle.tesla.model3", 50.0, 3)
    assert len(calls) == 12 and all(c[0] == "vehicle.tesla.model3" and c[2] == 50.0 for c in calls)
    assert [c[1] for c in calls[:3]] == [{}, {}, {}]  # nhóm gốc: physics mặc định
    heavy = next(c[1] for c in calls if "mass" in c[1])
    assert heavy == {"mass": pytest.approx(2000.0 * 1.3)}
    torque = next(c[1] for c in calls if c[1].get("wheels") and "max_brake_torque" in c[1]["wheels"][0])
    assert [w["max_brake_torque"] for w in torque["wheels"]] == [750.0, 750.0, 450.0, 450.0]
    assert result["wheel_count"] == 4 and result["mass_kg"] == 2000.0
    assert result["checks"] == {"low_friction": "OK", "heavy_mass": "OK", "low_brake_torque": "OK"}
    assert result["repeatable"] is True and result["findings"] == []
    assert vs.conclusion(result).startswith("Đo được và lặp lại được")


def test_a_change_that_does_nothing_is_reported_as_a_finding_not_hidden() -> None:
    # TD-17: ở CARLA 0.9.16 đổi ma sát lốp/mô-men phanh từng không có tác dụng; công cụ phải nêu ra, không coi là đạt.
    result = vs.study_vehicle(_fake_measure({"heavy_mass": 6.0}), "SUV", "vehicle.nissan.patrol_2021", 50.0, 3)
    assert result["checks"] == {"low_friction": "NO_EFFECT", "heavy_mass": "OK", "low_brake_torque": "NO_EFFECT"}
    assert result["findings"] == ["LOW_FRICTION_NO_EFFECT", "LOW_BRAKE_TORQUE_NO_EFFECT"]
    text = vs.conclusion(result)
    assert "giảm ma sát lốp không đổi quãng dừng" in text and "giảm mô-men phanh không đổi quãng dừng" in text


def test_one_failing_vehicle_is_recorded_and_the_others_still_run() -> None:
    good = _fake_measure({"heavy_mass": 6.0, "low_friction": 4.0, "low_brake_torque": 10.0})

    def measure(blueprint: str, physics: dict, speed_kmh: float) -> dict:
        if blueprint == "vehicle.missing":
            raise IndexError("blueprint not found")
        return good(blueprint, physics, speed_kmh)

    results = vs.run_study(measure, [("Van", "vehicle.missing"), ("Sedan", "vehicle.tesla.model3")], 50.0, 2)
    assert "error" in results[0] and "blueprint not found" in results[0]["error"]
    assert results[1]["findings"] == [] and "error" not in results[1]
    assert vs.conclusion(results[0]).startswith("Không đo được")


def test_report_has_the_pdf_columns_and_shows_missing_numbers_as_dashes() -> None:
    ok = vs.study_vehicle(_fake_measure({"heavy_mass": 6.0, "low_friction": 4.0, "low_brake_torque": 10.0}), "Sedan", "vehicle.tesla.model3", 50.0, 3)
    failed = {"role": "Truck", "blueprint": "vehicle.missing", "error": "IndexError: blueprint not found"}
    report = vs.markdown_report([ok, failed], {"server": "0.9.16", "step_s": 0.01, "speed_kmh": 50.0, "repeats": 3})
    assert "| Xe | Số bánh | Khối lượng (kg) | Giảm tốc đạt được (m/s²) | Quãng dừng (m) | Lặp lại được? | Kết luận |" in report
    truck_row = next(line for line in report.splitlines() if "Truck" in line)
    assert truck_row.count("—") == 5 and "0,00" not in truck_row  # số thiếu là "—", không phải 0
    assert "| Sedan (`vehicle.tesla.model3`) | 4 | 2000 |" in report
    assert "đúng chiều" in report and "TD-17" in report  # lời cảnh báo phạm vi nằm ngay trong báo cáo


def test_a_vehicle_that_never_stops_shows_dashes_in_the_table_not_zeros() -> None:
    def never_stops(blueprint: str, physics: dict, speed_kmh: float) -> dict:
        return _row(None, 0.0, 0.0, stopped=False, physics={"mass": 2000.0, "wheels": _wheels()})

    result = vs.study_vehicle(never_stops, "Truck", "vehicle.carlamotors.european_hgv", 50.0, 2)
    assert {"NOT_STOPPED", "NO_BAND"} <= set(result["findings"]) and result["repeatable"] is None
    report = vs.markdown_report([result], {"server": "0.9.16", "step_s": 0.01, "speed_kmh": 50.0, "repeats": 2})
    row = next(line for line in report.splitlines() if "Truck" in line and "| 4 |" in line)
    assert row.count("—") >= 3  # giảm tốc, quãng dừng, lặp lại được: không có số thì là "—"
    assert "0,00" not in report and "— → — m: —" in report  # bảng kiểm chiều cũng không biến số thiếu thành 0


def test_unrepeatable_base_runs_are_a_finding() -> None:
    distances = iter([20.0, 24.0, 28.0] + [30.0] * 9)

    def noisy(blueprint: str, physics: dict, speed_kmh: float) -> dict:
        return _row(4.6, 2.0, next(distances), physics={"mass": 2000.0, "wheels": _wheels()})

    result = vs.study_vehicle(noisy, "Sedan", "vehicle.tesla.model3", 50.0, 3)
    assert result["repeatable"] is False and "NOT_REPEATABLE" in result["findings"]
    assert "chạy lặp lệch quá ngưỡng" in vs.conclusion(result)


class _World:
    def __init__(self, map_name: str = "Carla/Maps/Town04") -> None:
        self.settings = type("S", (), {"synchronous_mode": False, "fixed_delta_seconds": None})()
        self.map_name = map_name
        self.applied: list[tuple[bool, float | None]] = []

    def get_map(self):
        return type("M", (), {"name": self.map_name})()

    def get_settings(self):
        return self.settings

    def apply_settings(self, settings) -> None:
        self.settings = settings
        self.applied.append((settings.synchronous_mode, settings.fixed_delta_seconds))

    def wait_for_tick(self) -> None:
        pass

    def get_actors(self) -> list:
        return []


def _install_fake_carla(monkeypatch: pytest.MonkeyPatch, world: _World) -> dict:
    seen: dict = {"loaded": []}

    class Client:
        def __init__(self, host: str, port: int) -> None:
            seen["address"] = (host, port)

        def set_timeout(self, seconds: float) -> None:
            pass

        def get_world(self) -> _World:
            return world

        def load_world(self, name: str) -> _World:
            seen["loaded"].append(name)
            return world

        def get_server_version(self) -> str:
            return "0.9.16"

        def get_trafficmanager(self, port: int):
            return type("T", (), {"set_synchronous_mode": lambda self, value: None})()

    monkeypatch.setitem(__import__("sys").modules, "carla", type("carla", (), {"Client": Client, "Vector3D": tuple}))
    return seen


def test_main_writes_both_reports_and_leaves_the_server_asynchronous(monkeypatch: pytest.MonkeyPatch, tmp_path) -> None:
    import json

    world = _World()
    seen = _install_fake_carla(monkeypatch, world)
    good = vs.study_vehicle(_fake_measure({"heavy_mass": 6.0, "low_friction": 4.0, "low_brake_torque": 10.0}), "Sedan", "vehicle.tesla.model3", 50.0, 2)
    captured: dict = {}

    def fake_run_study(measure, vehicles, speed, repeats, **options):
        captured.update(vehicles=list(vehicles), speed=speed, repeats=repeats, options=options, synchronous=world.settings.synchronous_mode)
        return [good]

    monkeypatch.setattr(vs, "run_study", fake_run_study)
    code = vs.main(["--out", str(tmp_path / "study"), "--repeats", "2", "--speed", "40", "--port", "2100", "--rel-tol", "0.05"])
    assert code == 0 and seen["address"] == ("127.0.0.1", 2100) and seen["loaded"] == []  # đã ở Town04: không nạp lại
    assert captured["synchronous"] is True and world.settings.synchronous_mode is False  # đồng bộ trong lúc đo, trả về không đồng bộ
    assert captured["vehicles"] == list(vs.DEFAULT_VEHICLES) and captured["speed"] == 40.0 and captured["options"]["rel_tol"] == 0.05
    data = json.loads((tmp_path / "study" / "vehicle_study.json").read_text(encoding="utf-8"))
    assert data["meta"]["server"] == "0.9.16" and data["meta"]["step_s"] == 0.01 and data["vehicles"][0]["blueprint"] == "vehicle.tesla.model3"
    assert "Giảm tốc đạt được (m/s²)" in (tmp_path / "study" / "vehicle_study.md").read_text(encoding="utf-8")


def test_main_exits_3_when_a_vehicle_could_not_be_measured_and_cleans_up_anyway(monkeypatch: pytest.MonkeyPatch, tmp_path) -> None:
    world = _World("Carla/Maps/Town05")
    seen = _install_fake_carla(monkeypatch, world)
    monkeypatch.setattr(vs, "run_study", lambda *a, **k: [{"role": "Van", "blueprint": "vehicle.missing", "error": "IndexError: x"}])
    assert vs.main(["--out", str(tmp_path), "--blueprints", "vehicle.missing"]) == 3
    assert seen["loaded"] == ["Town04"] and world.settings.synchronous_mode is False


def test_main_rejects_a_single_repeat(tmp_path) -> None:
    with pytest.raises(SystemExit) as stop:
        vs.main(["--out", str(tmp_path), "--repeats", "1"])
    assert stop.value.code == 2

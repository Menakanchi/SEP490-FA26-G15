"""Phần thuần của ``run_xosc.py`` (bản sao runtime, mã thoát, tên simulator) — không cần server CARLA hay JVM."""

from __future__ import annotations

import os
import signal
from pathlib import Path
from xml.etree import ElementTree as ET

import pytest
import run_xosc


def test_carla_simulator_name_ignores_build_suffix() -> None:
    assert run_xosc.carla_simulator("0.9.16") == "carla-0.9.16"
    assert run_xosc.carla_simulator("0.9.15-12-gabc1234") == "carla-0.9.15"


def test_runtime_copy_keeps_exported_file_unchanged(xosc: Path, tmp_path: Path) -> None:
    target, out = tmp_path / "runtime.xosc", tmp_path / "out"
    original = xosc.read_text(encoding="utf-8")
    run_xosc.prepare_runtime(xosc, target, out, "carla-0.9.16-xosc3")
    assert xosc.read_text(encoding="utf-8") == original  # file tải xuống giữ nguyên, chỉ bản runtime được gắn đường dẫn
    source, runtime = ET.parse(xosc), ET.parse(target)
    assert [p.attrib for p in source.iterfind(".//ParameterDeclaration")] == [p.attrib for p in runtime.iterfind(".//ParameterDeclaration")]
    properties = runtime.find(".//Controller[@name='VehicSimAEB']/Properties")
    values = {p.attrib["name"]: p.attrib["value"] for p in properties.iterfind("Property")}
    assert values["module"] == str(run_xosc.WORKER / "vehicsim_aeb_control.py")
    assert values["xosc_file"] == str(xosc.resolve())
    assert values["out_dir"] == str(out.resolve())
    assert values["simulator_version"] == "carla-0.9.16-xosc3"


def test_runtime_copy_overwrites_stale_controller_properties(xosc: Path, tmp_path: Path) -> None:
    first, second = tmp_path / "a.xosc", tmp_path / "b.xosc"
    run_xosc.prepare_runtime(xosc, first, tmp_path, "carla-0.9.16-xosc2")
    run_xosc.prepare_runtime(first, second, tmp_path, "carla-0.9.16-xosc3")
    properties = ET.parse(second).find(".//Controller[@name='VehicSimAEB']/Properties")
    assert [p.attrib["value"] for p in properties.iterfind("Property[@name='simulator_version']")] == ["carla-0.9.16-xosc3"]


def test_xosc_without_the_vehicsim_controller_is_rejected(tmp_path: Path) -> None:
    other = tmp_path / "other.xosc"
    other.write_text("<OpenSCENARIO><ParameterDeclarations /></OpenSCENARIO>", encoding="utf-8")
    with pytest.raises(ValueError, match="controller AEB"):
        run_xosc.prepare_runtime(other, tmp_path / "runtime.xosc", tmp_path, "carla-0.9.16-xosc3")
    assert not (tmp_path / "runtime.xosc").exists()


def test_environment_puts_worker_and_scenario_runner_on_the_python_path(tmp_path: Path) -> None:
    paths = run_xosc.environment(tmp_path)["PYTHONPATH"].split(os.pathsep)
    assert str(run_xosc.WORKER) in paths and str(tmp_path) in paths


def test_legacy_json_jobs_fail_clearly_instead_of_running_a_removed_runner(
    monkeypatch: pytest.MonkeyPatch, tmp_path: Path, capsys: pytest.CaptureFixture[str]
) -> None:
    monkeypatch.setattr(run_xosc, "install_stop_handlers", lambda: None)
    monkeypatch.setattr(run_xosc, "run", lambda args: pytest.fail("không được chạy ScenarioRunner cho bundle .json"))
    assert run_xosc.main([str(tmp_path / "bundle.json"), "--out", str(tmp_path), "--fast"]) == run_xosc.EXIT_BAD_INPUT
    error = capsys.readouterr().err
    assert ".xosc" in error and "BridgeMain kinematic" in error


def test_run_failures_map_to_distinct_exit_codes(monkeypatch: pytest.MonkeyPatch, tmp_path: Path) -> None:
    monkeypatch.setattr(run_xosc, "install_stop_handlers", lambda: None)
    scenario = str(tmp_path / "scenario.xosc")

    def stopped(_args):
        raise run_xosc.RunStoppedError("dừng")

    def broken(_args):
        raise RuntimeError("môi trường chưa sẵn sàng")

    monkeypatch.setattr(run_xosc, "run", stopped)
    assert run_xosc.main([scenario]) == run_xosc.EXIT_STOPPED
    monkeypatch.setattr(run_xosc, "run", broken)
    assert run_xosc.main([scenario]) == run_xosc.EXIT_SIMULATOR_ERROR
    assert len({run_xosc.EXIT_BAD_INPUT, run_xosc.EXIT_SIMULATOR_ERROR, run_xosc.EXIT_STOPPED}) == 3


@pytest.mark.skipif(not hasattr(signal, "SIGTERM"), reason="không có SIGTERM")
def test_stop_signal_becomes_a_clean_exit_so_finally_blocks_run() -> None:
    names = [n for n in ("SIGTERM", "SIGBREAK") if hasattr(signal, n)]
    previous = {n: signal.getsignal(getattr(signal, n)) for n in names}
    try:
        run_xosc.install_stop_handlers()
        with pytest.raises(SystemExit) as stop:
            signal.raise_signal(signal.SIGTERM)
        assert stop.value.code == run_xosc.EXIT_STOPPED
    finally:
        for name, handler in previous.items():
            signal.signal(getattr(signal, name), handler)

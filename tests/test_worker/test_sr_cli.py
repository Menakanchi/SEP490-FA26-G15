"""Chọn ``CARLA_ROOT`` cho worker: máy 0.9.15 (``~/CARLA_0.9.15``) và máy 0.9.16 (``/opt/carla-simulator``)."""

from __future__ import annotations

import importlib.util
from pathlib import Path

_SPEC = importlib.util.spec_from_file_location("worker_sr_cli", Path(__file__).parents[2] / "worker" / "sr_cli.py")
assert _SPEC and _SPEC.loader
sr_cli = importlib.util.module_from_spec(_SPEC)
_SPEC.loader.exec_module(sr_cli)


def _fake_carla(root: Path, version: str | None = None) -> Path:
    root.mkdir(parents=True)
    (root / "CarlaUE4.sh").write_text("#!/bin/sh\n")
    if version:
        (root / "VERSION").write_text(f"{version}\n")
    return root


def test_explicit_carla_root_wins(tmp_path: Path) -> None:
    found = _fake_carla(tmp_path / "found")
    assert sr_cli.default_carla_root({"CARLA_ROOT": "/elsewhere"}, (found,)) == Path("/elsewhere")


def test_first_installed_candidate_is_used(tmp_path: Path) -> None:
    missing = tmp_path / "CARLA_0.9.15"
    opt = _fake_carla(tmp_path / "opt" / "carla-simulator")
    assert sr_cli.default_carla_root({}, (missing, opt)) == opt


def test_falls_back_to_first_candidate_when_nothing_installed(tmp_path: Path) -> None:
    first, second = tmp_path / "a", tmp_path / "b"
    assert sr_cli.default_carla_root({}, (first, second)) == first


def test_carla_version_reads_version_file(tmp_path: Path) -> None:
    assert sr_cli.carla_version(_fake_carla(tmp_path / "c16", "0.9.16")) == "0.9.16"
    assert sr_cli.carla_version(_fake_carla(tmp_path / "c15")) is None

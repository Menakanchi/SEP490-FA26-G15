"""Hợp đồng JSON giữa web và bộ mô phỏng (ADR-027): bundle vào, result.json ra.

Hai CLI (``worker/kinematic_sim.py``, ``worker/run_variant.py``) và backend cùng
đọc/ghi các file này; lõi chúng import (AEB, luật chấm, định dạng) phải chạy được
trong venv CARLA — chỉ thư viện chuẩn, cú pháp Python 3.10.
"""

from __future__ import annotations

import ast
import json
import subprocess
import sys
from pathlib import Path

import pytest

from src.services.vehicsim.aeb_stack import AebParams
from src.services.vehicsim.bundle import (
    VARIANT_FORMAT,
    BundleError,
    carla_simulator,
    make_bundle,
    read_result,
    read_spec,
)
from src.services.vehicsim.simulator import PedestrianCrossingCase, VehicleSpec, simulate

ROOT = Path(__file__).resolve().parents[2]
SIM_CORE = ("aeb_stack.py", "simulator.py", "bundle.py", "evaluation.py")
# Số thực như backend dựng (``float(ir[...])``): JSON ghi 60 và 60.0 khác nhau.
CASE = PedestrianCrossingCase(
    ego_speed_kmh=60.0, trigger_distance_m=25.0, pedestrian_speed_mps=3.0, weather="RAIN", time_of_day="NIGHT"
)
PARAMS = AebParams(ttc_threshold=1.8, brake_activation_delay=0.1)
VEHICLE = VehicleSpec(length_m=4.75, width_m=1.93, max_brake_decel_mps2=9.5)


def _imports(path: Path) -> set[str]:
    tree = ast.parse(path.read_text(encoding="utf-8"))
    names = set()
    for node in ast.walk(tree):
        if isinstance(node, ast.Import):
            names |= {alias.name for alias in node.names}
        elif isinstance(node, ast.ImportFrom) and node.module and node.level == 0:
            names.add(node.module)
    return names


@pytest.mark.parametrize("name", SIM_CORE)
def test_sim_core_is_stdlib_only_and_python310(name: str) -> None:
    """venv CARLA (Python 3.10, chỉ có ``carla``) import thẳng các file này."""
    path = ROOT / "src" / "services" / "vehicsim" / name
    ast.parse(path.read_text(encoding="utf-8"), feature_version=(3, 10))
    core = {f"src.services.vehicsim.{n.removesuffix('.py')}" for n in SIM_CORE}
    outside = {
        m for m in _imports(path) if m not in core and m.split(".")[0] not in sys.stdlib_module_names | {"__future__"}
    }
    assert not outside, f"{name} import ngoài thư viện chuẩn: {outside}"


def _bundle() -> dict:
    return make_bundle(
        case=CASE, params=PARAMS, vehicle=VEHICLE, seed=48_123, aeb_label="v1.1", vehicle_name="VF8", source={"x": 1}
    )


def test_bundle_round_trip_reproduces_the_same_run() -> None:
    doc = json.loads(json.dumps(_bundle()))
    spec = read_spec(doc)

    assert doc["format"] == VARIANT_FORMAT
    assert (spec.case, spec.params, spec.vehicle, spec.seed) == (CASE, PARAMS, VEHICLE, 48_123)
    assert spec.aeb_label == "v1.1" and spec.vehicle_name == "VF8" and spec.source == {"x": 1}
    assert simulate(spec.case, spec.params, spec.seed, spec.vehicle) == simulate(CASE, PARAMS, 48_123, VEHICLE)


def test_bare_ir_and_describe_output_use_baseline_defaults() -> None:
    ir = {"ego_speed_kmh": 40, "trigger_distance_m": 20, "pedestrian_speed_mps": 1.4, "is_pedestrian_crossing": True}
    for doc in (ir, {"ir": ir, "fields": []}):
        spec = read_spec(doc)
        assert spec.case == PedestrianCrossingCase(ego_speed_kmh=40, trigger_distance_m=20, pedestrian_speed_mps=1.4)
        assert (spec.params, spec.vehicle, spec.seed) == (AebParams(), VehicleSpec(), 0)
    assert read_spec(ir, seed=7).seed == 7


@pytest.mark.parametrize(
    "aeb",
    [
        {"TTC_THRESHOLD": 1.8, "BRAKE_ACTIVATION_DELAY": 0.1},
        {"ttc_threshold": 1.8, "brake_activation_delay": 0.1},
        {"label": "v1.1", "params": {"TTC_THRESHOLD": 1.8, "BRAKE_ACTIVATION_DELAY": 0.1}},
    ],
    ids=["flat-codes", "field-names", "label+params"],
)
def test_aeb_override_accepts_every_documented_shape(aeb: dict) -> None:
    ir = {"ego_speed_kmh": 40, "trigger_distance_m": 20, "pedestrian_speed_mps": 1.4}
    assert read_spec(ir, aeb=aeb).params == PARAMS
    assert read_spec(ir, aeb=_bundle()).params == PARAMS  # cả một bundle khác làm file AEB


def test_bad_input_lists_every_problem_at_once() -> None:
    bad = {"ego_speed_kmh": 300, "weather": "SNOW", "stops_at_curb": "yes", "aeb": {"TTC_THRESOLD": 1}, "seed": 1.5}
    with pytest.raises(BundleError) as exc:
        read_spec(bad)
    message = str(exc.value)
    for fragment in (
        "ego_speed_kmh = 300",
        "thiếu trigger_distance_m",
        "SNOW",
        "stops_at_curb",
        "TTC_THRESOLD",
        "seed",
    ):
        assert fragment in message
    with pytest.raises(BundleError, match="định dạng"):
        read_spec({**_bundle(), "format": "vehicsim.variant/v9"})


def test_carla_simulator_name_ignores_build_suffix() -> None:
    assert carla_simulator("0.9.16") == "carla-0.9.16"
    assert carla_simulator("0.9.15-12-gabc1234") == "carla-0.9.15"


def test_kinematic_cli_writes_the_same_result_as_the_backend(tmp_path: Path) -> None:
    """``python worker/kinematic_sim.py <bundle>`` = đúng lần chạy backend làm với cùng bundle."""
    bundle = tmp_path / "run.json"
    bundle.write_text(json.dumps(_bundle()), encoding="utf-8")
    proc = subprocess.run(
        [sys.executable, str(ROOT / "worker" / "kinematic_sim.py"), str(bundle), "--out", str(tmp_path / "out")],
        capture_output=True,
        text=True,
        encoding="utf-8",
        errors="replace",
        check=False,
    )
    assert proc.returncode == 0, proc.stderr

    simulator, outcome, artifacts = read_result(json.loads((tmp_path / "out" / "result.json").read_text("utf-8")))
    expected = simulate(CASE, PARAMS, 48_123, VEHICLE)
    assert simulator == "vehicsim-kinematic-1.0" and artifacts == {}
    assert json.dumps(outcome.as_dict(), sort_keys=True) == json.dumps(expected.as_dict(), sort_keys=True)


def test_cli_rejects_bad_input_with_exit_code_2(tmp_path: Path) -> None:
    bundle = tmp_path / "bad.json"
    bundle.write_text('{"ego_speed_kmh": 300}', encoding="utf-8")
    proc = subprocess.run(
        [sys.executable, str(ROOT / "worker" / "kinematic_sim.py"), str(bundle)],
        capture_output=True,
        text=True,
        encoding="utf-8",
        errors="replace",
        check=False,
    )
    assert proc.returncode == 2 and "ego_speed_kmh" in proc.stderr
    assert not (tmp_path / "bad" / "result.json").exists()

"""XML thực thi, metadata đủ để chạy lại và không thay đổi artifact khi gắn runtime controller."""

from __future__ import annotations

import ast
from pathlib import Path
from xml.etree import ElementTree as ET

import pytest
from openscenario_export import SIMULATOR_SUFFIX, export_xosc, read_xosc
from run_xosc import environment, prepare_runtime
from vehicsim_core.bundle import BundleError, read_spec
from vehicsim_core.simulator import CURB_STOP_Y_M, PEDESTRIAN_START_Y_M

IR = {"ego_speed_kmh": 40, "trigger_distance_m": 25, "pedestrian_speed_mps": 3, "weather": "RAIN", "time_of_day": "NIGHT"}


def test_xosc_export_is_offline_stdlib_only_and_python310() -> None:
    source = (Path(__file__).parents[1] / "openscenario_export.py").read_text(encoding="utf-8")
    tree = ast.parse(source, feature_version=(3, 10))
    imports = set()
    for item in ast.walk(tree):
        if isinstance(item, ast.Import):
            imports.update(alias.name.split(".")[0] for alias in item.names)
        elif isinstance(item, ast.ImportFrom):
            imports.add(item.module.split(".")[0])
    assert imports <= {"__future__", "argparse", "json", "math", "pathlib", "xml", "vehicsim_core"}


@pytest.mark.parametrize("speed,distance", [(10, 5), (130, 80)])
def test_extreme_parameters_stay_inside_the_straight_road(speed: int, distance: int) -> None:
    root = ET.fromstring(export_xosc(read_spec({**IR, "ego_speed_kmh": speed, "trigger_distance_m": distance})))
    positions = root.findall(".//LanePosition")
    assert positions
    assert all(p.attrib["roadId"] == "40" and p.attrib["laneId"] == "-4" and 0 < float(p.attrib["s"]) < 228 for p in positions)


def test_xosc_matches_the_schema_checked_golden() -> None:
    assert export_xosc(read_spec(IR)) == (Path(__file__).parents[2] / "src/test/resources/golden/cp-crossing.xosc").read_text(encoding="utf-8")


def test_round_trip_preserves_seed_source_aeb_vehicle_and_escaped_labels(tmp_path: Path) -> None:
    spec = read_spec({
        "variant": IR, "seed": 9007199254740993,
        "source": {"run_id": 42, "scenario_id": 7, "scenario_version_id": 8, "aeb_version_id": 9, "carla_vehicle_model_id": 10,
                   "simulator": "carla-0.9.16-xosc1"},
        "aeb": {"label": 'A & B < "test"', "params": {"TTC_THRESHOLD": 1.8000000000000003}},
        "vehicle": {"name": "Xe thử", "length_m": 4.9, "width_m": 1.93, "max_brake_decel_mps2": 8,
                    "carla": {"blueprint": "vehicle.audi.etron", "physics": {"mass": 2490, "drag_coefficient": 0.28,
                              "center_of_mass": {"x": 0.1, "y": 0, "z": -0.2}}, "dimensions": {"height_m": 1.6, "wheelbase_m": 2.9}}},
    })
    path = tmp_path / "run.xosc"
    path.write_text(export_xosc(spec), encoding="utf-8")
    assert read_xosc(path) == spec
    assert 'value="9007199254740993"' in path.read_text(encoding="utf-8")


def test_pedestrian_movement_uses_distance_trigger_and_real_xml_actions() -> None:
    root = ET.fromstring(export_xosc(read_spec(IR)))
    assert root.find("./Entities/ScenarioObject[@name='hero']/Vehicle") is not None
    assert root.find("./Entities/ScenarioObject[@name='pedestrian']/Pedestrian") is not None
    event = root.find(".//Event[@name='StartCrossing']")
    assert event.find("./StartTrigger//DistanceCondition") is not None
    assert event.find("./StartTrigger//SimulationTimeCondition") is None
    assert len(event.findall(".//FollowTrajectoryAction/Trajectory/Shape/Polyline/Vertex")) == 2


@pytest.mark.parametrize("stops_at_curb", [False, True])
def test_pedestrian_path_crosses_the_lane_without_rotating_its_offset(stops_at_curb: bool) -> None:
    root = ET.fromstring(export_xosc(read_spec({**IR, "stops_at_curb": stops_at_curb})))
    spawn = root.find("./Storyboard/Init/Actions/Private[@entityRef='pedestrian']//LanePosition")
    route = root.findall(".//FollowTrajectoryAction/Trajectory/Shape/Polyline/Vertex/Position/LanePosition")
    assert len(route) == 2
    # ScenarioRunner 0.9.16 applies Orientation before offset: a 90-degree heading
    # would turn these lateral offsets into movement along the vehicle's road.
    positions = [spawn, *route]
    assert all(p.find("Orientation") is None for p in positions)
    for key in ("roadId", "laneId", "s"):
        assert len({p.attrib[key] for p in positions}) == 1
    assert float(spawn.attrib["offset"]) == float(route[0].attrib["offset"]) == -PEDESTRIAN_START_Y_M
    finish_y = CURB_STOP_Y_M if stops_at_curb else -PEDESTRIAN_START_Y_M
    assert float(route[1].attrib["offset"]) == -finish_y
    assert float(route[1].attrib["offset"]) < float(route[0].attrib["offset"])
    assert all(p.find("Orientation") is None for p in root.findall(".//LanePosition") if float(p.attrib["offset"]))


def test_runtime_copy_keeps_exported_file_unchanged(tmp_path: Path) -> None:
    source, target = tmp_path / "source.xosc", tmp_path / "runtime.xosc"
    original = export_xosc(read_spec(IR))
    source.write_text(original, encoding="utf-8")
    assert SIMULATOR_SUFFIX == "-xosc3"
    prepare_runtime(source, target, tmp_path, "carla-0.9.16-xosc3")
    assert source.read_text(encoding="utf-8") == original
    assert read_xosc(source) == read_xosc(target)
    properties = ET.parse(target).find(".//Controller/Properties")
    assert properties.find("Property[@name='xosc_file']").attrib["value"] == str(source.resolve())
    assert properties.find("Property[@name='simulator_version']").attrib["value"] == "carla-0.9.16-xosc3"
    assert "PYTHONPATH" in environment(tmp_path)


def test_unrelated_xosc_is_rejected_by_the_result_recording_adapter(tmp_path: Path) -> None:
    path = tmp_path / "other.xosc"
    path.write_text("<OpenSCENARIO><ParameterDeclarations /></OpenSCENARIO>", encoding="utf-8")
    with pytest.raises(BundleError, match="vs_format"):
        read_xosc(path)


def test_old_geometry_xosc_requires_reexport_instead_of_running_as_xosc2(tmp_path: Path) -> None:
    path = tmp_path / "old.xosc"
    path.write_text(export_xosc(read_spec(IR)).replace("vehicsim.xosc/v3", "vehicsim.xosc/v1"), encoding="utf-8")
    with pytest.raises(BundleError, match="xuất lại từ web"):
        read_xosc(path)


def test_old_json_jobs_do_not_receive_scenariorunner_only_options(monkeypatch, tmp_path: Path) -> None:
    import run_variant
    import run_xosc

    received = []
    monkeypatch.setattr(run_variant, "main", lambda args: received.extend(args) or 0)
    assert run_xosc.main([str(tmp_path / "bundle.json"), "--out", str(tmp_path), "--camera", "--fast"]) == 0
    assert "--camera" not in received and "--sr-root" not in received
    assert received[0].endswith("bundle.json") and "--fast" in received

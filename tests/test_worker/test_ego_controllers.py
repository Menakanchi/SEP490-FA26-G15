"""Runtime XOSC controller injection; không cần CARLA để kiểm."""

from __future__ import annotations

import importlib.util
import xml.etree.ElementTree as ET
from pathlib import Path

import pytest
import xmlschema

ROOT = Path(__file__).parents[2]
_SPEC = importlib.util.spec_from_file_location("worker_ego_controllers", ROOT / "worker" / "ego_controllers.py")
assert _SPEC and _SPEC.loader
ego_controllers = importlib.util.module_from_spec(_SPEC)
_SPEC.loader.exec_module(ego_controllers)


@pytest.fixture
def xosc() -> str:
    return (ROOT / "fixtures" / "xosc" / "generated" / "run_red_light.xosc").read_text(encoding="utf-8")


def test_constant_speed_keeps_the_reviewed_artifact_byte_for_byte(xosc: str) -> None:
    assert ego_controllers.prepare_xosc(xosc, ego_controllers.CONSTANT_SPEED) == xosc


def test_behavior_agent_is_injected_only_for_the_ego(xosc: str, tmp_path: Path) -> None:
    module = tmp_path / "behavior_agent_control.py"
    module.touch()

    runtime = ego_controllers.prepare_xosc(xosc, ego_controllers.BEHAVIOR_AGENT, module)
    root = ET.fromstring(runtime)
    actions = root.findall("./Storyboard/Init/Actions/Private/PrivateAction/ControllerAction")

    assert len(actions) == 1
    assert actions[0].find(".//Property[@name='module']").get("value") == str(module.resolve())
    assert actions[0].find(".//Property[@name='behavior']").get("value") == "normal"
    assert actions[0].find(".//Throttle").get("active") == "false"

    schema = xmlschema.XMLSchema(ROOT / "tests" / "schemas" / "OpenSCENARIO_1_0.xsd")
    schema.validate(runtime)


def test_injection_refuses_to_override_an_existing_controller(xosc: str, tmp_path: Path) -> None:
    module = tmp_path / "behavior_agent_control.py"
    module.touch()
    once = ego_controllers.prepare_xosc(xosc, ego_controllers.BEHAVIOR_AGENT, module)

    with pytest.raises(ValueError, match="đã có ControllerAction"):
        ego_controllers.prepare_xosc(once, ego_controllers.BEHAVIOR_AGENT, module)


def test_unknown_controller_is_rejected(xosc: str) -> None:
    with pytest.raises(ValueError, match="không hỗ trợ"):
        ego_controllers.prepare_xosc(xosc, "imaginary_model")

"""Chọn ego controller và tạo bản OpenSCENARIO chỉ dùng lúc runtime.

Converter vẫn sinh artifact deterministic, độc lập máy. Worker chèn
``ControllerAction`` vào bản tạm vì đường dẫn module chỉ tồn tại trên máy GPU.
Nội dung đã review/lưu trong thư viện không bị sửa.
"""

from __future__ import annotations

import xml.etree.ElementTree as ET
from pathlib import Path

CONSTANT_SPEED = "constant_speed"
BEHAVIOR_AGENT = "behavior_agent"
SUPPORTED = frozenset({CONSTANT_SPEED, BEHAVIOR_AGENT})


def prepare_xosc(xosc_content: str, controller: str, module_path: Path | None = None) -> str:
    """Trả XOSC runtime cho controller; baseline được giữ byte-for-byte."""
    if controller not in SUPPORTED:
        raise ValueError(f"ego controller không hỗ trợ: {controller}")
    if controller == CONSTANT_SPEED:
        return xosc_content
    if module_path is None:
        module_path = Path(__file__).with_name("behavior_agent_control.py")
    if not module_path.is_file():
        raise FileNotFoundError(f"không thấy BehaviorAgent controller: {module_path}")

    root = ET.fromstring(xosc_content)
    ego_name = next(
        (
            obj.get("name")
            for obj in root.findall("./Entities/ScenarioObject")
            if obj.find("./Vehicle/Properties/Property[@name='type'][@value='ego_vehicle']") is not None
        ),
        None,
    )
    if not ego_name:
        raise ValueError("OpenSCENARIO không khai báo actor ego_vehicle")
    private = root.find(f"./Storyboard/Init/Actions/Private[@entityRef='{ego_name}']")
    if private is None:
        raise ValueError(f"OpenSCENARIO không có Init/Private cho ego {ego_name}")
    if private.find("./PrivateAction/ControllerAction") is not None:
        raise ValueError("hero đã có ControllerAction; không được âm thầm ghi đè")

    private_action = ET.SubElement(private, "PrivateAction")
    controller_action = ET.SubElement(private_action, "ControllerAction")
    assign = ET.SubElement(controller_action, "AssignControllerAction")
    controller_node = ET.SubElement(assign, "Controller", name="BehaviorAgent")
    properties = ET.SubElement(controller_node, "Properties")
    ET.SubElement(properties, "Property", name="module", value=str(module_path.resolve()))
    ET.SubElement(properties, "Property", name="behavior", value="normal")
    ET.SubElement(properties, "Property", name="route_length_m", value="800")
    ET.SubElement(properties, "Property", name="route_step_m", value="2")

    override = ET.SubElement(controller_action, "OverrideControllerValueAction")
    for element in ("Throttle", "Brake", "Clutch", "ParkingBrake", "SteeringWheel"):
        ET.SubElement(override, element, value="0", active="false")
    ET.SubElement(override, "Gear", number="0", active="false")

    ET.indent(root, space="  ")
    return "<?xml version='1.0' encoding='UTF-8'?>\n" + ET.tostring(root, encoding="unicode")

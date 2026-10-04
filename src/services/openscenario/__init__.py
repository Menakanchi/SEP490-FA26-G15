"""Bộ sinh OpenSCENARIO 1.0 (``.xosc``) — giữ lại từ Scenario Forge (ADR-032)."""

from src.services.openscenario.converter import ConversionError, convert_spec_to_xosc, try_convert_spec
from src.services.openscenario.spec import ScenarioSpec

__all__ = ["ConversionError", "ScenarioSpec", "convert_spec_to_xosc", "try_convert_spec"]

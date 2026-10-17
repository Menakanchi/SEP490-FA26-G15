"""Biến thể trong ``fixtures/scenario_specs/variants/`` phải luôn chạy được.

Chúng đã chạy thật trên CARLA (xem README cùng thư mục). Seed ``sc_901`` từng hỏng
âm thầm khi luật hình học siết lại; test này bắt chuyện đó ngay ở CI thay vì lúc demo.
"""

from __future__ import annotations

import asyncio
import json
from pathlib import Path

import pytest

from src.agents.nodes.convert_xosc_node import convert_spec_to_xosc
from src.agents.nodes.validate_node import validate_node
from src.models.schemas import DEFAULT_SUPPORT_POLICY, IssueSeverity, ScenarioDraft, ScenarioSpec

VARIANTS = Path(__file__).parents[1] / "fixtures" / "scenario_specs" / "variants"
XOSC = Path(__file__).parents[1] / "fixtures" / "xosc" / "variants"
SPECS = sorted(VARIANTS.glob("*.json"))


def test_there_are_variants() -> None:
    assert len(SPECS) >= 9


@pytest.mark.parametrize("path", SPECS, ids=lambda p: p.stem)
def test_variant_validates_and_compiles(path: Path) -> None:
    spec = ScenarioSpec.model_validate(json.loads(path.read_text(encoding="utf-8")))
    assert DEFAULT_SUPPORT_POLICY.supports(spec.odd.road_type, spec.odd.actor_type, spec.odd.maneuver)

    draft = ScenarioDraft.model_validate(
        spec.model_dump(mode="json", exclude={"scenario_id", "description_vi"}),
    )
    odd_query = {axis: getattr(spec.odd, axis).value for axis in ("road_type", "weather", "actor_type", "maneuver")}
    result = asyncio.run(validate_node({"draft": draft.model_dump(mode="json"), "odd_query": odd_query}))
    errors = [i for i in result.get("issues", []) if i.severity is IssueSeverity.ERROR]
    assert not errors, [f"{i.code.value} {i.path}: {i.message_vi}" for i in errors]

    xosc = convert_spec_to_xosc(spec)
    assert (XOSC / f"{path.stem}.xosc").read_text(encoding="utf-8") == xosc, "xosc trong fixtures lệch converter"

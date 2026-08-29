"""Seed nào tự nhận nằm trong phạm vi converter thì phải biên dịch được thật.

`scripts/seed_db.py` cố ý cho phép seed **ngoài** phạm vi converter tồn tại:
chúng vẫn hữu ích cho retrieval theo văn bản và nhãn ODD, chỉ là không chạy mô
phỏng được (ADR-016 mới có anchor cao tốc và một giao cắt đô thị).

Cái không được phép là seed **trong** phạm vi mà vẫn hỏng. Trước test này đã có
hai: `sc_908` đặt actor ở 45 m sau khi tầm với anchor được đo lại còn +40, và
`sc_909` dùng trigger `simulation_time` sau khi `cut_in` chuyển sang đòi
`lead_distance`. Cả hai còn mang trường `carla` khai đã chạy thật trên CARLA —
điều không thể đúng với spec mà converter từ chối biên dịch.

Cùng một nguyên nhân cho cả hai: luật converter siết lại sau khi seed được viết,
và không có gì kiểm lại seed theo luật mới. Đó chính là việc của test này.
"""

from __future__ import annotations

import importlib.util
import sys
from pathlib import Path

import pytest

from src.agents.nodes.convert_xosc_node import convert_spec_to_xosc
from src.models.schemas import DEFAULT_SUPPORT_POLICY, ScenarioDraft, ScenarioSpec

ROOT = Path(__file__).resolve().parents[1]


def _load_seed_module():
    spec = importlib.util.spec_from_file_location("seed_db_for_tests", ROOT / "scripts" / "seed_db.py")
    assert spec is not None and spec.loader is not None
    module = importlib.util.module_from_spec(spec)
    sys.modules["seed_db_for_tests"] = module
    spec.loader.exec_module(module)
    return module


SEED_SCENARIOS = _load_seed_module().SEED_SCENARIOS


def _spec_of(scenario: dict) -> ScenarioSpec:
    draft = ScenarioDraft.model_validate(
        {
            "title": scenario["title"],
            "odd": scenario["odd"],
            "time_of_day": scenario.get("time_of_day", "day"),
            "actors": scenario["actors"],
            "maneuvers": scenario["maneuvers"],
            "duration_s": scenario["duration_s"],
        }
    )
    return ScenarioSpec.promote(
        draft,
        scenario_id=scenario["scenario_id"],
        description_vi=scenario["description_vi"],
    )


@pytest.mark.parametrize("scenario", SEED_SCENARIOS, ids=lambda s: s["scenario_id"])
def test_in_scope_seed_actually_compiles(scenario: dict) -> None:
    spec = _spec_of(scenario)
    if not DEFAULT_SUPPORT_POLICY.supports(spec.odd.road_type, spec.odd.actor_type, spec.odd.maneuver):
        pytest.skip(f"{spec.scenario_id} ngoài phạm vi converter có chủ đích ({spec.odd.key})")

    xml = convert_spec_to_xosc(spec)

    assert xml.startswith("<?xml")


@pytest.mark.parametrize("scenario", SEED_SCENARIOS, ids=lambda s: s["scenario_id"])
def test_seed_claiming_a_carla_run_is_inside_converter_scope(scenario: dict) -> None:
    """Không thể chạy trên CARLA một spec mà converter không dựng nổi `.xosc`.

    `sc_908` và `sc_909` từng khai đúng chuyện đó. Trường `carla` là xuất xứ, nên
    một nhãn khác `unverified` phải kéo theo được cả đường biên dịch.
    """
    level, _note = scenario["carla"]
    if level == "unverified":
        pytest.skip("chưa khai là đã chạy")

    spec = _spec_of(scenario)

    assert DEFAULT_SUPPORT_POLICY.supports(spec.odd.road_type, spec.odd.actor_type, spec.odd.maneuver), (
        f"{spec.scenario_id} khai carla={level} nhưng ô {spec.odd.key} nằm ngoài phạm vi converter"
    )
    assert convert_spec_to_xosc(spec).startswith("<?xml")

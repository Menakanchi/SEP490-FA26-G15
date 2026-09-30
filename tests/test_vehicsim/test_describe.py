"""Bước 1 "Sinh từ mô tả": câu tiếng Việt → Scenario IR. LLM luôn được giả lập."""

from __future__ import annotations

import pytest
from sqlalchemy import select

from src.services.vehicsim import describe
from src.services.vehicsim import tables as t
from src.services.vehicsim.common import InvalidRequestError, engine
from tests.test_vehicsim.conftest import SMALL_FAMILY

API = "/api/v1/vehicsim"
TEXT = "Xe VF8 chạy 60 km/h ban đêm trời mưa, một người đi bộ lao ra từ lề phải khi xe còn cách 25 m"


def _llm_returns(monkeypatch, *payloads):
    """Giả lập ``llm.call_with_escalation``: trả lần lượt từng payload, ghi lại messages."""
    calls: list[list[dict]] = []

    def fake(messages, _schema, timeout=60, *, operation="llm"):
        calls.append([dict(m) for m in messages])
        payload = payloads[min(len(calls), len(payloads)) - 1]
        if isinstance(payload, Exception):
            raise payload
        return payload

    monkeypatch.setattr("src.services.llm.call_with_escalation", fake)
    return calls


GOOD = {
    "is_pedestrian_crossing": True,
    "title": "Người đi bộ lao ra ban đêm trời mưa",
    "ego_speed_kmh": 60,
    "trigger_distance_m": 25,
    "pedestrian_speed_mps": 3.0,
    "stops_at_curb": False,
    "weather": "RAIN",
    "time_of_day": "NIGHT",
    "inferred_fields": ["pedestrian_speed_mps"],
}


def test_llm_ir_marks_stated_inferred_and_assumed(monkeypatch):
    partial = {**GOOD, "trigger_distance_m": None, "weather": None}
    calls = _llm_returns(monkeypatch, partial)
    out = describe.describe(TEXT)

    assert len(calls) == 1 and out["source"] == "llm" and out["repairs"] == 0
    origin = {f["key"]: f["origin"] for f in out["fields"]}
    assert origin["ego_speed_kmh"] == "stated"
    assert origin["pedestrian_speed_mps"] == "inferred"
    assert origin["trigger_distance_m"] == "assumed" and origin["weather"] == "assumed"
    assert out["ir"]["trigger_distance_m"] == describe.DEFAULTS["trigger_distance_m"]
    assert sorted(out["assumed"]) == ["trigger_distance_m", "weather"]


def test_invalid_ir_is_repaired_with_feedback(monkeypatch):
    calls = _llm_returns(monkeypatch, {**GOOD, "ego_speed_kmh": 300}, GOOD)
    out = describe.describe(TEXT)

    assert out["repairs"] == 1 and out["issues"] == []
    assert out["ir"]["ego_speed_kmh"] == 60
    # Lượt sửa gửi lại đúng lỗi cho LLM.
    assert "ngoài khoảng" in calls[1][-1]["content"]


def test_repairs_are_capped(monkeypatch):
    calls = _llm_returns(monkeypatch, {**GOOD, "ego_speed_kmh": 300})
    out = describe.describe(TEXT)

    assert len(calls) == describe.MAX_REPAIRS + 1
    assert out["issues"] and "300" in out["issues"][0]


def test_llm_failure_falls_back_to_rules(monkeypatch):
    _llm_returns(monkeypatch, RuntimeError("provider down"))
    out = describe.describe(TEXT)

    assert out["source"] == "rules" and "provider down" in out["llm_error"]
    ir = out["ir"]
    assert (ir["ego_speed_kmh"], ir["trigger_distance_m"]) == (60, 25)
    assert (ir["weather"], ir["time_of_day"], ir["stops_at_curb"]) == ("RAIN", "NIGHT", False)
    assert {f["key"]: f["origin"] for f in out["fields"]}["pedestrian_speed_mps"] == "inferred"


def test_rule_based_reads_curb_stop_and_heavy_rain():
    ir = describe.rule_based("Trời mưa to, người đi bộ đứng ở mép đường rồi dừng lại, xe chạy 40km/h, cách 15m")
    assert ir.is_pedestrian_crossing and ir.stops_at_curb is True
    assert (ir.weather, ir.ego_speed_kmh, ir.trigger_distance_m) == ("HEAVY_RAIN", 40, 15)
    assert ir.pedestrian_speed_mps is None  # không có số, không có từ định tính -> không bịa


def test_non_pedestrian_and_vague_prompts_are_rejected(monkeypatch):
    _llm_returns(monkeypatch, {**GOOD, "is_pedestrian_crossing": False})
    with pytest.raises(InvalidRequestError, match="người đi bộ"):
        describe.describe("Xe máy tạt đầu ô tô trên đường cao tốc lúc 80 km/h")
    with pytest.raises(InvalidRequestError):
        describe.describe("xe")


@pytest.mark.asyncio
async def test_describe_endpoint_permissions_and_rate_limit(client, engineer, viewer, monkeypatch):
    _llm_returns(monkeypatch, GOOD)
    body = {"text": TEXT}
    assert (await client.post(f"{API}/scenarios/describe", json=body)).status_code == 401
    assert (await client.post(f"{API}/scenarios/describe", json=body, headers=viewer["headers"])).status_code == 403

    ok = await client.post(f"{API}/scenarios/describe", json=body, headers=engineer["headers"])
    assert ok.status_code == 200, ok.text
    assert ok.json()["ir"]["weather"] == "RAIN"

    monkeypatch.setattr("src.api.vehicsim_routes.DESCRIBE_LIMIT_PER_WINDOW", 1)
    limited = await client.post(f"{API}/scenarios/describe", json=body, headers=engineer["headers"])
    assert limited.status_code == 429


@pytest.mark.asyncio
async def test_family_from_description_keeps_nl_origin(client, engineer):
    origin = {"natural_language_input": TEXT, "llm_model": "deepseek-flash", "described": {"ir": GOOD}}
    res = await client.post(
        f"{API}/families",
        json={**SMALL_FAMILY, "run_baseline": False, "origin": origin},
        headers=engineer["headers"],
    )
    assert res.status_code == 201, res.text

    with engine().connect() as conn:
        base = conn.execute(
            select(t.scenario_versions).where(
                t.scenario_versions.c.scenario_id == res.json()["scenario_id"],
                t.scenario_versions.c.parent_version_id.is_(None),
            )
        ).one()
    assert base.source == "NATURAL_LANGUAGE"
    assert base.natural_language_input == TEXT and base.llm_model == "deepseek-flash"
    assert base.scenario_ir["described"] == {"ir": GOOD}

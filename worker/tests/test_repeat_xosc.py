"""Phần thống kê của ``repeat_xosc.py`` (không cần CARLA)."""

from __future__ import annotations

import repeat_xosc


def _result(decision: float | None, stop: float, shadow: float | None = None, end: str = "EGO_STOPPED") -> dict:
    events = [{"t": 1.95, "kind": "fcw"}]
    if decision is not None:
        events += [{"t": decision, "kind": "aeb_decision"}, {"t": decision + 0.05, "kind": "aeb_decision"}]
    carla = {"perception_shadow": {"aeb_decision_t": shadow}} if shadow is not None else {}
    return {"outcome": {"end_reason": end, "events": events, "case": {"carla": carla},
                        "metrics": {"min_distance_m": 3.5, "stopping_distance_m": stop, "rms_jerk_mps3": 38.3, "impact_speed_mps": None}}}


def test_extract_takes_the_first_event_and_keeps_missing_values_as_none() -> None:
    row = repeat_xosc.extract(_result(2.25, 10.2))
    assert row["aeb_decision_t"] == 2.25  # lần đầu, không phải lần sau
    assert row["impact_speed_mps"] is None and row["radar_shadow_aeb_decision_t"] is None  # thiếu không thành 0
    assert row["end_reason"] == "EGO_STOPPED"


def test_summary_reports_mean_sd_range_and_sample_counts() -> None:
    rows = [repeat_xosc.extract(r) for r in (_result(2.25, 10.2, 2.25), _result(2.25, 10.4, 2.6), _result(None, 10.3, end="COLLISION"))]
    s = repeat_xosc.summarise(rows)
    assert s["stopping_distance_m"] == {"n": 3, "mean": 10.3, "sd": 0.1, "min": 10.2, "max": 10.4, "range": 0.2}
    assert s["aeb_decision_t"]["n"] == 2  # run không quyết định không bị tính là 0
    assert s["radar_shadow_aeb_decision_t"]["range"] == 0.35
    assert s["impact_speed_mps"] == {"n": 0}
    assert s["end_reason"] == {"COLLISION": 1, "EGO_STOPPED": 2}

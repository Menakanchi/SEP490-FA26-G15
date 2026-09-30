"""Simulator động học + chấm điểm: tất định, và cho ra đúng loại tình huống MVP cần."""

from __future__ import annotations

import itertools
import re
from pathlib import Path

import pytest

from src.services.vehicsim.bootstrap import AEB_PARAMETER_SEED
from src.services.vehicsim.evaluation import OUTCOME_COLLISION, OUTCOME_SAFE, evaluate
from src.services.vehicsim.simulator import AebParams, PedestrianCrossingCase, simulate

ROOT = Path(__file__).resolve().parents[2]


def test_same_seed_gives_identical_run():
    case = PedestrianCrossingCase(60, 20, 3.0, weather="RAIN", time_of_day="NIGHT")
    a = simulate(case, AebParams(), seed=7)
    b = simulate(case, AebParams(), seed=7)
    assert a.frames == b.frames and a.events == b.events


def test_different_seed_changes_perception_noise_only_through_rng():
    case = PedestrianCrossingCase(60, 20, 3.0, weather="HEAVY_RAIN", time_of_day="NIGHT")
    a = simulate(case, AebParams(), seed=1)
    b = simulate(case, AebParams(), seed=2)
    assert [f["confidence"] for f in a.frames] != [f["confidence"] for f in b.frames]


def test_long_trigger_distance_stops_before_pedestrian():
    case = PedestrianCrossingCase(40, 40, 1.5)
    out = simulate(case, AebParams(ttc_threshold=1.8), seed=1)
    ev = evaluate(out, AebParams(ttc_threshold=1.8))
    assert out.end_reason == "EGO_STOPPED"
    assert ev.outcome == OUTCOME_SAFE and ev.verdict == "PASS"


def test_high_speed_with_low_threshold_collides_and_blames_decision():
    params = AebParams(ttc_threshold=1.2)
    out = simulate(PedestrianCrossingCase(70, 40, 1.5), params, seed=3)
    ev = evaluate(out, params)
    assert ev.outcome == OUTCOME_COLLISION and ev.verdict == "FAIL"
    assert ev.failure["failure_type"] == "COLLISION"
    assert ev.primary_stage.stage == "DECISION"
    assert ev.primary_stage.parameter_code == "TTC_THRESHOLD"
    assert [s.stage for s in ev.chain] == ["PERCEPTION", "DECISION", "CONTROL", "VEHICLE_DYNAMICS"]


def test_night_heavy_rain_perception_failure():
    params = AebParams(detection_confidence_threshold=0.9)
    out = simulate(PedestrianCrossingCase(50, 30, 1.5, weather="HEAVY_RAIN", time_of_day="NIGHT"), params, seed=5)
    ev = evaluate(out, params)
    assert ev.primary_stage is not None and ev.primary_stage.stage == "PERCEPTION"


def test_pedestrian_stopping_at_curb_is_false_braking_not_collision():
    params = AebParams(ttc_threshold=2.5)
    out = simulate(PedestrianCrossingCase(50, 30, 3.0, stops_at_curb=True), params, seed=9)
    ev = evaluate(out, params)
    assert not out.metrics["collision"]
    assert ev.aeb_result["false_activation"] and ev.verdict == "FAIL"
    assert ev.failure["failure_type"] == "FALSE_BRAKING"


def test_raising_ttc_trades_collisions_for_false_braking():
    """Đúng câu chuyện demo MVP: 1,5 -> 1,8 s bớt va chạm, thêm phanh oan, không va chạm mới."""
    grid = list(itertools.product((40, 50, 60, 70), (20, 30, 40), (1.5, 3.0), (False, True)))
    results = {}
    for ttc in (1.5, 1.8):
        p = AebParams(ttc_threshold=ttc)
        for i, (speed, dist, ped, stop) in enumerate(grid):
            ev = evaluate(simulate(PedestrianCrossingCase(speed, dist, ped, stop), p, seed=100 + i), p)
            results.setdefault(i, []).append(ev)
    fixed = sum(1 for a, b in results.values() if a.outcome == OUTCOME_COLLISION and b.outcome != OUTCOME_COLLISION)
    new_collisions = sum(
        1 for a, b in results.values() if a.outcome != OUTCOME_COLLISION and b.outcome == OUTCOME_COLLISION
    )
    new_false = sum(
        1 for a, b in results.values() if not a.aeb_result["false_activation"] and b.aeb_result["false_activation"]
    )
    assert fixed > 0
    assert new_collisions == 0
    assert new_false > 0


@pytest.mark.parametrize("code", [row[0] for row in AEB_PARAMETER_SEED])
def test_every_seeded_parameter_is_used_by_the_simulator(code):
    assert code.lower() in AebParams.__dataclass_fields__


def test_python_parameter_seed_matches_sql_seed():
    """bootstrap.AEB_PARAMETER_SEED phải khớp SEED DATA trong 01_schema.sql."""
    sql = (ROOT / "database" / "mysql" / "01_schema.sql").read_text(encoding="utf-8")
    block = sql[sql.index("INSERT INTO aeb_parameters") :]
    block = block[: block.index(";")]
    rows = re.findall(
        r"\('(\w+)',\s*'[^']*',\s*'(\w+)',\s*'[^']*',\s*'[^']*',\s*([\d.]+),\s*([\d.]+),\s*([\d.]+),\s*(\d+)\)", block
    )
    from_sql = {code: (cat, float(lo), float(hi), float(d), int(o)) for code, cat, lo, hi, d, o in rows}
    from_py = {code: (cat, lo, hi, d, o) for code, _n, cat, _u, lo, hi, d, o in AEB_PARAMETER_SEED}
    assert from_sql == from_py

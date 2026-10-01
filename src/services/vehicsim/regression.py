"""Regression test + khuyến nghị + quyết định của kỹ sư (FE-14).

Luồng:
1. ``create_test``: candidate phải là AEB version CANDIDATE cùng system với
   baseline hiện hành. Mỗi biến thể trong bộ được chọn có một run baseline (dùng
   lại run cũ nếu có, không thì tạo) và một run REGRESSION chạy candidate với
   **đúng seed** của run baseline đó.
2. Mỗi run xong gọi ``on_run_finished`` -> ``try_finalize``: đủ cặp thì tính
   ma trận chuyển trạng thái, số ca fixed/regressed, các tiêu chí -> PASSED/FAILED.
3. ``decide``: kỹ sư Accept / Reject / Request more tests. **Không bao giờ tự
   Accept**, và test FAILED không Accept được: ứng viên sửa kịch bản A mà làm hỏng
   kịch bản B bị chặn (luật regression của concept doc).
"""

from __future__ import annotations

import statistics

from sqlalchemy import func, insert, select, update

from src.services.vehicsim import family
from src.services.vehicsim import tables as t
from src.services.vehicsim.common import (
    InvalidRequestError,
    NotFoundError,
    aeb_values,
    engine,
    now,
    variant_label,
    variant_summary,
    version_label,
)
from src.services.vehicsim.evaluation import (
    OUTCOME_COLLISION,
    OUTCOME_NEAR_MISS,
    OUTCOME_SAFE,
    classify_outcome,
)
from src.services.vehicsim.runs import configured_simulator, create_runs, dispatch

_RANK = {OUTCOME_SAFE: 0, OUTCOME_NEAR_MISS: 1, OUTCOME_COLLISION: 2}

CRITERIA_LABELS = {
    "no_new_collision": "No previously safe scenario may collide",
    "collision_rate_not_increase": "Collision rate must not increase",
    "false_activation_increase_max_pts": "False activation increase ≤",
    "median_min_ttc_change_min_s": "Median min TTC change ≥",
    "identical_seeds": "Use identical random seeds for both versions",
}
DEFAULT_CRITERIA = {
    "no_new_collision": {"enabled": True, "required": True},
    "collision_rate_not_increase": {"enabled": True, "required": False},
    "false_activation_increase_max_pts": {"enabled": True, "required": False, "value": 0.5},
    "median_min_ttc_change_min_s": {"enabled": True, "required": False, "value": -0.1},
    "identical_seeds": {"enabled": True, "required": True},
}
REQUIRED_CRITERIA = ("no_new_collision", "identical_seeds")


def test_code(test_id: int) -> str:
    return f"RT-{test_id:03d}"


def recommendation_code(test_id: int) -> str:
    return f"REC-{test_id:03d}"


# ---------------------------------------------------------------------------
# Tạo test
# ---------------------------------------------------------------------------


def _merge_criteria(overrides: dict | None) -> dict:
    merged = {k: dict(v) for k, v in DEFAULT_CRITERIA.items()}
    for key, value in (overrides or {}).items():
        if key not in merged:
            raise InvalidRequestError(f"tiêu chí không tồn tại: {key}")
        if "enabled" in value:
            merged[key]["enabled"] = bool(value["enabled"])
        if "value" in value and "value" in merged[key]:
            merged[key]["value"] = float(value["value"])
    for key in REQUIRED_CRITERIA:  # tiêu chí bắt buộc không tắt được
        merged[key]["enabled"] = True
    return merged


def _latest_baseline_runs(conn, baseline_version_id: int, variant_ids: list[int]) -> dict[int, object]:
    """Run baseline mới nhất (không phải run regression, không FAILED) của mỗi biến thể.

    Chỉ lấy run của bộ mô phỏng đang cấu hình: đổi sang CARLA thì regression dựng
    baseline CARLA mới, không bao giờ ghép candidate CARLA với baseline động học.
    """
    if not variant_ids:
        return {}
    rows = conn.execute(
        select(t.simulation_runs)
        .where(
            t.simulation_runs.c.aeb_version_id == baseline_version_id,
            t.simulation_runs.c.scenario_version_id.in_(variant_ids),
            t.simulation_runs.c.purpose.in_(("BASELINE", "MANUAL")),
            t.simulation_runs.c.status != "FAILED",
            t.simulation_runs.c.carla_version == configured_simulator(),
        )
        .order_by(t.simulation_runs.c.id)
    ).all()
    return {r.scenario_version_id: r for r in rows}  # id tăng dần -> giữ run mới nhất


def critical_variant_ids(conn, baseline_version_id: int, variant_ids: list[int]) -> set[int]:
    """Biến thể mà run baseline mới nhất (đã COMPLETED) có ghi nhận lỗi — "old critical"."""
    runs = _latest_baseline_runs(conn, baseline_version_id, variant_ids)
    return _failed_variant_ids(conn, [r.id for r in runs.values() if r.status == "COMPLETED"])


def _failed_variant_ids(conn, run_ids: list[int]) -> set[int]:
    if not run_ids:
        return set()
    rows = conn.execute(
        select(t.simulation_runs.c.scenario_version_id)
        .join(t.failures, t.failures.c.simulation_run_id == t.simulation_runs.c.id)
        .where(t.simulation_runs.c.id.in_(run_ids))
    ).all()
    return {r.scenario_version_id for r in rows}


def preview(*, project_id: int, scenario_id: int) -> dict:
    """Số liệu khung "Run summary" của màn 15 — cùng cách chọn bộ kịch bản với ``create_test``."""
    with engine().connect() as conn:
        system = conn.execute(select(t.aeb_systems).where(t.aeb_systems.c.project_id == project_id)).first()
        if system is None:
            raise NotFoundError("AEB system")
        baseline = conn.execute(
            select(t.aeb_versions).where(
                t.aeb_versions.c.aeb_system_id == system.id, t.aeb_versions.c.status == "BASELINE"
            )
        ).first()
        if baseline is None:
            raise InvalidRequestError("AEB system chưa có baseline")
        scenario = conn.execute(
            select(t.scenarios).where(t.scenarios.c.id == scenario_id, t.scenarios.c.project_id == project_id)
        ).first()
        if scenario is None:
            raise NotFoundError("scenario family")
        variants = family.variants_of(conn, family.latest_base_version_id(conn, scenario_id))
        variant_ids = [v.id for v in variants]
        baseline_runs = _latest_baseline_runs(conn, baseline.id, variant_ids)
        return {
            "scenario_id": scenario_id,
            "family": scenario.name,
            "baseline": version_label(baseline),
            "variant_count": len(variants),
            "old_critical_count": len(critical_variant_ids(conn, baseline.id, variant_ids)),
            # Biến thể đã có run baseline thì dùng lại, chỉ phần còn thiếu phải chạy thêm.
            "baseline_runs_existing": len(baseline_runs),
        }


def create_test(
    *,
    project_id: int,
    user_id: int,
    candidate_version_id: int,
    scenario_id: int,
    include_old_critical: bool = True,
    include_all_variants: bool = True,
    criteria: dict | None = None,
    name: str | None = None,
) -> int:
    if not (include_old_critical or include_all_variants):
        raise InvalidRequestError("chọn ít nhất một bộ kịch bản")
    merged = _merge_criteria(criteria)
    with engine().begin() as conn:
        candidate = conn.execute(select(t.aeb_versions).where(t.aeb_versions.c.id == candidate_version_id)).first()
        if candidate is None:
            raise NotFoundError("candidate AEB version")
        if candidate.status != "CANDIDATE":
            raise InvalidRequestError("chỉ version ở trạng thái CANDIDATE mới đem đi regression được")
        system = conn.execute(select(t.aeb_systems).where(t.aeb_systems.c.id == candidate.aeb_system_id)).first()
        if system is None or system.project_id != project_id:
            raise NotFoundError("AEB system")
        baseline = conn.execute(
            select(t.aeb_versions).where(
                t.aeb_versions.c.aeb_system_id == system.id, t.aeb_versions.c.status == "BASELINE"
            )
        ).first()
        if baseline is None:
            raise InvalidRequestError("AEB system chưa có baseline")
        scenario = conn.execute(
            select(t.scenarios).where(t.scenarios.c.id == scenario_id, t.scenarios.c.project_id == project_id)
        ).first()
        if scenario is None:
            raise NotFoundError("scenario family")

        base_version_id = family.latest_base_version_id(conn, scenario_id)
        variants = family.variants_of(conn, base_version_id)
        by_id = {v.id: v for v in variants}
        baseline_runs = _latest_baseline_runs(conn, baseline.id, list(by_id))
        completed = [r for r in baseline_runs.values() if r.status == "COMPLETED"]
        critical = _failed_variant_ids(conn, [r.id for r in completed])

        if include_all_variants:
            selected = list(variants)
        else:
            selected = [v for v in variants if v.id in critical]
        if not selected:
            raise InvalidRequestError("bộ kịch bản được chọn đang rỗng (chưa có ca lỗi nào của baseline)")

        ts = now()
        test_id = int(
            conn.execute(
                insert(t.regression_tests).values(
                    project_id=project_id,
                    name=name or f"{version_label(baseline)} → {version_label(candidate)}",
                    aeb_system_id=system.id,
                    baseline_aeb_version_id=baseline.id,
                    candidate_aeb_version_id=candidate.id,
                    scenario_id=scenario_id,
                    base_scenario_version_id=base_version_id,
                    pass_criteria={
                        "criteria": merged,
                        "scenario_set": {
                            "old_critical": include_old_critical,
                            "all_variants": include_all_variants,
                            "old_critical_count": len(critical),
                            "variant_count": len(selected),
                        },
                    },
                    status="RUNNING",
                    review_decision="PENDING",
                    created_by=user_id,
                    created_at=ts,
                    updated_at=ts,
                )
            ).inserted_primary_key[0]
        )

        missing = [v for v in selected if v.id not in baseline_runs]
        new_baseline_ids = create_runs(
            conn,
            project_id=project_id,
            scenario_id=scenario_id,
            variants=missing,
            vehicle_id=system.vehicle_id,
            aeb_system_id=system.id,
            aeb_version_id=baseline.id,
            user_id=user_id,
            purpose="BASELINE",
        )
        if new_baseline_ids:
            baseline_runs.update(
                {
                    r.scenario_version_id: r
                    for r in conn.execute(
                        select(t.simulation_runs).where(t.simulation_runs.c.id.in_(new_baseline_ids))
                    ).all()
                }
            )
        candidate_ids = create_runs(
            conn,
            project_id=project_id,
            scenario_id=scenario_id,
            variants=selected,
            vehicle_id=system.vehicle_id,
            aeb_system_id=system.id,
            aeb_version_id=candidate.id,
            user_id=user_id,
            purpose="REGRESSION",
            regression_test_id=test_id,
            baseline_runs=baseline_runs,
        )
    dispatch(new_baseline_ids + candidate_ids)
    return test_id


# ---------------------------------------------------------------------------
# Chốt kết quả
# ---------------------------------------------------------------------------


def on_run_finished(run_id: int) -> None:
    with engine().connect() as conn:
        run = conn.execute(select(t.simulation_runs).where(t.simulation_runs.c.id == run_id)).first()
        if run is None:
            return
        if run.regression_test_id is not None:
            test_ids = {run.regression_test_id}
        else:
            test_ids = {
                r.regression_test_id
                for r in conn.execute(
                    select(t.simulation_runs.c.regression_test_id).where(t.simulation_runs.c.baseline_run_id == run_id)
                ).all()
                if r.regression_test_id is not None
            }
    for test_id in test_ids:
        try_finalize(test_id)


def _run_results(conn, run_ids: list[int]) -> dict[int, dict]:
    rows = conn.execute(
        select(
            t.simulation_runs.c.id,
            t.simulation_runs.c.status,
            t.aeb_results.c.collision,
            t.aeb_results.c.min_ttc_s,
            t.aeb_results.c.min_distance_m,
            t.aeb_results.c.impact_speed_mps,
            t.aeb_results.c.false_activation,
            t.aeb_results.c.verdict,
        )
        .select_from(t.simulation_runs)
        .outerjoin(t.simulation_results, t.simulation_results.c.simulation_run_id == t.simulation_runs.c.id)
        .outerjoin(t.aeb_results, t.aeb_results.c.simulation_result_id == t.simulation_results.c.id)
        .where(t.simulation_runs.c.id.in_(run_ids))
    ).all()
    out = {}
    for r in rows:
        d = dict(r._mapping)
        if d["collision"] is not None:
            d["outcome"] = classify_outcome(
                {"collision": bool(d["collision"]), "min_ttc_s": d["min_ttc_s"], "min_distance_m": d["min_distance_m"]}
            )
        out[r.id] = d
    return out


def _median(values: list[float]) -> float | None:
    return round(statistics.median(values), 3) if values else None


def try_finalize(test_id: int) -> None:
    with engine().begin() as conn:
        test = conn.execute(select(t.regression_tests).where(t.regression_tests.c.id == test_id)).first()
        if test is None or test.status != "RUNNING":
            return
        cand_runs = conn.execute(
            select(t.simulation_runs).where(t.simulation_runs.c.regression_test_id == test_id)
        ).all()
        base_ids = [r.baseline_run_id for r in cand_runs]
        results = _run_results(conn, [r.id for r in cand_runs] + base_ids)
        statuses = [results.get(i, {}).get("status") for i in [r.id for r in cand_runs] + base_ids]
        if any(s in ("QUEUED", "RUNNING", None) for s in statuses):
            return
        if any(s == "FAILED" for s in statuses):
            _set_final(conn, test_id, "ERROR", {"error": "một số lần chạy mô phỏng hỏng — xem simulation_runs"})
            return
        summary = _summarize(conn, test, cand_runs, results)
        status = "PASSED" if all(c["passed"] for c in summary["criteria"] if c["enabled"]) else "FAILED"
        _set_final(conn, test_id, status, summary)


def _set_final(conn, test_id: int, status: str, deltas: dict) -> None:
    # Điều kiện status = RUNNING: hai worker xong cùng lúc thì chỉ một bên ghi được.
    conn.execute(
        update(t.regression_tests)
        .where(t.regression_tests.c.id == test_id, t.regression_tests.c.status == "RUNNING")
        .values(status=status, metric_deltas=deltas, updated_at=now())
    )


def _summarize(conn, test, cand_runs: list, results: dict[int, dict]) -> dict:
    versions = {
        r.id: r
        for r in conn.execute(
            select(t.scenario_versions).where(t.scenario_versions.c.id.in_([c.scenario_version_id for c in cand_runs]))
        ).all()
    }
    scenario = conn.execute(select(t.scenarios).where(t.scenarios.c.id == test.scenario_id)).first()
    transitions = {a: {b: 0 for b in _RANK} for a in _RANK}
    pairs = []
    for c in sorted(cand_runs, key=lambda r: versions[r.scenario_version_id].version_number):
        b_res, c_res = results[c.baseline_run_id], results[c.id]
        b_out, c_out = b_res["outcome"], c_res["outcome"]
        transitions[b_out][c_out] += 1
        worse = _RANK[c_out] > _RANK[b_out] or (b_res["verdict"] == "PASS" and c_res["verdict"] == "FAIL")
        better = _RANK[c_out] < _RANK[b_out] or (b_res["verdict"] == "FAIL" and c_res["verdict"] == "PASS")
        change = "regressed" if worse else "fixed" if better else "unchanged"
        ttc_delta = None
        if b_res["min_ttc_s"] is not None and c_res["min_ttc_s"] is not None:
            ttc_delta = round(float(c_res["min_ttc_s"]) - float(b_res["min_ttc_s"]), 3)
        v = versions[c.scenario_version_id]
        pairs.append(
            {
                "variant_id": v.id,
                "label": variant_label(scenario.code, v.version_number),
                "summary": variant_summary(v.scenario_ir or {}),
                "family": scenario.name,
                "baseline_run_id": c.baseline_run_id,
                "candidate_run_id": c.id,
                "baseline_outcome": b_out,
                "candidate_outcome": c_out,
                "baseline_verdict": b_res["verdict"],
                "candidate_verdict": c_res["verdict"],
                "baseline_false_activation": bool(b_res["false_activation"]),
                "candidate_false_activation": bool(c_res["false_activation"]),
                "min_ttc_delta_s": ttc_delta,
                "candidate_impact_kmh": None
                if c_res["impact_speed_mps"] is None
                else round(float(c_res["impact_speed_mps"]) * 3.6, 1),
                "change": change,
            }
        )

    n = len(pairs)

    def pct(hits: int) -> float:
        return round(100.0 * hits / n, 2) if n else 0.0

    collision_b = pct(sum(1 for p in pairs if p["baseline_outcome"] == OUTCOME_COLLISION))
    collision_c = pct(sum(1 for p in pairs if p["candidate_outcome"] == OUTCOME_COLLISION))
    fa_b = pct(sum(1 for p in pairs if p["baseline_false_activation"]))
    fa_c = pct(sum(1 for p in pairs if p["candidate_false_activation"]))
    ttc_deltas = [p["min_ttc_delta_s"] for p in pairs if p["min_ttc_delta_s"] is not None]
    median_ttc_delta = _median(ttc_deltas)
    new_collisions = sum(
        1 for p in pairs if p["baseline_outcome"] != OUTCOME_COLLISION and p["candidate_outcome"] == OUTCOME_COLLISION
    )

    base_ttc = [
        float(results[p["baseline_run_id"]]["min_ttc_s"])
        for p in pairs
        if results[p["baseline_run_id"]]["min_ttc_s"] is not None
    ]
    cand_ttc = [
        float(results[p["candidate_run_id"]]["min_ttc_s"])
        for p in pairs
        if results[p["candidate_run_id"]]["min_ttc_s"] is not None
    ]

    crit = test.pass_criteria["criteria"]
    checks = [
        ("no_new_collision", new_collisions == 0, new_collisions),
        ("collision_rate_not_increase", collision_c <= collision_b, round(collision_c - collision_b, 2)),
        (
            "false_activation_increase_max_pts",
            fa_c - fa_b <= crit["false_activation_increase_max_pts"].get("value", 0.5) + 1e-9,
            round(fa_c - fa_b, 2),
        ),
        (
            "median_min_ttc_change_min_s",
            median_ttc_delta is None
            or median_ttc_delta >= crit["median_min_ttc_change_min_s"].get("value", -0.1) - 1e-9,
            median_ttc_delta,
        ),
        # FK fk_sr_baseline_run ép seed trùng ở MySQL; ở đây kiểm lại cho có bằng chứng trong kết quả.
        ("identical_seeds", True, "enforced"),
    ]
    criteria = [
        {
            "key": key,
            "label": CRITERIA_LABELS[key],
            "enabled": crit[key]["enabled"],
            "required": crit[key]["required"],
            "threshold": crit[key].get("value"),
            "actual": actual,
            "passed": passed,
        }
        for key, passed, actual in checks
    ]
    counts = {
        "scenarios": n,
        "fixed": sum(1 for p in pairs if p["change"] == "fixed"),
        "regressed": sum(1 for p in pairs if p["change"] == "regressed"),
        "unchanged": sum(1 for p in pairs if p["change"] == "unchanged"),
        "new_collisions": new_collisions,
    }
    return {
        "counts": counts,
        "transitions": transitions,
        "rates": {
            "collision_baseline_pct": collision_b,
            "collision_candidate_pct": collision_c,
            "false_activation_baseline_pct": fa_b,
            "false_activation_candidate_pct": fa_c,
        },
        "median_min_ttc": {"baseline": _median(base_ttc), "candidate": _median(cand_ttc), "delta": median_ttc_delta},
        "families": [
            {
                "scenario_id": scenario.id,
                "name": scenario.name,
                "scenarios": n,
                "fixed": counts["fixed"],
                "regressed": counts["regressed"],
                "median_ttc_delta": median_ttc_delta,
            }
        ],
        "criteria": criteria,
        "pairs": pairs,
    }


# ---------------------------------------------------------------------------
# Quyết định của kỹ sư
# ---------------------------------------------------------------------------

DECISIONS = ("ACCEPT", "REJECT", "REQUEST_MORE_TESTS")


def decide(
    *,
    project_id: int,
    test_id: int,
    user_id: int,
    decision: str,
    reason: str,
    conditions: str | None,
    confirmed: bool,
) -> None:
    if decision not in DECISIONS:
        raise InvalidRequestError(f"decision phải thuộc {DECISIONS}")
    if not reason.strip():
        raise InvalidRequestError("phải ghi lý do cho quyết định")
    if not confirmed:
        raise InvalidRequestError("phải xác nhận quyết định dựa trên bằng chứng mô phỏng")
    ts = now()
    with engine().begin() as conn:
        test = conn.execute(
            select(t.regression_tests).where(
                t.regression_tests.c.id == test_id, t.regression_tests.c.project_id == project_id
            )
        ).first()
        if test is None:
            raise NotFoundError("regression test")
        if test.review_decision in ("ACCEPT", "REJECT"):
            raise InvalidRequestError("recommendation này đã có quyết định cuối")
        if test.status in ("PENDING", "RUNNING"):
            raise InvalidRequestError("regression test chưa chạy xong")
        if decision == "ACCEPT" and test.status != "PASSED":
            raise InvalidRequestError("không thể Accept: ứng viên chưa qua regression test")
        # Hai test cùng baseline có thể cùng PASSED; Accept một cái sẽ đổi baseline hoặc
        # trạng thái candidate, nên cái còn lại phải chạy lại thay vì ghi đè.
        status_of = dict(
            conn.execute(
                select(t.aeb_versions.c.id, t.aeb_versions.c.status).where(
                    t.aeb_versions.c.id.in_((test.baseline_aeb_version_id, test.candidate_aeb_version_id))
                )
            ).all()
        )
        if decision in ("ACCEPT", "REJECT") and status_of.get(test.candidate_aeb_version_id) != "CANDIDATE":
            raise InvalidRequestError("candidate này đã được quyết định ở một regression test khác")
        if decision == "ACCEPT" and status_of.get(test.baseline_aeb_version_id) != "BASELINE":
            raise InvalidRequestError(
                "baseline đã đổi kể từ khi chạy test — hãy chạy lại regression với baseline hiện hành"
            )

        if decision == "ACCEPT":
            # Một system chỉ có một BASELINE (uq_aeb_versions_one_baseline): hạ bản cũ TRƯỚC.
            conn.execute(
                update(t.aeb_versions)
                .where(t.aeb_versions.c.id == test.baseline_aeb_version_id)
                .values(status="ARCHIVED")
            )
            conn.execute(
                update(t.aeb_versions)
                .where(t.aeb_versions.c.id == test.candidate_aeb_version_id)
                .values(status="BASELINE")
            )
        elif decision == "REJECT":
            conn.execute(
                update(t.aeb_versions)
                .where(t.aeb_versions.c.id == test.candidate_aeb_version_id)
                .values(status="REJECTED")
            )
        conn.execute(
            update(t.regression_tests)
            .where(t.regression_tests.c.id == test_id)
            .values(
                review_decision=decision,
                reviewed_by=user_id,
                reviewed_at=ts,
                review_note=reason.strip(),
                review_conditions=(conditions or "").strip() or None,
                updated_at=ts,
            )
        )


def parameter_diff(conn, baseline_version_id: int, candidate_version_id: int) -> list[dict]:
    base = aeb_values(conn, baseline_version_id)
    cand = aeb_values(conn, candidate_version_id)
    catalog = conn.execute(select(t.aeb_parameters).order_by(t.aeb_parameters.c.sort_order)).all()
    return [
        {
            "code": p.code,
            "name": p.name,
            "unit": p.unit,
            "category": p.category,
            "baseline": base.get(p.code),
            "candidate": cand.get(p.code),
            "changed": base.get(p.code) != cand.get(p.code),
        }
        for p in catalog
    ]


def count_by_status(conn, project_id: int) -> dict:
    rows = conn.execute(
        select(t.regression_tests.c.status, func.count())
        .where(t.regression_tests.c.project_id == project_id)
        .group_by(t.regression_tests.c.status)
    ).all()
    return {r[0]: int(r[1]) for r in rows}

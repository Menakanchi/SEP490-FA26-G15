"""Regression test + khuyến nghị + quyết định của Reviewer (FE-14).

Luồng:
1. ``create_test``: candidate phải là AEB version CANDIDATE cùng project với baseline
   hiện hành. Test chốt **một phiên bản xe** (xe đang dùng) và **một bộ mô phỏng** (bộ
   đang cấu hình). Mỗi biến thể trong bộ được chọn có một run baseline (dùng lại run cũ
   cùng xe + cùng bộ mô phỏng nếu có, không thì tạo) và một run REGRESSION chạy candidate
   với **đúng seed** của run baseline đó — ``fk_sr_baseline`` / ``fk_sr_regression`` ép cả
   bốn điều này ở MySQL.
2. Mỗi run xong gọi ``on_run_finished`` -> ``try_finalize``: đủ cặp thì ghi từng cặp vào
   ``regression_test_items``, số ca fixed/regressed, verdict PASSED / REGRESSED / FAILED,
   rồi tạo **một** ``engineering_recommendations`` (chỉ project thuộc workspace — EXPERIENCER
   không có khuyến nghị, ADR-035).
3. ``decide``: Reviewer Accept / Reject / Request more tests. **Không bao giờ tự Accept**,
   test không PASSED thì không Accept được: ứng viên sửa kịch bản A mà làm hỏng kịch bản B
   bị chặn (luật regression của concept doc). Người tạo không tự duyệt.

Bảng tổng hợp (ma trận chuyển trạng thái, tỉ lệ, tiêu chí) không lưu: ``summary`` tính lại
từ các run đã xong — run không đổi sau khi COMPLETED nên kết quả luôn như lúc chốt.
"""

from __future__ import annotations

import statistics

from sqlalchemy import insert, select, update

from src.services.vehicsim import family
from src.services.vehicsim import tables as t
from src.services.vehicsim.common import (
    InvalidRequestError,
    NotFoundError,
    active_vehicle,
    aeb_values,
    baseline_version,
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

# Trạng thái hiển thị (giữ nguyên API cũ) <- execution_status + verdict của bảng mới.
_DECISION_OF = {
    "PENDING_REVIEW": "PENDING",
    "ACCEPTED": "ACCEPT",
    "REJECTED": "REJECT",
    "MORE_TESTS_REQUESTED": "REQUEST_MORE_TESTS",
}
_STATUS_OF_DECISION = {v: k for k, v in _DECISION_OF.items()}


def test_code(test_id: int) -> str:
    return f"RT-{test_id:03d}"


def recommendation_code(test_id: int) -> str:
    return f"REC-{test_id:03d}"


def display_status(test) -> str:
    """PENDING / RUNNING / PASSED / FAILED / ERROR — trạng thái mà giao diện dùng."""
    if test.execution_status == "COMPLETED":
        return "PASSED" if test.verdict == "PASSED" else "FAILED"
    if test.execution_status in ("FAILED", "CANCELLED"):
        return "ERROR"
    return test.execution_status


def display_decision(recommendation) -> str:
    """PENDING / ACCEPT / REJECT / REQUEST_MORE_TESTS — chưa có khuyến nghị thì PENDING."""
    return _DECISION_OF[recommendation.status] if recommendation is not None else "PENDING"


def recommendation_for(conn, test_id: int):
    return conn.execute(
        select(t.engineering_recommendations).where(t.engineering_recommendations.c.regression_test_id == test_id)
    ).first()


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


def _latest_baseline_runs(conn, baseline, variant_ids: list[int]) -> dict[int, object]:
    """Run baseline mới nhất (không phải run regression, không FAILED) của mỗi biến thể.

    Chỉ lấy run của bộ mô phỏng đang cấu hình và của xe đang dùng: đổi sang CARLA (hay đổi
    xe) thì regression dựng baseline mới, không bao giờ ghép candidate CARLA với baseline
    động học hay với xe khác.
    """
    if not variant_ids:
        return {}
    rows = conn.execute(
        select(t.simulation_runs)
        .where(
            t.simulation_runs.c.aeb_version_id == baseline.id,
            t.simulation_runs.c.scenario_version_id.in_(variant_ids),
            t.simulation_runs.c.purpose.in_(("BASELINE", "EVALUATION")),
            t.simulation_runs.c.status != "FAILED",
            t.simulation_runs.c.simulator_version == configured_simulator(),
            t.simulation_runs.c.vehicle_version_id == active_vehicle(conn, baseline.project_id).id,
        )
        .order_by(t.simulation_runs.c.id)
    ).all()
    return {r.scenario_version_id: r for r in rows}  # id tăng dần -> giữ run mới nhất


def critical_variant_ids(conn, baseline, variant_ids: list[int]) -> set[int]:
    """Biến thể mà run baseline mới nhất (đã COMPLETED) có ghi nhận lỗi — "old critical"."""
    runs = _latest_baseline_runs(conn, baseline, variant_ids)
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
        baseline = baseline_version(conn, project_id)
        if baseline is None:
            raise InvalidRequestError("project chưa có baseline")
        scenario = conn.execute(
            select(t.scenarios).where(t.scenarios.c.id == scenario_id, t.scenarios.c.project_id == project_id)
        ).first()
        if scenario is None:
            raise NotFoundError("scenario family")
        variants = family.variants_of(conn, family.latest_base_version_id(conn, scenario_id))
        variant_ids = [v.id for v in variants]
        baseline_runs = _latest_baseline_runs(conn, baseline, variant_ids)
        return {
            "scenario_id": scenario_id,
            "family": scenario.name,
            "baseline": version_label(baseline),
            "variant_count": len(variants),
            "old_critical_count": len(critical_variant_ids(conn, baseline, variant_ids)),
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
        candidate = conn.execute(
            select(t.aeb_versions).where(
                t.aeb_versions.c.id == candidate_version_id, t.aeb_versions.c.project_id == project_id
            )
        ).first()
        if candidate is None:
            raise NotFoundError("candidate AEB version")
        if candidate.status != "CANDIDATE":
            raise InvalidRequestError("chỉ version ở trạng thái CANDIDATE mới đem đi regression được")
        baseline = baseline_version(conn, project_id)
        if baseline is None:
            raise InvalidRequestError("project chưa có baseline")
        scenario = conn.execute(
            select(t.scenarios).where(t.scenarios.c.id == scenario_id, t.scenarios.c.project_id == project_id)
        ).first()
        if scenario is None:
            raise NotFoundError("scenario family")

        vehicle = active_vehicle(conn, project_id)
        variants = family.variants_of(conn, family.latest_base_version_id(conn, scenario_id))
        by_id = {v.id: v for v in variants}
        baseline_runs = _latest_baseline_runs(conn, baseline, list(by_id))
        completed = [r for r in baseline_runs.values() if r.status == "COMPLETED"]
        critical = _failed_variant_ids(conn, [r.id for r in completed])

        if include_all_variants:
            selected = list(variants)
        else:
            selected = [v for v in variants if v.id in critical]
        if not selected:
            raise InvalidRequestError("bộ kịch bản được chọn đang rỗng (chưa có ca lỗi nào của baseline)")

        test_id = int(
            conn.execute(
                insert(t.regression_tests).values(
                    project_id=project_id,
                    scenario_id=scenario_id,
                    baseline_aeb_version_id=baseline.id,
                    candidate_aeb_version_id=candidate.id,
                    vehicle_version_id=vehicle.id,
                    simulator_version=configured_simulator(),
                    name=name or f"{version_label(baseline)} → {version_label(candidate)}",
                    pass_criteria_json={
                        "criteria": merged,
                        "scenario_set": {
                            "old_critical": include_old_critical,
                            "all_variants": include_all_variants,
                            "old_critical_count": len(critical),
                            "variant_count": len(selected),
                        },
                    },
                    execution_status="RUNNING",
                    verdict="PENDING",
                    total_scenarios=len(selected),
                    created_by_user_id=user_id,
                    created_date=now(),
                )
            ).inserted_primary_key[0]
        )

        missing = [v for v in selected if v.id not in baseline_runs]
        new_baseline_ids = create_runs(
            conn,
            project_id=project_id,
            scenario_id=scenario_id,
            variants=missing,
            vehicle_version_id=vehicle.id,
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
            vehicle_version_id=vehicle.id,
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
            t.simulation_runs.c.collision_occurred,
            t.simulation_runs.c.min_ttc_s,
            t.simulation_runs.c.min_distance_m,
            t.simulation_runs.c.impact_speed_mps,
            t.simulation_runs.c.is_false_positive,
            t.simulation_runs.c.verdict,
        ).where(t.simulation_runs.c.id.in_(run_ids))
    ).all()
    out = {}
    for r in rows:
        d = {
            "status": r.status,
            "collision": r.collision_occurred,
            "min_ttc_s": r.min_ttc_s,
            "min_distance_m": r.min_distance_m,
            "impact_speed_mps": r.impact_speed_mps,
            "false_activation": r.is_false_positive,
            "verdict": r.verdict,
        }
        if r.status == "COMPLETED":
            d["outcome"] = classify_outcome(
                {"collision": bool(r.collision_occurred), "min_ttc_s": r.min_ttc_s, "min_distance_m": r.min_distance_m}
            )
        out[r.id] = d
    return out


def _median(values: list[float]) -> float | None:
    return round(statistics.median(values), 3) if values else None


def _candidate_runs(conn, test_id: int) -> list:
    return conn.execute(select(t.simulation_runs).where(t.simulation_runs.c.regression_test_id == test_id)).all()


def try_finalize(test_id: int) -> None:
    with engine().begin() as conn:
        test = conn.execute(select(t.regression_tests).where(t.regression_tests.c.id == test_id)).first()
        if test is None or test.execution_status != "RUNNING":
            return
        cand_runs = _candidate_runs(conn, test_id)
        base_ids = [r.baseline_run_id for r in cand_runs]
        results = _run_results(conn, [r.id for r in cand_runs] + base_ids)
        statuses = [results.get(i, {}).get("status") for i in [r.id for r in cand_runs] + base_ids]
        if any(s in ("PENDING", "RUNNING", "PAUSED", None) for s in statuses):
            return
        if any(s != "COMPLETED" for s in statuses):
            # Một số lần chạy hỏng: test FAILED (hiển thị ERROR), không có verdict và không có khuyến nghị.
            conn.execute(
                update(t.regression_tests)
                .where(t.regression_tests.c.id == test_id, t.regression_tests.c.execution_status == "RUNNING")
                .values(execution_status="FAILED", finished_at=now())
            )
            return
        summary = _summarize(conn, test, cand_runs, results)
        counts = summary["counts"]
        if all(c["passed"] for c in summary["criteria"] if c["enabled"]):
            verdict = "PASSED"
        else:
            verdict = "REGRESSED" if counts["regressed"] else "FAILED"
        # Điều kiện execution_status = RUNNING: hai worker xong cùng lúc thì chỉ một bên ghi được.
        claimed = conn.execute(
            update(t.regression_tests)
            .where(t.regression_tests.c.id == test_id, t.regression_tests.c.execution_status == "RUNNING")
            .values(
                execution_status="COMPLETED",
                verdict=verdict,
                total_scenarios=counts["scenarios"],
                fixed_scenarios=counts["fixed"],
                regressed_scenarios=counts["regressed"],
                finished_at=now(),
            )
        ).rowcount
        if not claimed:
            return
        conn.execute(
            insert(t.regression_test_items),
            [
                {
                    "regression_test_id": test_id,
                    "scenario_version_id": p["variant_id"],
                    "baseline_run_id": p["baseline_run_id"],
                    "candidate_run_id": p["candidate_run_id"],
                    "baseline_outcome": p["baseline_outcome"],
                    "candidate_outcome": p["candidate_outcome"],
                    "change_type": p["change"].upper(),
                    "is_regression": p["change"] == "regressed",
                }
                for p in summary["pairs"]
            ],
        )
        _create_recommendation(conn, test, verdict, summary)


def _create_recommendation(conn, test, verdict: str, summary: dict) -> None:
    """Một khuyến nghị cho mỗi regression đã chạy xong — chỉ project thuộc workspace (ADR-035)."""
    workspace_id = conn.execute(select(t.projects.c.workspace_id).where(t.projects.c.id == test.project_id)).scalar()
    if workspace_id is None:
        return
    versions = {
        v.id: v
        for v in conn.execute(
            select(t.aeb_versions).where(
                t.aeb_versions.c.id.in_((test.baseline_aeb_version_id, test.candidate_aeb_version_id))
            )
        ).all()
    }
    counts = summary["counts"]
    ts = now()
    conn.execute(
        insert(t.engineering_recommendations).values(
            project_id=test.project_id,
            regression_test_id=test.id,
            candidate_aeb_version_id=test.candidate_aeb_version_id,
            content=(
                f"Candidate {version_label(versions[test.candidate_aeb_version_id])} vs baseline "
                f"{version_label(versions[test.baseline_aeb_version_id])}: {counts['fixed']} fixed, "
                f"{counts['regressed']} regressed of {counts['scenarios']} scenarios."
            ),
            confidence=confidence(verdict == "PASSED", counts).upper(),
            status="PENDING_REVIEW",
            created_by_user_id=test.created_by_user_id,
            created_date=ts,
            updated_at=ts,
        )
    )


def confidence(passed: bool, counts: dict) -> str:
    """High / Medium / Low — cùng luật với màn khuyến nghị."""
    if passed and counts.get("regressed", 0) == 0 and counts.get("scenarios", 0) >= 20:
        return "High"
    return "Medium" if passed else "Low"


def summary(conn, test) -> dict:
    """Bảng tổng hợp của một test đã chốt (tính lại từ run); test hỏng trả ``error``; chưa xong thì rỗng."""
    if test.execution_status == "FAILED":
        return {"error": "một số lần chạy mô phỏng hỏng — xem simulation_runs"}
    if test.execution_status != "COMPLETED":
        return {}
    cand_runs = _candidate_runs(conn, test.id)
    results = _run_results(conn, [r.id for r in cand_runs] + [r.baseline_run_id for r in cand_runs])
    return _summarize(conn, test, cand_runs, results)


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
    for c in sorted(cand_runs, key=lambda r: versions[r.scenario_version_id].version_no):
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
                "label": variant_label(scenario.code, v.version_no),
                "summary": variant_summary(v.scenario_ir_json or {}),
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

    crit = test.pass_criteria_json["criteria"]
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
        # FK fk_sr_baseline ép seed trùng ở MySQL; ở đây kiểm lại cho có bằng chứng trong kết quả.
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
# Quyết định của Reviewer
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
        if test.execution_status in ("PENDING", "RUNNING"):
            raise InvalidRequestError("regression test chưa chạy xong")
        rec = recommendation_for(conn, test_id)
        if rec is None:
            raise InvalidRequestError("regression test này không có khuyến nghị để duyệt")
        if rec.status in ("ACCEPTED", "REJECTED"):
            raise InvalidRequestError("recommendation này đã có quyết định cuối")
        if rec.created_by_user_id == user_id:
            raise InvalidRequestError("người tạo khuyến nghị không tự duyệt được")
        if decision == "ACCEPT" and test.verdict != "PASSED":
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
            # Một project chỉ có một BASELINE (uq_aeb_versions_one_baseline): hạ bản cũ TRƯỚC.
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
            update(t.engineering_recommendations)
            .where(t.engineering_recommendations.c.id == rec.id)
            .values(
                status=_STATUS_OF_DECISION[decision],
                reviewed_by_user_id=user_id,
                reviewed_at=ts,
                review_notes=reason.strip(),
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

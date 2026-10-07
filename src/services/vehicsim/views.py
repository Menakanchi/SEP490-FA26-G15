"""Mô hình đọc cho giao diện VehicSim — mỗi hàm trả đúng dữ liệu một màn Figma cần.

MVP chỉ có một project mặc định (``current_project``). Lọc theo thời tiết / kết quả
làm trong Python sau khi đọc: ở quy mô MVP (vài trăm lần chạy) như vậy đủ nhanh,
và tránh phải trích JSON bằng SQL khác nhau giữa MySQL và SQLite của test.

Dạng JSON trả về giữ như trước schema 29 bảng (ADR-036): trạng thái regression hiển thị
(PASSED / FAILED / ERROR) suy từ ``execution_status`` + ``verdict``, quyết định của Reviewer
lấy từ ``engineering_recommendations``.
"""

from __future__ import annotations

import math
from datetime import timedelta

from sqlalchemy import func, select

from src.services.auth.users import display_names
from src.services.vehicsim import regression, runs
from src.services.vehicsim import tables as t
from src.services.vehicsim.common import (
    TIME_LABELS,
    WEATHER_LABELS,
    NotFoundError,
    active_vehicle,
    aeb_parameter_catalog,
    aeb_values,
    baseline_version,
    engine,
    now,
    variant_label,
    variant_summary,
    vehicle_by_id,
    version_label,
)
from src.services.vehicsim.evaluation import OUTCOME_COLLISION, OUTCOME_NEAR_MISS, classify_outcome
from src.services.vehicsim.simulator import LANE_WIDTH_M

STAGE_ORDER = ("PERCEPTION", "DECISION", "CONTROL", "VEHICLE_DYNAMICS")
AEB_SYSTEM_NAME = "AEB"  # một hệ AEB mỗi project — không còn bảng aeb_systems


# ---------------------------------------------------------------------------
# Ngữ cảnh: workspace / project / xe / hệ thống AEB
# ---------------------------------------------------------------------------


def current_project(conn):
    row = conn.execute(
        select(t.projects).where(t.projects.c.status == "ACTIVE").order_by(t.projects.c.id).limit(1)
    ).first()
    if row is None:
        raise NotFoundError("project — chạy scripts/seed_vehicsim.py để tạo project mặc định")
    return row


def _versions(conn, project_id: int, *, newest_first: bool = False) -> list:
    order = t.aeb_versions.c.version_no.desc() if newest_first else t.aeb_versions.c.version_no
    return conn.execute(select(t.aeb_versions).where(t.aeb_versions.c.project_id == project_id).order_by(order)).all()


def context() -> dict:
    with engine().connect() as conn:
        project = current_project(conn)
        workspace = conn.execute(select(t.workspaces).where(t.workspaces.c.id == project.workspace_id)).first()
        vehicle = active_vehicle(conn, project.id)
        versions = _versions(conn, project.id)
        baseline = next((v for v in versions if v.status == "BASELINE"), None)
        families = conn.execute(
            select(t.scenarios).where(t.scenarios.c.project_id == project.id).order_by(t.scenarios.c.id)
        ).all()
        return {
            "project": {"id": project.id, "name": project.name},
            "workspace": {"id": workspace.id, "name": workspace.name} if workspace else None,
            "vehicle": {"id": vehicle.id, "name": vehicle.name},
            "system": {
                "id": project.id,
                "name": AEB_SYSTEM_NAME,
                "baseline": _version_brief(baseline) if baseline else None,
            },
            "versions": [_version_brief(v) for v in versions],
            "families": [{"id": f.id, "code": f.code, "name": f.name} for f in families],
            "parameters": [
                {k: p[k] for k in ("code", "name", "category", "unit", "min_value", "max_value", "default_value")}
                for p in aeb_parameter_catalog(conn)
            ],
        }


def _version_brief(v) -> dict:
    return {
        "id": v.id,
        "label": version_label(v),
        "version_number": v.version_no,
        "status": v.status,
        "source": v.source,
        "parent_version_id": v.parent_version_id,
        "notes": v.notes,
        "created_at": v.created_date.isoformat() if v.created_date else None,
    }


# ---------------------------------------------------------------------------
# Họ kịch bản + AEB versions (màn thiết lập tối thiểu)
# ---------------------------------------------------------------------------


def families() -> list[dict]:
    from src.services.vehicsim.family import latest_base_version_id, variants_of

    with engine().connect() as conn:
        project = current_project(conn)
        baseline = baseline_version(conn, project.id)
        out = []
        for f in conn.execute(select(t.scenarios).where(t.scenarios.c.project_id == project.id)).all():
            base_id = latest_base_version_id(conn, f.id)
            base = conn.execute(select(t.scenario_versions).where(t.scenario_versions.c.id == base_id)).first()
            variant_ids = [v.id for v in variants_of(conn, base_id)]
            run_stats = conn.execute(
                select(t.simulation_runs.c.status, func.count())
                .where(t.simulation_runs.c.scenario_id == f.id)
                .group_by(t.simulation_runs.c.status)
            ).all()
            # Đếm theo baseline hiện hành, không cộng lỗi của các run regression của candidate.
            failing = regression.critical_variant_ids(conn, baseline, variant_ids) if baseline else set()
            out.append(
                {
                    "id": f.id,
                    "code": f.code,
                    "name": f.name,
                    "description": f.description,
                    "variants": len(variant_ids),
                    "parameter_space": (base.scenario_ir_json or {}).get("parameter_space", {}),
                    "runs": {r[0]: int(r[1]) for r in run_stats},
                    "failures": len(failing),
                    "baseline": version_label(baseline) if baseline else None,
                    "created_at": f.created_date.isoformat(),
                }
            )
        return out


def aeb_versions() -> list[dict]:
    with engine().connect() as conn:
        project = current_project(conn)
        return [
            {**_version_brief(v), "parameters": aeb_values(conn, v.id)}
            for v in _versions(conn, project.id, newest_first=True)
        ]


# ---------------------------------------------------------------------------
# 01 · Failure Cases
# ---------------------------------------------------------------------------


def _outcome(collision, min_ttc_s, min_distance_m, false_activation) -> str:
    if false_activation:
        return "FALSE_BRAKING"
    return classify_outcome({"collision": bool(collision), "min_ttc_s": min_ttc_s, "min_distance_m": min_distance_m})


def _failure_rows(conn, project_id: int) -> list[dict]:
    """Mọi lần chạy có lỗi, kèm nguyên nhân chính — một dòng mỗi run."""
    primary = (
        select(
            t.root_causes.c.failure_id,
            t.root_causes.c.category,
            t.root_causes.c.cause_code,
            t.root_causes.c.description,
            t.root_causes.c.confidence,
        )
        .where(t.root_causes.c.is_primary.is_(True))
        .subquery()
    )
    runs_t = t.simulation_runs
    rows = conn.execute(
        select(
            t.failures.c.id.label("failure_id"),
            t.failures.c.failure_type,
            t.failures.c.severity,
            t.failures.c.description.label("failure_description"),
            t.failures.c.created_date,
            runs_t.c.id.label("run_id"),
            runs_t.c.purpose,
            runs_t.c.random_seed,
            runs_t.c.aeb_version_id,
            runs_t.c.run_config_json,
            runs_t.c.collision_occurred,
            runs_t.c.min_ttc_s,
            runs_t.c.min_distance_m,
            runs_t.c.impact_speed_mps,
            runs_t.c.is_false_positive,
            t.scenarios.c.id.label("scenario_id"),
            t.scenarios.c.code.label("scenario_code"),
            t.scenarios.c.name.label("scenario_name"),
            t.scenario_versions.c.version_no,
            t.aeb_versions.c.label.label("aeb_label"),
            t.aeb_versions.c.version_no.label("aeb_version_no"),
            primary.c.category.label("cause_category"),
            primary.c.cause_code,
            primary.c.description.label("cause_description"),
            primary.c.confidence,
        )
        .select_from(t.failures)
        .join(runs_t, runs_t.c.id == t.failures.c.simulation_run_id)
        .join(t.scenarios, t.scenarios.c.id == runs_t.c.scenario_id)
        .join(t.scenario_versions, t.scenario_versions.c.id == runs_t.c.scenario_version_id)
        .join(t.aeb_versions, t.aeb_versions.c.id == runs_t.c.aeb_version_id)
        .outerjoin(primary, primary.c.failure_id == t.failures.c.id)
        .where(runs_t.c.project_id == project_id)
        .order_by(runs_t.c.id.desc())
    ).all()
    out = []
    for r in rows:
        ir = r.run_config_json or {}
        out.append(
            {
                "run_id": r.run_id,
                "failure_id": r.failure_id,
                "failure_type": r.failure_type,
                "severity": r.severity,
                "outcome": _outcome(r.collision_occurred, r.min_ttc_s, r.min_distance_m, r.is_false_positive),
                "failure_class": r.cause_category,
                "cause_code": r.cause_code,
                "root_cause": r.cause_description or r.failure_description,
                "confidence": r.confidence,
                "impact_kmh": None if r.impact_speed_mps is None else round(float(r.impact_speed_mps) * 3.6, 1),
                "min_ttc_s": None if r.min_ttc_s is None else round(float(r.min_ttc_s), 2),
                "scenario_id": r.scenario_id,
                "family": r.scenario_name,
                "variant": variant_label(r.scenario_code, r.version_no),
                "summary": variant_summary(ir),
                "weather": ir.get("weather"),
                "time_of_day": ir.get("time_of_day"),
                "parameters": ir,
                "aeb_version_id": r.aeb_version_id,
                "config": r.aeb_label or f"v{r.aeb_version_no}",
                "purpose": r.purpose,
                "created_at": r.created_date.isoformat(),
            }
        )
    return out


def failure_list(
    *,
    scenario_id: int | None = None,
    failure_class: str | None = None,
    outcome: str | None = None,
    weather: str | None = None,
    aeb_version_id: int | None = None,
    days: int | None = None,
    page: int = 1,
    page_size: int = 20,
) -> dict:
    with engine().connect() as conn:
        project = current_project(conn)
        rows = _failure_rows(conn, project.id)

    scoped = [r for r in rows if aeb_version_id is None or r["aeb_version_id"] == aeb_version_id]
    if days:
        cutoff = (now() - timedelta(days=days)).isoformat()
        scoped = [r for r in scoped if r["created_at"] >= cutoff]

    week_ago = (now() - timedelta(days=7)).isoformat()
    by_class = {stage: 0 for stage in STAGE_ORDER}
    for r in scoped:
        if r["failure_class"] in by_class:
            by_class[r["failure_class"]] += 1
    kpis = {
        "total": len(scoped),
        "this_week": sum(1 for r in scoped if r["created_at"] >= week_ago),
        "collisions": sum(1 for r in scoped if r["outcome"] == OUTCOME_COLLISION),
        "near_misses": sum(1 for r in scoped if r["outcome"] == OUTCOME_NEAR_MISS),
        "false_braking": sum(1 for r in scoped if r["outcome"] == "FALSE_BRAKING"),
        "by_class": by_class,
    }
    family_counts: dict[int, dict] = {}
    for r in scoped:
        f = family_counts.setdefault(r["scenario_id"], {"id": r["scenario_id"], "name": r["family"], "failures": 0})
        f["failures"] += 1

    filtered = [
        r
        for r in scoped
        if (scenario_id is None or r["scenario_id"] == scenario_id)
        and (failure_class is None or r["failure_class"] == failure_class)
        and (outcome is None or r["outcome"] == outcome)
        and (weather is None or r["weather"] == weather)
    ]
    page = max(1, page)
    start = (page - 1) * page_size
    return {
        "kpis": kpis,
        "families": sorted(family_counts.values(), key=lambda f: -f["failures"]),
        "total": len(filtered),
        "page": page,
        "page_size": page_size,
        "pages": max(1, math.ceil(len(filtered) / page_size)),
        "items": filtered[start : start + page_size],
    }


# ---------------------------------------------------------------------------
# 02 · Failure detail + 06 · Playback
# ---------------------------------------------------------------------------


def _run_bundle(conn, project_id: int, run_id: int) -> dict:
    run = conn.execute(
        select(t.simulation_runs).where(t.simulation_runs.c.id == run_id, t.simulation_runs.c.project_id == project_id)
    ).first()
    if run is None:
        raise NotFoundError("simulation run")
    if run.status != "COMPLETED":
        raise NotFoundError("kết quả mô phỏng (run chưa chạy xong)")
    scenario = conn.execute(select(t.scenarios).where(t.scenarios.c.id == run.scenario_id)).first()
    variant = conn.execute(
        select(t.scenario_versions).where(t.scenario_versions.c.id == run.scenario_version_id)
    ).first()
    version = conn.execute(select(t.aeb_versions).where(t.aeb_versions.c.id == run.aeb_version_id)).first()
    failure = conn.execute(select(t.failures).where(t.failures.c.simulation_run_id == run_id)).first()
    return {
        "run": run,
        "scenario": scenario,
        "variant": variant,
        "version": version,
        "vehicle": vehicle_by_id(conn, run.vehicle_version_id),
        "failure": failure,
        "raw": run.telemetry_json or {},
    }


def _header(b: dict) -> dict:
    run, raw = b["run"], b["raw"]
    ir = run.run_config_json or {}
    outcome = raw.get("outcome") or classify_outcome(
        {"collision": bool(run.collision_occurred), "min_ttc_s": run.min_ttc_s, "min_distance_m": run.min_distance_m}
    )
    primary = next((s for s in raw.get("chain", []) if not s["passed"]), None)
    return {
        "run_id": run.id,
        "purpose": run.purpose,
        "status": run.status,
        "seed": run.random_seed,
        "family": b["scenario"].name,
        "scenario_id": b["scenario"].id,
        "variant": variant_label(b["scenario"].code, b["variant"].version_no),
        "variant_id": b["variant"].id,
        "summary": variant_summary(ir),
        "vehicle": b["vehicle"].name,
        "config": version_label(b["version"]),
        "aeb_version_id": b["version"].id,
        "simulator": run.simulator_version,
        "date": run.queued_at.isoformat(),
        "outcome": "FALSE_BRAKING" if run.is_false_positive else outcome,
        "verdict": run.verdict,
        "failure_type": b["failure"].failure_type if b["failure"] else None,
        "failure_class": primary["stage"] if primary else None,
        "headline": raw.get("headline", ""),
    }


def failure_detail(run_id: int) -> dict:
    with engine().connect() as conn:
        project = current_project(conn)
        b = _run_bundle(conn, project.id, run_id)
        params = aeb_values(conn, b["run"].aeb_version_id)
        catalog = aeb_parameter_catalog(conn)
        similar = _similar_failures(conn, project.id, b)
    raw, run = b["raw"], b["run"]
    m = raw.get("metrics", {})
    ir = run.run_config_json or {}
    case = raw.get("case", {})
    root_confidence = next((s["confidence"] for s in raw.get("chain", []) if not s["passed"]), None)

    telemetry = [
        {
            "t": f["t"],
            "ttc": f["ttc"] if f["ttc"] is not None else f["ttc_gt"],
            "speed_kmh": round(f["ego_v"] * 3.6, 2),
        }
        for f in raw.get("frames", [])
    ]
    return {
        **_header(b),
        "metrics": {
            "impact_speed_kmh": None if run.impact_speed_mps is None else round(float(run.impact_speed_mps) * 3.6, 1),
            "min_distance_m": run.min_distance_m,
            "min_ttc_s": run.min_ttc_s,
            "first_detection_t": run.first_detection_time_s,
            "first_detection_distance_m": run.first_detection_distance_m,
            "aeb_activation_t": run.aeb_activation_time_s,
            "aeb_activation_ttc_s": m.get("aeb_decision_ttc_s"),
            "fcw_t": run.fcw_time_s,
            "brake_onset_t": m.get("brake_onset_t"),
            "max_deceleration_mps2": run.max_deceleration_mps2,
            "stopping_distance_m": run.stopping_distance_m,
            "false_activation": bool(run.is_false_positive),
            "missed_activation": bool(run.is_false_negative),
        },
        "chain": raw.get("chain", []),
        "chain_confidence": root_confidence,
        "configuration": [
            {"code": p["code"], "name": p["name"], "unit": p["unit"], "value": params.get(p["code"])} for p in catalog
        ],
        "environment": {
            "ego_speed_kmh": ir.get("ego_speed_kmh"),
            "trigger_distance_m": ir.get("trigger_distance_m"),
            "pedestrian_speed_mps": ir.get("pedestrian_speed_mps"),
            "stops_at_curb": ir.get("stops_at_curb"),
            "weather": WEATHER_LABELS.get(ir.get("weather", ""), ir.get("weather")),
            "time_of_day": TIME_LABELS.get(ir.get("time_of_day", ""), ir.get("time_of_day")),
            "road_friction": case.get("road_friction"),
        },
        "ttc_threshold_s": params.get("TTC_THRESHOLD"),
        "telemetry": telemetry,
        "events": raw.get("events", []),
        "scene": _scene(raw, b["vehicle"]),
        "similar": similar,
    }


def _scene(raw: dict, vehicle) -> dict:
    frames = raw.get("frames", [])
    return {
        "crossing_x": raw.get("crossing_x"),
        "lane_width_m": LANE_WIDTH_M,
        "vehicle_length_m": float(vehicle.length_m),
        "vehicle_width_m": float(vehicle.width_m),
        "path": [{"t": f["t"], "x": f["ego_x"], "ped_y": f["ped_y"]} for f in frames[:: max(1, len(frames) // 60)]],
        "end": frames[-1] if frames else None,
    }


def _similar_failures(conn, project_id: int, b: dict, limit: int = 3) -> list[dict]:
    """Ca lỗi gần nhất theo tham số kịch bản, cùng nhóm nguyên nhân chính nếu có."""
    me = b["run"].run_config_json or {}
    my_class = next((s["stage"] for s in b["raw"].get("chain", []) if not s["passed"]), None)
    scored = []
    for r in _failure_rows(conn, project_id):
        if r["run_id"] == b["run"].id:
            continue
        ir = r["parameters"] or {}
        distance = (
            abs((ir.get("ego_speed_kmh", 0) - me.get("ego_speed_kmh", 0)) / 40)
            + abs((ir.get("trigger_distance_m", 0) - me.get("trigger_distance_m", 0)) / 30)
            + abs((ir.get("pedestrian_speed_mps", 0) - me.get("pedestrian_speed_mps", 0)) / 4)
            + (0 if ir.get("weather") == me.get("weather") else 0.5)
            + (0 if ir.get("time_of_day") == me.get("time_of_day") else 0.5)
            + (0 if r["failure_class"] == my_class else 0.5)
        )
        scored.append((distance, r))
    scored.sort(key=lambda x: x[0])
    return [
        {
            "run_id": r["run_id"],
            "variant": r["variant"],
            "summary": r["summary"],
            "similarity_pct": max(0, round(100 * (1 - d / 3.5))),
        }
        for d, r in scored[:limit]
    ]


def _related_runs(conn, run) -> list[dict]:
    """Các lần chạy khác đã xong của CÙNG biến thể — để so sánh giữa các AEB version."""
    runs_t = t.simulation_runs
    rows = conn.execute(
        select(
            runs_t.c.id,
            runs_t.c.purpose,
            runs_t.c.collision_occurred,
            runs_t.c.min_ttc_s,
            runs_t.c.min_distance_m,
            runs_t.c.is_false_positive,
            t.aeb_versions.c.label,
            t.aeb_versions.c.version_no,
        )
        .join(t.aeb_versions, t.aeb_versions.c.id == runs_t.c.aeb_version_id)
        .where(
            runs_t.c.scenario_version_id == run.scenario_version_id,
            runs_t.c.id != run.id,
            runs_t.c.status == "COMPLETED",
        )
        .order_by(runs_t.c.id.desc())
    ).all()
    return [
        {
            "run_id": r.id,
            "config": r.label or f"v{r.version_no}",
            "purpose": r.purpose,
            "outcome": _outcome(r.collision_occurred, r.min_ttc_s, r.min_distance_m, r.is_false_positive),
        }
        for r in rows
    ]


def run_variant_bundle(run_id: int) -> dict:
    """JSON của nút "Tải JSON chạy CARLA" — đúng đầu vào backend đưa cho bộ mô phỏng (ADR-027)."""
    with engine().connect() as conn:
        project = current_project(conn)
        run = conn.execute(
            select(t.simulation_runs).where(
                t.simulation_runs.c.id == run_id, t.simulation_runs.c.project_id == project.id
            )
        ).first()
        if run is None:
            raise NotFoundError("simulation run")
        doc = runs.bundle_for_run(conn, run)
        scenario = conn.execute(select(t.scenarios).where(t.scenarios.c.id == run.scenario_id)).first()
        variant = conn.execute(
            select(t.scenario_versions).where(t.scenario_versions.c.id == run.scenario_version_id)
        ).first()
    doc["source"].update(
        family=scenario.name,
        variant=variant_label(scenario.code, variant.version_no),
        exported_at=now().isoformat(timespec="seconds"),
    )
    return doc


def playback(run_id: int) -> dict:
    with engine().connect() as conn:
        project = current_project(conn)
        b = _run_bundle(conn, project.id, run_id)
        related = _related_runs(conn, b["run"])
    raw = b["raw"]
    return {
        **_header(b),
        "related_runs": related,
        "duration_s": float(b["run"].simulated_duration_s or 0),
        "frames": raw.get("frames", []),
        "events": raw.get("events", []),
        "crossing_x": raw.get("crossing_x"),
        "lane_width_m": LANE_WIDTH_M,
        "vehicle_length_m": float(b["vehicle"].length_m),
        "vehicle_width_m": float(b["vehicle"].width_m),
        "ttc_threshold_s": raw.get("params", {}).get("ttc_threshold"),
        "ego_speed_kmh": (b["run"].run_config_json or {}).get("ego_speed_kmh"),
    }


# ---------------------------------------------------------------------------
# 16 · Regression list · 04 · Regression results
# ---------------------------------------------------------------------------


def _progress(conn, test_id: int) -> dict:
    rows = conn.execute(
        select(t.simulation_runs.c.status, func.count())
        .where(t.simulation_runs.c.regression_test_id == test_id)
        .group_by(t.simulation_runs.c.status)
    ).all()
    counts = {r[0]: int(r[1]) for r in rows}
    return {"done": counts.get("COMPLETED", 0) + counts.get("FAILED", 0), "total": sum(counts.values())}


def _recommendations_by_test(conn, test_ids: list[int]) -> dict[int, object]:
    if not test_ids:
        return {}
    rows = conn.execute(
        select(t.engineering_recommendations).where(t.engineering_recommendations.c.regression_test_id.in_(test_ids))
    ).all()
    return {r.regression_test_id: r for r in rows}


def regression_list(status: str | None = None) -> dict:
    with engine().connect() as conn:
        project = current_project(conn)
        tests = conn.execute(
            select(t.regression_tests)
            .where(t.regression_tests.c.project_id == project.id)
            .order_by(t.regression_tests.c.id.desc())
        ).all()
        versions = {v.id: v for v in _versions(conn, project.id)}
        recs = _recommendations_by_test(conn, [x.id for x in tests])
        names = display_names(conn, {x.created_by_user_id for x in tests})
        items = []
        for x in tests:
            done = x.execution_status == "COMPLETED"
            items.append(
                {
                    "id": x.id,
                    "code": regression.test_code(x.id),
                    "name": x.name,
                    "baseline": version_label(versions[x.baseline_aeb_version_id]),
                    "candidate": version_label(versions[x.candidate_aeb_version_id]),
                    "candidate_version_id": x.candidate_aeb_version_id,
                    "status": regression.display_status(x),
                    "review_decision": regression.display_decision(recs.get(x.id)),
                    "scenarios": (x.pass_criteria_json or {}).get("scenario_set", {}).get("variant_count"),
                    "progress": _progress(conn, x.id),
                    "fixed": x.fixed_scenarios if done else None,
                    "regressed": x.regressed_scenarios if done else None,
                    "created_by": names.get(x.created_by_user_id),
                    "created_at": x.created_date.isoformat(),
                }
            )
    filtered = [i for i in items if status is None or i["status"] == status]
    running = next((i for i in items if i["status"] == "RUNNING"), None)
    return {
        "kpis": {
            "total": len(items),
            "passed": sum(1 for i in items if i["status"] == "PASSED"),
            "failed": sum(1 for i in items if i["status"] == "FAILED"),
            "running": sum(1 for i in items if i["status"] == "RUNNING"),
            "running_progress": running and {"code": running["code"], **running["progress"]},
            "since": items[-1]["created_at"] if items else None,
        },
        "items": filtered,
    }


KEY_PARAMS = ("TTC_THRESHOLD", "BRAKE_ACTIVATION_DELAY", "DETECTION_CONFIDENCE_THRESHOLD", "MAX_DECELERATION")


def _test(conn, project_id: int, test_id: int):
    test = conn.execute(
        select(t.regression_tests).where(
            t.regression_tests.c.id == test_id, t.regression_tests.c.project_id == project_id
        )
    ).first()
    if test is None:
        raise NotFoundError("regression test")
    return test


def regression_detail(test_id: int) -> dict:
    with engine().connect() as conn:
        project = current_project(conn)
        test = _test(conn, project.id, test_id)
        baseline = conn.execute(
            select(t.aeb_versions).where(t.aeb_versions.c.id == test.baseline_aeb_version_id)
        ).first()
        candidate = conn.execute(
            select(t.aeb_versions).where(t.aeb_versions.c.id == test.candidate_aeb_version_id)
        ).first()
        diff = regression.parameter_diff(conn, baseline.id, candidate.id)
        scenario = conn.execute(select(t.scenarios).where(t.scenarios.c.id == test.scenario_id)).first()
        names = display_names(conn, {test.created_by_user_id})
        progress = _progress(conn, test.id)
        rec = regression.recommendation_for(conn, test.id)
        summary = regression.summary(conn, test)
    by_code = {d["code"]: d for d in diff}
    return {
        "id": test.id,
        "code": regression.test_code(test.id),
        "recommendation_code": regression.recommendation_code(test.id),
        "name": test.name,
        "status": regression.display_status(test),
        "review_decision": regression.display_decision(rec),
        "family": scenario.name,
        "scenario_id": scenario.id,
        "baseline": {"id": baseline.id, "label": version_label(baseline), "status": baseline.status},
        "candidate": {"id": candidate.id, "label": version_label(candidate), "status": candidate.status},
        "key_parameters": [
            {k: by_code[c][k] for k in ("code", "name", "unit", "baseline", "candidate", "changed")}
            for c in KEY_PARAMS
            if c in by_code
        ],
        "parameter_diff": diff,
        "pass_criteria": test.pass_criteria_json,
        "simulator": test.simulator_version,
        "progress": progress,
        "created_by": names.get(test.created_by_user_id),
        "created_at": test.created_date.isoformat(),
        "summary": summary,
    }


# ---------------------------------------------------------------------------
# 17 · Recommendation · 18 · Review
# ---------------------------------------------------------------------------

REVIEW_LABELS = {
    "PENDING": "Awaiting review",
    "ACCEPT": "Accepted",
    "REJECT": "Rejected",
    "REQUEST_MORE_TESTS": "More tests requested",
}


def _recommendation_status(test, rec) -> str:
    if regression.display_status(test) == "FAILED":
        return "BLOCKED"
    return regression.display_decision(rec)


def recommendations() -> list[dict]:
    with engine().connect() as conn:
        project = current_project(conn)
        tests = conn.execute(
            select(t.regression_tests)
            .where(t.regression_tests.c.project_id == project.id, t.regression_tests.c.execution_status == "COMPLETED")
            .order_by(t.regression_tests.c.id.desc())
        ).all()
        versions = {v.id: v for v in _versions(conn, project.id)}
        recs = _recommendations_by_test(conn, [x.id for x in tests])
        summaries = {x.id: regression.summary(conn, x) for x in tests}
    return [
        {
            "id": x.id,
            "code": regression.recommendation_code(x.id),
            "regression_code": regression.test_code(x.id),
            "baseline": version_label(versions[x.baseline_aeb_version_id]),
            "candidate": version_label(versions[x.candidate_aeb_version_id]),
            "status": _recommendation_status(x, recs.get(x.id)),
            "rates": summaries[x.id].get("rates", {}),
            "counts": summaries[x.id].get("counts", {}),
            "created_at": (recs[x.id].updated_at if x.id in recs else x.finished_at or x.created_date).isoformat(),
        }
        for x in tests
    ]


def recommendation_detail(test_id: int) -> dict:
    detail = regression_detail(test_id)
    with engine().connect() as conn:
        project = current_project(conn)
        test = _test(conn, project.id, test_id)
        rec = regression.recommendation_for(conn, test_id)
        names = display_names(conn, {test.created_by_user_id, rec.reviewed_by_user_id if rec else None})
    summary = detail["summary"] or {}
    rates = summary.get("rates", {})
    counts = summary.get("counts", {})
    ttc = summary.get("median_min_ttc", {})
    changed = [d for d in detail["parameter_diff"] if d["changed"]]

    tradeoffs = []
    if rates and rates.get("false_activation_candidate_pct", 0) > rates.get("false_activation_baseline_pct", 0):
        tradeoffs.append(
            f"False activation rises from {rates['false_activation_baseline_pct']:.1f}% to "
            f"{rates['false_activation_candidate_pct']:.1f}% (pedestrians who stop at the curb)."
        )
    if counts.get("regressed"):
        tradeoffs.append(f"{counts['regressed']} scenario(s) get worse than on the baseline.")
    if rates and rates.get("collision_candidate_pct", 0) > 0:
        tradeoffs.append(
            f"{rates['collision_candidate_pct']:.1f}% of scenarios still end in a collision — mostly late dart-outs "
            "that no threshold can stop in time."
        )

    passed = detail["status"] == "PASSED"
    regressions = counts.get("regressed", 0)
    status = _recommendation_status(test, rec)
    decision = regression.display_decision(rec)
    return {
        **detail,
        "recommendation_status": status,
        "recommendation_status_label": "Blocked" if status == "BLOCKED" else REVIEW_LABELS[decision],
        "changed_parameters": changed,
        "expected_effect": {
            "collision_rate": [rates.get("collision_baseline_pct"), rates.get("collision_candidate_pct")],
            "false_activation": [
                rates.get("false_activation_baseline_pct"),
                rates.get("false_activation_candidate_pct"),
            ],
            "median_min_ttc": [ttc.get("baseline"), ttc.get("candidate")],
            "fixed": counts.get("fixed"),
            "regressed": regressions,
        },
        "tradeoffs": tradeoffs,
        "confidence": regression.confidence(passed, counts),
        "evidence": [
            {
                "key": "regression",
                "title": f"Regression {detail['code']}",
                "status": "PASS" if passed else "FAIL",
                "detail": f"{regressions} regressions · {counts.get('fixed', 0)} fixed",
            },
            # FE-13 chưa làm: nói rõ là chưa chạy, không vẽ tick xanh giả.
            {
                "key": "robustness",
                "title": "Robustness validation",
                "status": "NOT_RUN",
                "detail": "FE-13 — not run yet",
            },
            {"key": "pareto", "title": "Pareto front", "status": "NOT_RUN", "detail": "FE-13 — not run yet"},
            {
                "key": "sensitivity",
                "title": "Sensitivity analysis",
                "status": "NOT_RUN",
                "detail": "FE-12 — not run yet",
            },
        ],
        "review": {
            "decision": decision,
            "reviewed_by": names.get(rec.reviewed_by_user_id) if rec else None,
            "reviewed_at": rec.reviewed_at.isoformat() if rec and rec.reviewed_at else None,
            "note": rec.review_notes if rec else None,
            "conditions": rec.review_conditions if rec else None,
            "requested_by": names.get(test.created_by_user_id),
        },
    }

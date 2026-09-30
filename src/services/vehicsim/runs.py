"""Lần chạy mô phỏng: xếp hàng, thực thi, ghi kết quả (FE-08/09/11/12).

Một ``simulation_runs`` = một biến thể × một AEB version × một seed. Thực thi:
simulator động học (thay CARLA cho MVP) -> ``evaluation`` -> ghi
``simulation_results`` + ``aeb_results`` + ``collision_events`` + ``failures`` +
``root_causes`` trong **một** transaction, rồi báo cho regression (nếu run thuộc
một regression test) để nó tự chốt khi đủ cặp.
"""

from __future__ import annotations

import logging
import socket

from sqlalchemy import insert, select, update

from src.config import get_settings
from src.services.vehicsim import tables as t
from src.services.vehicsim.common import NotFoundError, aeb_values, engine, now
from src.services.vehicsim.evaluation import evaluate
from src.services.vehicsim.simulator import DT, MAX_DURATION_S, AebParams, PedestrianCrossingCase, VehicleSpec, simulate

logger = logging.getLogger(__name__)

SIMULATOR_NAME = "vehicsim-kinematic-1.0"  # ghi vào carla_version để phân biệt với CARLA thật


def seed_for(scenario_version_id: int) -> int:
    """Seed ổn định theo biến thể: chạy lại cùng biến thể luôn cùng nhiễu perception."""
    return 48_000 + int(scenario_version_id)


def _run_row(conn, run_id: int):
    row = conn.execute(select(t.simulation_runs).where(t.simulation_runs.c.id == run_id)).first()
    if row is None:
        raise NotFoundError("simulation run")
    return row


def create_runs(
    conn,
    *,
    project_id: int,
    scenario_id: int,
    variants: list,
    vehicle_id: int,
    aeb_system_id: int,
    aeb_version_id: int,
    user_id: int,
    purpose: str = "BASELINE",
    regression_test_id: int | None = None,
    baseline_runs: dict[int, object] | None = None,
) -> list[int]:
    """Tạo các dòng ``simulation_runs`` (QUEUED). Chưa dispatch — người gọi dispatch sau commit.

    Với REGRESSION, ``baseline_runs`` = ``{scenario_version_id: run baseline}``: run mới
    chép đúng seed của run baseline (FK ``fk_sr_baseline_run`` ép điều này ở MySQL).
    """
    ts = now()
    ids: list[int] = []
    for variant in variants:
        baseline = (baseline_runs or {}).get(variant.id)
        seed = baseline.random_seed if baseline is not None else seed_for(variant.id)
        run_id = conn.execute(
            insert(t.simulation_runs).values(
                project_id=project_id,
                scenario_id=scenario_id,
                scenario_version_id=variant.id,
                vehicle_id=vehicle_id,
                aeb_system_id=aeb_system_id,
                aeb_version_id=aeb_version_id,
                regression_test_id=regression_test_id,
                baseline_run_id=baseline.id if baseline is not None else None,
                purpose=purpose,
                random_seed=seed,
                status="QUEUED",
                carla_version=SIMULATOR_NAME,
                fixed_delta_seconds=DT,
                max_duration_s=MAX_DURATION_S,
                run_config=variant.scenario_ir,
                requested_by=user_id,
                queued_at=ts,
                created_at=ts,
                updated_at=ts,
            )
        ).inserted_primary_key[0]
        ids.append(int(run_id))
    return ids


def dispatch(run_ids: list[int]) -> None:
    """Đẩy run vào hàng đợi Celery, hoặc chạy ngay khi ``VEHICSIM_RUN_MODE=inline``."""
    if not run_ids:
        return
    if get_settings().vehicsim_run_mode == "inline":
        for run_id in run_ids:
            execute_run(run_id)
        return
    from src.celery_app import run_simulation

    for run_id in run_ids:
        run_simulation.delay(run_id)


def execute_run(run_id: int) -> None:
    """Chạy một run. Idempotent: run đã COMPLETED thì bỏ qua (Celery có thể giao lại)."""
    with engine().begin() as conn:
        run = _run_row(conn, run_id)
        if run.status == "COMPLETED":
            return
        conn.execute(
            update(t.simulation_runs)
            .where(t.simulation_runs.c.id == run_id)
            .values(status="RUNNING", started_at=now(), updated_at=now(), worker_host=socket.gethostname()[:150])
        )

    try:
        with engine().connect() as conn:
            run = _run_row(conn, run_id)
            params = AebParams.from_codes(aeb_values(conn, run.aeb_version_id))
            vehicle_row = conn.execute(select(t.vehicles).where(t.vehicles.c.id == run.vehicle_id)).first()
            env = conn.execute(
                select(t.scenario_environments).where(
                    t.scenario_environments.c.scenario_version_id == run.scenario_version_id
                )
            ).first()
        ir = run.run_config or {}
        case = PedestrianCrossingCase(
            ego_speed_kmh=float(ir["ego_speed_kmh"]),
            trigger_distance_m=float(ir["trigger_distance_m"]),
            pedestrian_speed_mps=float(ir["pedestrian_speed_mps"]),
            stops_at_curb=bool(ir.get("stops_at_curb", False)),
            weather=ir.get("weather", "CLEAR"),
            time_of_day=ir.get("time_of_day", "DAY"),
            friction=float(env.friction) if env is not None else None,
        )
        vehicle = VehicleSpec(
            length_m=float(vehicle_row.length_m),
            width_m=float(vehicle_row.width_m),
            max_brake_decel_mps2=float(vehicle_row.max_brake_decel_mps2),
        )
        outcome = simulate(case, params, seed=int(run.random_seed), vehicle=vehicle)
        result = evaluate(outcome, params)
        _persist(run_id, outcome, result)
    except Exception as exc:
        logger.exception("simulation run %s failed", run_id)
        with engine().begin() as conn:
            conn.execute(
                update(t.simulation_runs)
                .where(t.simulation_runs.c.id == run_id)
                .values(status="FAILED", error_message=str(exc)[:2000], finished_at=now(), updated_at=now())
            )
    # Regression tự chốt khi mọi cặp đã xong — kể cả khi run này hỏng (test sẽ ra ERROR).
    from src.services.vehicsim import regression

    regression.on_run_finished(run_id)


def _persist(run_id: int, outcome, result) -> None:
    ts = now()
    raw = {
        "frames": outcome.frames,
        "events": outcome.events,
        "metrics": outcome.metrics,
        "crossing_x": outcome.crossing_x,
        "case": outcome.case,
        "params": outcome.params,
        "outcome": result.outcome,
        "headline": result.headline,
        "chain": [
            {
                "stage": s.stage,
                "passed": s.passed,
                "summary": s.summary,
                "cause_code": s.cause_code,
                "parameter_code": s.parameter_code,
                "confidence": s.confidence,
            }
            for s in result.chain
        ],
    }
    m = outcome.metrics
    with engine().begin() as conn:
        sim_result_id = conn.execute(
            insert(t.simulation_results).values(
                simulation_run_id=run_id,
                end_reason=outcome.end_reason,
                simulated_duration_s=outcome.duration_s,
                total_frames=len(outcome.frames),
                ego_final_speed_mps=m["ego_final_speed_mps"],
                ego_distance_m=m["ego_distance_m"],
                raw_metrics=raw,
                created_at=ts,
            )
        ).inserted_primary_key[0]
        aeb_result_id = conn.execute(
            insert(t.aeb_results).values(simulation_result_id=sim_result_id, evaluated_at=ts, **result.aeb_result)
        ).inserted_primary_key[0]

        if m["collision"]:
            pedestrian = conn.execute(
                select(t.scenario_objects.c.id)
                .join(
                    t.simulation_runs,
                    t.simulation_runs.c.scenario_version_id == t.scenario_objects.c.scenario_version_id,
                )
                .where(t.simulation_runs.c.id == run_id, t.scenario_objects.c.role == "TARGET")
            ).scalar()
            collision = next((e for e in outcome.events if e["kind"] == "collision"), None)
            conn.execute(
                insert(t.collision_events).values(
                    aeb_result_id=aeb_result_id,
                    event_index=1,
                    target_object_id=pedestrian,
                    timestamp_s=collision["t"] if collision else outcome.duration_s,
                    impact_speed_mps=m["impact_speed_mps"] or 0.0,
                    relative_speed_mps=m["impact_speed_mps"],
                    distance_at_trigger_m=None,
                    collision_type="FRONT",
                    impact_x_m=outcome.crossing_x,
                    impact_y_m=outcome.frames[-1]["ped_y"] if outcome.frames else None,
                    created_at=ts,
                )
            )

        if result.failure is not None:
            failure_id = conn.execute(
                insert(t.failures).values(
                    simulation_run_id=run_id,
                    aeb_result_id=aeb_result_id,
                    detected_by="AUTO",
                    created_at=ts,
                    **result.failure,
                )
            ).inserted_primary_key[0]
            param_ids = {
                r.code: r.id for r in conn.execute(select(t.aeb_parameters.c.id, t.aeb_parameters.c.code)).all()
            }
            primary = result.primary_stage
            for stage in result.chain:
                if stage.passed or stage.cause_code is None:
                    continue
                conn.execute(
                    insert(t.root_causes).values(
                        failure_id=failure_id,
                        cause_category=stage.stage,
                        cause_code=stage.cause_code,
                        related_aeb_parameter_id=param_ids.get(stage.parameter_code or ""),
                        description=stage.summary,
                        confidence=stage.confidence,
                        is_primary=stage is primary,
                        analysis_method="RULE_BASED",
                        created_at=ts,
                    )
                )

        conn.execute(
            update(t.simulation_runs)
            .where(t.simulation_runs.c.id == run_id)
            .values(status="COMPLETED", finished_at=ts, updated_at=ts, error_message=None)
        )


def run_family(*, project_id: int, scenario_id: int, user_id: int, aeb_version_id: int | None = None) -> list[int]:
    """Chạy mọi biến thể của bộ biến thể hiện hành bằng AEB version (mặc định: baseline)."""
    from src.services.vehicsim import family

    with engine().begin() as conn:
        scenario = conn.execute(
            select(t.scenarios).where(t.scenarios.c.id == scenario_id, t.scenarios.c.project_id == project_id)
        ).first()
        if scenario is None:
            raise NotFoundError("scenario family")
        system = conn.execute(select(t.aeb_systems).where(t.aeb_systems.c.project_id == project_id)).first()
        if system is None:
            raise NotFoundError("AEB system")
        version_q = select(t.aeb_versions).where(t.aeb_versions.c.aeb_system_id == system.id)
        version_q = (
            version_q.where(t.aeb_versions.c.id == aeb_version_id)
            if aeb_version_id is not None
            else version_q.where(t.aeb_versions.c.status == "BASELINE")
        )
        version = conn.execute(version_q).first()
        if version is None:
            raise NotFoundError("AEB version")
        variants = family.variants_of(conn, family.latest_base_version_id(conn, scenario_id))
        ids = create_runs(
            conn,
            project_id=project_id,
            scenario_id=scenario_id,
            variants=variants,
            vehicle_id=system.vehicle_id,
            aeb_system_id=system.id,
            aeb_version_id=version.id,
            user_id=user_id,
            purpose="BASELINE" if version.status == "BASELINE" else "MANUAL",
        )
    dispatch(ids)
    return ids

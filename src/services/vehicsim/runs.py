"""Lần chạy mô phỏng: xếp hàng, thực thi, ghi kết quả (FE-08/09/11/12).

Một ``simulation_runs`` = một biến thể × một AEB version × một seed × một bộ mô
phỏng. Thực thi: dựng ``RunSpec`` (``spec_for_run`` — cũng là thứ nút "Tải JSON
chạy CARLA" xuất ra) -> bộ mô phỏng -> ``evaluation`` -> ghi ``simulation_results``
+ ``aeb_results`` + ``collision_events`` + ``failures`` + ``root_causes`` trong
**một** transaction, rồi báo cho regression (nếu run thuộc một regression test)
để nó tự chốt khi đủ cặp.

Hai bộ mô phỏng cắm vào cùng hợp đồng (ADR-027), phân biệt bằng
``simulation_runs.carla_version``:

- ``vehicsim-kinematic-1.0``: chạy ngay trong process (dưới 1 giây/run).
- ``carla-<phiên bản server>``: gọi ``VEHICSIM_CARLA_COMMAND`` (thường là
  ``worker/run_variant.py``) như **tiến trình con có timeout** — CARLA treo thì chỉ
  run đó FAILED, worker vẫn sống. Mỗi run có thư mục riêng
  ``VEHICSIM_DATA_ROOT/runs/<run_id>/`` chứa bundle.json, result.json, video.
"""

from __future__ import annotations

import json
import logging
import socket
import subprocess
from pathlib import Path

from sqlalchemy import insert, select, update

from src.config import get_settings
from src.services.vehicsim import tables as t
from src.services.vehicsim.bundle import (
    KINEMATIC_SIMULATOR,
    BundleError,
    RunSpec,
    carla_simulator,
    make_bundle,
    read_result,
)
from src.services.vehicsim.common import InvalidRequestError, NotFoundError, aeb_values, engine, now
from src.services.vehicsim.evaluation import evaluate
from src.services.vehicsim.simulator import DT, MAX_DURATION_S, AebParams, PedestrianCrossingCase, VehicleSpec, simulate

logger = logging.getLogger(__name__)

REPO_ROOT = Path(__file__).resolve().parents[3]


class SimulatorError(RuntimeError):
    """Bộ mô phỏng không trả được kết quả (crash, timeout, sai định dạng)."""


def configured_simulator() -> str:
    """Bộ mô phỏng mà cấu hình hiện tại chọn — dùng để lọc baseline cho regression."""
    settings = get_settings()
    if settings.vehicsim_simulator == "carla":
        return carla_simulator(settings.vehicsim_carla_version)
    return KINEMATIC_SIMULATOR


def simulator_for_new_runs() -> str:
    """Như ``configured_simulator`` nhưng từ chối ngay nếu chọn CARLA mà chưa có lệnh gọi."""
    settings = get_settings()
    if settings.vehicsim_simulator == "carla" and not settings.vehicsim_carla_command:
        raise InvalidRequestError("VEHICSIM_SIMULATOR=carla nhưng chưa đặt VEHICSIM_CARLA_COMMAND")
    return configured_simulator()


def is_carla(simulator: str | None) -> bool:
    return bool(simulator) and simulator.startswith("carla-")


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
    chép đúng seed của run baseline (FK ``fk_sr_baseline_run`` ép điều này ở MySQL)
    **và đúng bộ mô phỏng** của nó — kết quả động học không bao giờ được so với CARLA.
    """
    ts = now()
    ids: list[int] = []
    new_run_simulator: str | None = None
    for variant in variants:
        baseline = (baseline_runs or {}).get(variant.id)
        seed = baseline.random_seed if baseline is not None else seed_for(variant.id)
        if baseline is not None:
            simulator = baseline.carla_version
        else:
            new_run_simulator = new_run_simulator or simulator_for_new_runs()
            simulator = new_run_simulator
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
                carla_version=simulator,
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
            spec = spec_for_run(conn, run)
        artifacts: dict = {}
        if is_carla(run.carla_version):
            outcome, artifacts = _simulate_in_subprocess(run, spec)
        else:
            outcome = simulate(spec.case, spec.params, seed=spec.seed, vehicle=spec.vehicle)
        result = evaluate(outcome, spec.params)
        _persist(run_id, outcome, result, artifacts)
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


def spec_for_run(conn, run) -> RunSpec:
    """Đúng những gì bộ mô phỏng nhận cho run này — dùng cho cả chạy lẫn xuất JSON."""
    params = AebParams.from_codes(aeb_values(conn, run.aeb_version_id))
    vehicle_row = conn.execute(select(t.vehicles).where(t.vehicles.c.id == run.vehicle_id)).first()
    env = conn.execute(
        select(t.scenario_environments).where(t.scenario_environments.c.scenario_version_id == run.scenario_version_id)
    ).first()
    version = conn.execute(select(t.aeb_versions).where(t.aeb_versions.c.id == run.aeb_version_id)).first()
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
    return RunSpec(
        case=case,
        params=params,
        vehicle=vehicle,
        seed=int(run.random_seed),
        aeb_label=version.label if version is not None else None,
        vehicle_name=vehicle_row.name,
        source={
            "run_id": run.id,
            "scenario_id": run.scenario_id,
            "scenario_version_id": run.scenario_version_id,
            "aeb_version_id": run.aeb_version_id,
            "simulator": run.carla_version,
        },
    )


def bundle_for_run(conn, run) -> dict:
    """JSON mà nút "Tải JSON chạy CARLA" trả về — chính là đầu vào backend đưa cho bộ mô phỏng."""
    spec = spec_for_run(conn, run)
    return make_bundle(
        case=spec.case,
        params=spec.params,
        vehicle=spec.vehicle,
        seed=spec.seed,
        aeb_label=spec.aeb_label,
        vehicle_name=spec.vehicle_name,
        source=spec.source,
    )


def run_dir(run_id: int) -> Path:
    root = Path(get_settings().vehicsim_data_root)
    if not root.is_absolute():
        root = REPO_ROOT / root
    return root / "runs" / str(run_id)


def _simulate_in_subprocess(run, spec: RunSpec):
    """Gọi CLI mô phỏng (CARLA) với bundle của run; đọc lại ``result.json``.

    Timeout chừa 10 s cho Celery (``task_time_limit`` = ``SIMULATION_TIMEOUT_S``) để
    run được ghi FAILED tử tế thay vì bị giết giữa chừng.
    """
    settings = get_settings()
    command = list(settings.vehicsim_carla_command)
    if not command:
        raise SimulatorError("run cần CARLA nhưng máy này chưa đặt VEHICSIM_CARLA_COMMAND")
    folder = run_dir(run.id)
    folder.mkdir(parents=True, exist_ok=True)
    bundle_path = folder / "bundle.json"
    with engine().connect() as conn:
        bundle = bundle_for_run(conn, run)
    bundle_path.write_text(json.dumps(bundle, ensure_ascii=False), encoding="utf-8")
    result_path = folder / "result.json"
    result_path.unlink(missing_ok=True)
    timeout = max(10, settings.simulation_timeout_s - 10)
    try:
        proc = subprocess.run(
            [*command, str(bundle_path), "--out", str(folder), "--fast"],
            cwd=REPO_ROOT,
            capture_output=True,
            text=True,
            encoding="utf-8",
            errors="replace",
            timeout=timeout,
            check=False,
        )
    except subprocess.TimeoutExpired as exc:
        raise SimulatorError(f"bộ mô phỏng vượt {timeout} s, đã dừng") from exc
    (folder / "simulator.log").write_text(proc.stdout + proc.stderr, encoding="utf-8")
    if proc.returncode != 0 or not result_path.exists():
        tail = (proc.stderr or proc.stdout).strip().splitlines()[-3:]
        raise SimulatorError(f"bộ mô phỏng thoát mã {proc.returncode}: {' | '.join(tail)}")
    try:
        simulator, outcome, artifacts = read_result(json.loads(result_path.read_text(encoding="utf-8")))
    except (json.JSONDecodeError, BundleError) as exc:
        raise SimulatorError(str(exc)) from exc
    if simulator != run.carla_version:
        raise SimulatorError(f"run yêu cầu {run.carla_version} nhưng bộ mô phỏng báo {simulator}")
    return outcome, {"result": str(result_path), **artifacts}


_ARTIFACT_TYPES = {"result": ("RESULT_JSON", "application/json"), "video": ("VIDEO_MP4", "video/mp4")}


def _persist(run_id: int, outcome, result, artifacts: dict | None = None) -> None:
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

        for kind, path in (artifacts or {}).items():
            artifact_type, mime = _ARTIFACT_TYPES.get(kind, ("OTHER", None))
            file = Path(path)
            conn.execute(
                insert(t.simulation_artifacts).values(
                    simulation_run_id=run_id,
                    artifact_type=artifact_type,
                    file_name=file.name,
                    storage_url=str(file),
                    mime_type=mime,
                    file_size_bytes=file.stat().st_size if file.is_file() else None,
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

"""Lần chạy mô phỏng: xếp hàng, thực thi, ghi kết quả (FE-08/09/11/12).

Một ``simulation_runs`` = một biến thể × một phiên bản xe × một AEB version × một
seed × một bộ mô phỏng. Thực thi: dựng ``RunSpec`` (``spec_for_run`` — cũng là thứ
nút "Tải JSON chạy CARLA" xuất ra) -> bộ mô phỏng -> ``evaluation`` -> ghi kết quả
chấm vào chính dòng ``simulation_runs`` + ``collision_events`` + ``failures`` +
``root_causes`` trong **một** transaction, rồi báo cho regression (nếu run thuộc một
regression test) để nó tự chốt khi đủ cặp.

Hai bộ mô phỏng cắm vào cùng hợp đồng (ADR-027), phân biệt bằng
``simulation_runs.simulator_version`` (``simulator_type`` là nhóm KINEMATIC / CARLA):

- ``vehicsim-kinematic-1.0``: chạy ngay trong process (dưới 1 giây/run).
- ``carla-<phiên bản server>``: gọi ``VEHICSIM_CARLA_COMMAND`` (thường là
  ``worker/run_variant.py``) như **tiến trình con có timeout** — CARLA treo thì chỉ
  run đó FAILED, worker vẫn sống. Mỗi run có thư mục riêng
  ``VEHICSIM_DATA_ROOT/runs/<run_id>/`` chứa bundle.json, result.json, video.
"""

from __future__ import annotations

import json
import logging
import os
import signal
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
from src.services.vehicsim.common import (
    InvalidRequestError,
    NotFoundError,
    active_vehicle,
    aeb_values,
    baseline_version,
    engine,
    now,
    vehicle_by_id,
)
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


def simulator_type(simulator: str) -> str:
    """``simulation_runs.simulator_type`` của một ``simulator_version`` (CHECK ở MySQL ép khớp)."""
    return "CARLA" if is_carla(simulator) else "KINEMATIC"


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
    vehicle_version_id: int,
    aeb_version_id: int,
    user_id: int,
    purpose: str = "BASELINE",
    regression_test_id: int | None = None,
    baseline_runs: dict[int, object] | None = None,
) -> list[int]:
    """Tạo các dòng ``simulation_runs`` (PENDING). Chưa dispatch — người gọi dispatch sau commit.

    Với REGRESSION, ``baseline_runs`` = ``{scenario_version_id: run baseline}``: run mới chép
    đúng seed, **đúng bộ mô phỏng** và đúng phiên bản xe của run baseline (FK ``fk_sr_baseline``
    ép điều này ở MySQL) — kết quả động học không bao giờ được so với CARLA.
    """
    ts = now()
    ids: list[int] = []
    new_run_simulator: str | None = None
    for variant in variants:
        baseline = (baseline_runs or {}).get(variant.id)
        seed = baseline.random_seed if baseline is not None else seed_for(variant.id)
        if baseline is not None:
            simulator = baseline.simulator_version
            if baseline.vehicle_version_id != vehicle_version_id:
                raise InvalidRequestError("run baseline dùng phiên bản xe khác — không ghép cặp regression được")
        else:
            new_run_simulator = new_run_simulator or simulator_for_new_runs()
            simulator = new_run_simulator
        run_id = conn.execute(
            insert(t.simulation_runs).values(
                project_id=project_id,
                scenario_id=scenario_id,
                scenario_version_id=variant.id,
                vehicle_version_id=vehicle_version_id,
                aeb_version_id=aeb_version_id,
                simulator_type=simulator_type(simulator),
                simulator_version=simulator,
                fixed_delta_seconds=DT,
                max_duration_s=MAX_DURATION_S,
                regression_test_id=regression_test_id,
                baseline_run_id=baseline.id if baseline is not None else None,
                purpose=purpose,
                random_seed=seed,
                status="PENDING",
                run_config_json=variant.scenario_ir_json,
                created_by_user_id=user_id,
                queued_at=ts,
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
            .values(status="RUNNING", started_at=now(), worker_host=socket.gethostname()[:150])
        )

    try:
        with engine().connect() as conn:
            run = _run_row(conn, run_id)
            spec = spec_for_run(conn, run)
        artifacts: dict = {}
        if is_carla(run.simulator_version):
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
                .values(status="FAILED", error_message=str(exc)[:2000], ended_at=now())
            )
    # Regression tự chốt khi mọi cặp đã xong — kể cả khi run này hỏng (test sẽ ra ERROR).
    from src.services.vehicsim import regression

    regression.on_run_finished(run_id)


def spec_for_run(conn, run) -> RunSpec:
    """Đúng những gì bộ mô phỏng nhận cho run này — dùng cho cả chạy lẫn xuất JSON."""
    params = AebParams.from_codes(aeb_values(conn, run.aeb_version_id))
    vehicle_row = vehicle_by_id(conn, run.vehicle_version_id)
    friction = conn.execute(
        select(t.scenario_versions.c.road_friction).where(t.scenario_versions.c.id == run.scenario_version_id)
    ).scalar()
    version = conn.execute(select(t.aeb_versions).where(t.aeb_versions.c.id == run.aeb_version_id)).first()
    ir = run.run_config_json or {}
    case = PedestrianCrossingCase(
        ego_speed_kmh=float(ir["ego_speed_kmh"]),
        trigger_distance_m=float(ir["trigger_distance_m"]),
        pedestrian_speed_mps=float(ir["pedestrian_speed_mps"]),
        stops_at_curb=bool(ir.get("stops_at_curb", False)),
        weather=ir.get("weather", "CLEAR"),
        time_of_day=ir.get("time_of_day", "DAY"),
        friction=float(friction) if friction is not None else None,
    )
    vehicle = VehicleSpec(
        length_m=float(vehicle_row.length_m),
        width_m=float(vehicle_row.width_m),
        max_brake_decel_mps2=float(vehicle_row.max_brake_decel_mps2),
    )
    source = {
        "run_id": run.id,
        "scenario_id": run.scenario_id,
        "scenario_version_id": run.scenario_version_id,
        "aeb_version_id": run.aeb_version_id,
        "vehicle_version_id": run.vehicle_version_id,
        "simulator": run.simulator_version,
    }
    return RunSpec(
        case=case,
        params=params,
        vehicle=vehicle,
        seed=int(run.random_seed),
        aeb_label=version.label if version is not None else None,
        vehicle_name=vehicle_row.name,
        source=source,
        vehicle_carla=carla_vehicle(vehicle_row),
    )


def carla_vehicle(row) -> dict:
    """Phần thông số xe mà runner CARLA ép vào blueprint (``vehicle_versions`` + ``carla_vehicle_models``).

    Khối lượng luôn ép; hệ số cản và trọng tâm khi có. Ma sát lốp / mô-men phanh chưa gửi:
    đo trên CARLA 0.9.16 thấy đổi chúng không đổi quãng phanh (TD-17). Kích thước không ép
    được (CARLA lấy từ mesh) — gửi để runner đối chiếu với blueprint và báo lệch.
    """
    physics: dict = {"mass": float(row.mass_kg)}
    if row.drag_coefficient is not None:
        physics["drag_coefficient"] = float(row.drag_coefficient)
    if row.center_of_mass_x_m is not None:
        physics["center_of_mass"] = {
            "x": float(row.center_of_mass_x_m),
            "y": float(row.center_of_mass_y_m),
            "z": float(row.center_of_mass_z_m),
        }
    dimensions = {"height_m": float(row.height_m)}
    if row.wheelbase_m is not None:
        dimensions["wheelbase_m"] = float(row.wheelbase_m)
    return {"blueprint": row.carla_blueprint_id, "physics": physics, "dimensions": dimensions}


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
        vehicle_carla=spec.vehicle_carla,
    )


def run_dir(run_id: int) -> Path:
    root = Path(get_settings().vehicsim_data_root)
    if not root.is_absolute():
        root = REPO_ROOT / root
    return root / "runs" / str(run_id)


STOP_GRACE_S = 15
"""Sau khi hết giờ: thời gian chờ CLI tự dọn (xoá actor, trả CARLA về chế độ thường).

Giết cứng ngay thì CARLA giữ lại xe/người đi bộ/cảm biến và kẹt ở chế độ đồng bộ —
đã tái hiện trên CARLA 0.9.16 ngày 01/10/2026 (review chéo bằng Antigravity).
"""


def _subprocess_timeout() -> int:
    """Chừa ``STOP_GRACE_S`` + 10 s trong ``task_time_limit`` của Celery để run được ghi FAILED tử tế."""
    return max(10, get_settings().simulation_timeout_s - STOP_GRACE_S - 10)


def _stop(proc: subprocess.Popen) -> None:
    """Xin dừng cả nhóm tiến trình (CTRL_BREAK / SIGTERM); quá ``STOP_GRACE_S`` mới giết cứng cả cây.

    Cả nhóm chứ không chỉ ``proc``: trên Windows, ``python.exe`` của venv là launcher
    chạy Python thật ở tiến trình con — giết riêng launcher thì mô phỏng vẫn chạy tiếp.
    """
    try:
        if os.name == "nt":
            proc.send_signal(signal.CTRL_BREAK_EVENT)
        else:
            os.killpg(proc.pid, signal.SIGTERM)
        proc.wait(timeout=STOP_GRACE_S)
        return
    except (OSError, subprocess.TimeoutExpired):
        pass
    if os.name == "nt":
        subprocess.run(["taskkill", "/F", "/T", "/PID", str(proc.pid)], capture_output=True, check=False)
    else:
        try:
            os.killpg(proc.pid, signal.SIGKILL)
        except OSError:
            pass
    proc.wait()


def _simulate_in_subprocess(run, spec: RunSpec):
    """Gọi CLI mô phỏng (CARLA) với bundle của run; đọc lại ``result.json``."""
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
    timeout = _subprocess_timeout()
    # Nhóm tiến trình riêng để gửi tín hiệu dừng cho cả CLI lẫn con của nó (launcher venv, ffmpeg).
    group = {"creationflags": subprocess.CREATE_NEW_PROCESS_GROUP} if os.name == "nt" else {"start_new_session": True}
    proc = subprocess.Popen(
        [*command, str(bundle_path), "--out", str(folder), "--fast"],
        cwd=REPO_ROOT,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        text=True,
        encoding="utf-8",
        errors="replace",
        **group,
    )
    try:
        stdout, stderr = proc.communicate(timeout=timeout)
    except subprocess.TimeoutExpired as exc:
        _stop(proc)
        stdout, stderr = proc.communicate()
        (folder / "simulator.log").write_text(stdout + stderr, encoding="utf-8")
        raise SimulatorError(f"bộ mô phỏng vượt {timeout} s, đã dừng (mã thoát {proc.returncode})") from exc
    (folder / "simulator.log").write_text(stdout + stderr, encoding="utf-8")
    if proc.returncode != 0 or not result_path.exists():
        tail = (stderr or stdout).strip().splitlines()[-3:]
        raise SimulatorError(f"bộ mô phỏng thoát mã {proc.returncode}: {' | '.join(tail)}")
    try:
        simulator, outcome, artifacts = read_result(json.loads(result_path.read_text(encoding="utf-8")))
    except (json.JSONDecodeError, BundleError) as exc:
        raise SimulatorError(str(exc)) from exc
    if simulator != run.simulator_version:
        raise SimulatorError(f"run yêu cầu {run.simulator_version} nhưng bộ mô phỏng báo {simulator}")
    return outcome, {"result": str(result_path), **artifacts}


_ARTIFACT_TYPES = {"result": ("RESULT_FILE", "application/json"), "video": ("VIDEO_MP4", "video/mp4")}

# evaluation.Evaluation.aeb_result -> cột kết quả của simulation_runs.
_RESULT_COLUMNS = {
    "verdict": "verdict",
    "collision": "collision_occurred",
    "aeb_triggered": "aeb_activated",
    "aeb_trigger_time_s": "aeb_activation_time_s",
    "false_activation": "is_false_positive",
    "missed_activation": "is_false_negative",
    "impact_speed_mps": "impact_speed_mps",
    "min_distance_m": "min_distance_m",
    "min_ttc_s": "min_ttc_s",
    "braking_latency_s": "braking_response_time_s",
    "max_deceleration_mps2": "max_deceleration_mps2",
    "mean_deceleration_mps2": "mean_deceleration_mps2",
    "max_jerk_mps3": "max_jerk_mps3",
    "stopping_distance_m": "stopping_distance_m",
}
COLLISION_ACTOR = "walker.pedestrian.0001"  # = WALKER_BLUEPRINT của worker/run_variant.py


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
    carla_case = (outcome.case or {}).get("carla") or {}
    with engine().begin() as conn:
        run = _run_row(conn, run_id)
        if m["collision"]:
            collision = next((e for e in outcome.events if e["kind"] == "collision"), None)
            at = collision["t"] if collision else outcome.duration_s
            conn.execute(
                insert(t.collision_events).values(
                    simulation_run_id=run_id,
                    frame=round(at / float(run.fixed_delta_seconds)),
                    simulation_time_s=at,
                    other_actor_type_id=COLLISION_ACTOR,
                    collision_type="FRONT",
                    impact_speed_mps=m["impact_speed_mps"] or 0.0,
                    location_x_m=outcome.crossing_x,
                    location_y_m=outcome.frames[-1]["ped_y"] if outcome.frames else None,
                )
            )

        if result.failure is not None:
            primary = result.primary_stage
            failure = result.failure
            failure_id = conn.execute(
                insert(t.failures).values(
                    simulation_run_id=run_id,
                    failure_type=failure["failure_type"],
                    # Khâu của nguyên nhân chính; sát nút mà mọi khâu đạt thì là biên quyết định (ngưỡng TTC).
                    category=primary.stage if primary is not None else "DECISION",
                    severity=failure["severity"],
                    description=failure["description"] or "",
                    detected_by="AUTO",
                    created_date=ts,
                )
            ).inserted_primary_key[0]
            param_ids = {
                r.code: r.id for r in conn.execute(select(t.aeb_parameters.c.id, t.aeb_parameters.c.code)).all()
            }
            for stage in result.chain:
                if stage.passed or stage.cause_code is None:
                    continue
                conn.execute(
                    insert(t.root_causes).values(
                        failure_id=failure_id,
                        category=stage.stage,
                        cause_code=stage.cause_code,
                        aeb_parameter_id=param_ids.get(stage.parameter_code or ""),
                        description=stage.summary,
                        confidence=stage.confidence,
                        is_primary=stage is primary,
                    )
                )

        for kind, path in (artifacts or {}).items():
            artifact_type, mime = _ARTIFACT_TYPES.get(kind, ("LOG", None))
            file = Path(path)
            conn.execute(
                insert(t.simulation_artifacts).values(
                    simulation_run_id=run_id,
                    artifact_type=artifact_type,
                    file_name=file.name,
                    storage_url=str(file),
                    mime_type=mime,
                    file_size_bytes=file.stat().st_size if file.is_file() else None,
                    created_date=ts,
                )
            )

        conn.execute(
            update(t.simulation_runs)
            .where(t.simulation_runs.c.id == run_id)
            .values(
                status="COMPLETED",
                ended_at=ts,
                error_message=None,
                end_reason=outcome.end_reason,
                simulated_duration_s=outcome.duration_s,
                map_name=carla_case.get("map") if is_carla(run.simulator_version) else None,
                first_detection_time_s=m.get("first_detection_t"),
                first_detection_distance_m=m.get("first_detection_distance_m"),
                fcw_activated=m.get("fcw_t") is not None,
                fcw_time_s=m.get("fcw_t"),
                telemetry_json=raw,
                **{column: result.aeb_result[key] for key, column in _RESULT_COLUMNS.items()},
            )
        )


def run_family(*, project_id: int, scenario_id: int, user_id: int, aeb_version_id: int | None = None) -> list[int]:
    """Chạy mọi biến thể của bộ biến thể hiện hành bằng AEB version (mặc định: baseline) trên xe đang dùng."""
    from src.services.vehicsim import family

    with engine().begin() as conn:
        scenario = conn.execute(
            select(t.scenarios).where(t.scenarios.c.id == scenario_id, t.scenarios.c.project_id == project_id)
        ).first()
        if scenario is None:
            raise NotFoundError("scenario family")
        if aeb_version_id is None:
            version = baseline_version(conn, project_id)
        else:
            version = conn.execute(
                select(t.aeb_versions).where(
                    t.aeb_versions.c.id == aeb_version_id, t.aeb_versions.c.project_id == project_id
                )
            ).first()
        if version is None:
            raise NotFoundError("AEB version")
        variants = family.variants_of(conn, family.latest_base_version_id(conn, scenario_id))
        ids = create_runs(
            conn,
            project_id=project_id,
            scenario_id=scenario_id,
            variants=variants,
            vehicle_version_id=active_vehicle(conn, project_id).id,
            aeb_version_id=version.id,
            user_id=user_id,
            purpose="BASELINE" if version.status == "BASELINE" else "EVALUATION",
        )
    dispatch(ids)
    return ids

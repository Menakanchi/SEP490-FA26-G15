"""Mock Worker Runner cho Scenario Forge (Môi trường Dev / Local không có CARLA/GPU).

Script này đóng vai trò như một GPU Worker giả lập:
1. Lấy các job `scenario_validation` đang kẹt ở trạng thái `pending` từ backend (POST /api/v1/internal/jobs) hoặc DB local.
2. Mô phỏng động học xe (kinematics) dựa trên ScenarioSpec/xosc của kịch bản, tạo ra các tick `trajectory.Sample`.
3. Tính toán các chỉ số an toàn (metrics) và chuỗi toạ độ (`trajectory`) bằng chính module chuẩn `worker/trajectory.py`.
4. Nộp kết quả `ExecutionResult` về backend qua `POST /api/v1/internal/jobs/{job_id}/result` để hoàn tất quy trình và đưa dữ liệu trajectory vào DB, sẵn sàng cho trang Chấm ý định (/label).

Cách sử dụng:
    python worker/mock_runner.py --once       # Chạy xử lý hết các job pending hiện tại rồi thoát
    python worker/mock_runner.py              # Chạy dạng daemon lắng nghe hàng đợi
"""

from __future__ import annotations

import argparse
import json
import logging
import os
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path

# Đảm bảo import được worker.trajectory và src.services
ROOT_DIR = Path(__file__).parent.parent.resolve()
if str(ROOT_DIR) not in sys.path:
    sys.path.insert(0, str(ROOT_DIR))

import worker.trajectory as trajectory

BACKEND = os.environ.get("FORGE_BACKEND", "http://localhost:8000").rstrip("/")
POLL_INTERVAL_S = int(os.environ.get("POLL_INTERVAL_S", "5"))

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
log = logging.getLogger("mock_worker")


def _get(path: str, timeout: float = 1.5) -> dict:
    with urllib.request.urlopen(f"{BACKEND}{path}", timeout=timeout) as resp:
        return json.loads(resp.read().decode("utf-8"))


def _post(path: str, payload: dict, timeout: float = 5.0) -> dict:
    req = urllib.request.Request(
        f"{BACKEND}{path}",
        data=json.dumps(payload, ensure_ascii=False).encode("utf-8"),
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        return json.loads(resp.read().decode("utf-8"))


def _fetch_scenario_spec(scenario_id: str) -> dict:
    """Lấy thông tin spec từ backend API hoặc DB local."""
    try:
        data = _get(f"/api/v1/scenarios/{scenario_id}")
        if data.get("spec"):
            return data["spec"]
    except Exception:
        pass

    try:
        from src.services import db
        sc = db.get_scenario(scenario_id)
        if sc and sc.get("spec"):
            spec = sc["spec"]
            if isinstance(spec, str):
                return json.loads(spec)
            return spec
    except Exception:
        pass

    return {}


def simulate_kinematics(scenario_id: str, spec: dict) -> tuple[list[trajectory.Sample], bool]:
    """Sinh ra chuỗi Sample mô phỏng chuyển động thực tế theo spec/maneuver.

    Trả về (samples, had_collision).
    """
    actors = spec.get("actors", [])
    maneuvers = spec.get("maneuvers", [])
    duration_s = float(spec.get("duration_s") or 20.0)

    # Tìm ego và adversary
    ego_actor = next((a for a in actors if a.get("is_ego")), None) or (actors[0] if actors else {})
    adv_actor = next((a for a in actors if not a.get("is_ego")), None) or (actors[1] if len(actors) > 1 else {})

    v_ego_initial = float(ego_actor.get("initial_speed_kmh") or 60.0) / 3.6
    v_adv_initial = float(adv_actor.get("initial_speed_kmh") or 80.0) / 3.6

    adv_pos = adv_actor.get("position", {})
    initial_s_offset = float(adv_pos.get("s_offset_m") or 35.0)
    initial_lane_offset = float(adv_pos.get("lane_offset") or 0.0) * 3.5

    # Tìm maneuver chính
    main_maneuver = maneuvers[0] if maneuvers else {}
    maneuver_type = main_maneuver.get("maneuver", "sudden_brake")
    trigger = main_maneuver.get("trigger", {})
    trigger_time = float(trigger.get("value") or 5.0) if trigger.get("type") == "simulation_time" else 5.0
    target_speed_ms = float(main_maneuver.get("target_speed_kmh") or 20.0) / 3.6

    samples: list[trajectory.Sample] = []
    dt = 0.1
    steps = int(duration_s / dt)

    x_ego = 0.0
    x_adv = initial_s_offset
    v_ego = v_ego_initial
    v_adv = v_adv_initial
    lat_adv = initial_lane_offset
    ego_brake = 0.0
    had_collision = False

    ego_half_w = 0.9
    adv_half_w = 0.9

    for step in range(steps):
        t = round(step * dt, 2)

        # Áp dụng logic chuyển động theo từng loại maneuver khi qua mốc trigger
        if t >= trigger_time:
            if maneuver_type in ("sudden_brake", "stop_in_lane"):
                target = 0.0 if maneuver_type == "stop_in_lane" else target_speed_ms
                if v_adv > target:
                    v_adv = max(target, v_adv - 6.0 * dt)
            elif maneuver_type == "cut_in":
                if abs(lat_adv) > 0.05:
                    lat_adv -= (1.5 * dt) if lat_adv > 0 else (-1.5 * dt)
                else:
                    lat_adv = 0.0
                if v_adv > target_speed_ms:
                    v_adv = max(target_speed_ms, v_adv - 3.0 * dt)
            elif maneuver_type == "lane_drift":
                lat_adv += 0.3 * dt
            elif maneuver_type == "jaywalk":
                lat_adv -= 1.0 * dt
            elif maneuver_type == "wrong_way":
                v_adv = -abs(v_adv_initial)

        # Cập nhật vị trí
        x_ego += v_ego * dt
        x_adv += v_adv * dt

        lon = x_adv - x_ego
        gap_lon = abs(lon) - (ego_half_w + adv_half_w)
        gap_lat = abs(lat_adv) - (ego_half_w + adv_half_w)

        if gap_lon < 0 and gap_lat < 0:
            had_collision = True

        # Phản ứng của Ego nếu khoảng cách quá gần
        if lon > 0 and lon < 15.0 and t >= trigger_time:
            ego_brake = min(1.0, ego_brake + 0.5 * dt)
            v_ego = max(0.0, v_ego - 7.0 * dt * ego_brake)
        else:
            ego_brake = max(0.0, ego_brake - 0.2 * dt)

        samples.append(
            trajectory.Sample(
                t=t,
                longitudinal_m=round(lon, 3),
                lateral_m=round(lat_adv, 3),
                gap_lon_m=round(gap_lon, 3),
                gap_lat_m=round(gap_lat, 3),
                ego_speed_ms=round(v_ego, 3),
                adv_speed_ms=round(v_adv, 3),
                adv_lane_offset_m=round(lat_adv, 3),
                ego_brake=round(ego_brake, 3),
                ego_half_width_m=ego_half_w,
                adv_half_width_m=adv_half_w,
                ego_pose=(round(x_ego, 2), 0.0, 0.0),
                adv_pose=(round(x_adv, 2), round(lat_adv, 2), 180.0 if maneuver_type == "wrong_way" else 0.0),
                lane_centre=(round(x_ego, 2), 0.0),
            )
        )

    return samples, had_collision


def process_job(job: dict) -> bool:
    """Xử lý một job pending và gửi kết quả kèm trajectory."""
    job_id = job["job_id"]
    scenario_id = job["scenario_id"]

    log.info("Mock Worker: Đang xử lý job %s cho scenario %s...", job_id, scenario_id)

    from src.services import db

    scenario = db.get_scenario(scenario_id) or {}
    prev_status = scenario.get("status")

    # Nếu kịch bản đang ở trạng thái khác 'simulation_queued' (chẳng hạn lỡ ở approved_library),
    # chuyển tạm về 'simulation_queued' để đi đúng qua router submit_job_result.
    if prev_status and prev_status != "simulation_queued":
        db.update_scenario_status(scenario_id, "simulation_queued")

    spec = _fetch_scenario_spec(scenario_id)
    samples, had_collision = simulate_kinematics(scenario_id, spec)

    metrics = trajectory.summarise(samples)
    trajectory_points = trajectory.downsample(samples)

    criteria_results = [
        {
            "name": "CollisionTest",
            "result": "FAILURE" if had_collision else "SUCCESS",
            "actual": "collision detected" if had_collision else "no collision",
        },
        {"name": "DrivenDistanceTest", "result": "SUCCESS", "actual": "150m"},
        {"name": "MaxVelocityTest", "result": "SUCCESS", "actual": "80 km/h"},
    ]

    result_payload = {
        "scenario_id": scenario_id,
        "xosc_path": job.get("xosc_path") or f"{scenario_id}.xosc",
        "success": True,
        "criteria_results": criteria_results,
        "metrics": metrics,
        "trajectory": trajectory_points,
        "ego_controller": job.get("ego_controller", "constant_speed"),
        "error": None,
    }

    # Đăng kết quả lên backend API nếu backend đang chạy, nếu không gọi trực tiếp service DB
    submitted_api = False
    try:
        _post(f"/api/v1/internal/jobs/{job_id}/result", result_payload)
        submitted_api = True
        log.info("  -> Đã nộp kết quả qua HTTP API /api/v1/internal/jobs/%s/result", job_id)
    except Exception as exc:
        log.info("  -> HTTP API không khả dụng (%s), ghi trực tiếp DB local...", exc)
        db.update_job_result(job_id, "done", result_payload)

        from src.models.schemas import CriterionResult, VerificationLevel, verification_from_execution
        crit_objs = [CriterionResult.model_validate(c) for c in result_payload["criteria_results"]]
        level = verification_from_execution(result_payload["success"], crit_objs)

        if not db.complete_simulation(scenario_id, level):
            db.set_verification(scenario_id, level)
            db.update_scenario_status(scenario_id, "pending_library_review")
        log.info("  -> Đã cập nhật DB trực tiếp cho job %s", job_id)

    # Khôi phục trạng thái approved_library nếu kịch bản vốn đã ở approved_library trước đó
    if prev_status == "approved_library":
        try:
            if submitted_api:
                _post(
                    f"/api/v1/scenarios/{scenario_id}/review",
                    {
                        "gate": "before_library",
                        "approved": True,
                        "reviewer": "mock_worker",
                        "reason": "Hoàn tất mô phỏng giả lập và phê duyệt thư viện",
                    },
                )
            else:
                db.update_scenario_status(scenario_id, "approved_library")
        except Exception:
            db.update_scenario_status(scenario_id, "approved_library")

    log.info("  -> Xử lý thành công job %s! Scenario %s sẵn sàng chấm nhãn.", job_id, scenario_id)
    return True


def run_mock_worker(once: bool = False) -> None:
    log.info("Mock Worker Runner khởi động (Dev/Local mode).")
    while True:
        pending_jobs = []
        try:
            pending_jobs = _get("/api/v1/internal/jobs", timeout=1.0).get("jobs", [])
        except Exception:
            from src.services import db
            pending_jobs = db.get_pending_jobs()

        if not pending_jobs:
            if once:
                log.info("Không có job pending nào.")
                break
            time.sleep(POLL_INTERVAL_S)
            continue

        for job in pending_jobs:
            process_job(job)

        if once:
            break


def main() -> None:
    parser = argparse.ArgumentParser(description="Mock Worker Runner cho Scenario Forge (Dev/Local)")
    parser.add_argument("--once", action="store_true", help="Chạy xong các job pending hiện tại rồi thoát")
    args = parser.parse_args()
    run_mock_worker(once=args.once)


if __name__ == "__main__":
    main()

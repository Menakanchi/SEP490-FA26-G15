"""Standalone CARLA Simulation Worker for Scenario Forge (ADAS / AEB Testing).

Nâng cấp bộ đo và thu thập dữ liệu chuyên sâu cho bài toán AEB/FCW:
1. Cảm biến (Sensor Attachments):
   - Radar (sensor.other.radar): range=100m, horizontal_fov=30deg -> min_depth & relative_velocity.
   - Collision (sensor.other.collision): bắt va chạm thời gian thực, normal_impulse.
   - IMU (sensor.other.imu): accelerometer (3 trục), gyroscope (vận tốc góc).
   - Cơ chế thu hồi/hủy sensor an toàn trong finally tránh rò rỉ CARLA actors.
2. Đồng bộ & Môi trường (Synchronous Mode 20Hz):
   - fixed_delta_seconds = 0.05s (20 FPS/Hz).
   - Telemetry Ego (x, y, z, km/h, m/s2, brake, throttle, steer).
   - Telemetry Adversary (x, y, speed).
   - Tính Time-To-Collision (TTC) tức thời.
   - Thông số môi trường: precipitation, cloudiness, sun_altitude_angle, road_friction.
3. Đóng gói & Callback:
   - Summary metrics: min_ttc_s, min_gap_m, max_braking_force, collision_detected.
   - Gửi payload chuẩn về POST /api/v1/internal/sim-callback.
"""

from __future__ import annotations

import argparse
import json
import logging
import math
import os
import socket
import subprocess
import sys
import tempfile
import time
import urllib.error
import urllib.request
from dataclasses import asdict, dataclass, field
from pathlib import Path
from typing import Any

# Cấu hình môi trường mặc định
BACKEND_URL = os.environ.get("FORGE_BACKEND", "http://localhost:8000").rstrip("/")
CARLA_HOST = os.environ.get("CARLA_HOST", "127.0.0.1")
CARLA_PORT = int(os.environ.get("CARLA_PORT", "2000"))
CARLA_TM_PORT = int(os.environ.get("CARLA_TM_PORT", "8005"))
SR_ROOT = Path(os.environ.get("SR_ROOT", str(Path.home() / "scenario_runner")))
WORKER_PYTHON = Path(os.environ.get("WORKER_PYTHON", sys.executable))
POLL_INTERVAL_S = int(os.environ.get("POLL_INTERVAL_S", "3"))
CONNECT_TIMEOUT_S = float(os.environ.get("CARLA_CONNECT_TIMEOUT_S", "10.0"))
SIM_TIMEOUT_S = int(os.environ.get("SIM_TIMEOUT_S", "120"))

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] [AEB-Worker] %(message)s",
)
logger = logging.getLogger("aeb_carla_runner")


# ---------------------------------------------------------------------------
# Data Models cho Telemetry & Sensors
# ---------------------------------------------------------------------------

@dataclass
class RadarReading:
    min_depth_m: float = float("inf")
    relative_velocity_ms: float = 0.0
    detected: bool = False


@dataclass
class ImuReading:
    accel_x: float = 0.0
    accel_y: float = 0.0
    accel_z: float = 0.0
    gyro_x: float = 0.0
    gyro_y: float = 0.0
    gyro_z: float = 0.0


@dataclass
class CollisionReading:
    detected: bool = False
    normal_impulse: float = 0.0
    other_actor_id: int | None = None


@dataclass
class EnvironmentState:
    precipitation: float = 0.0
    cloudiness: float = 0.0
    sun_altitude_angle: float = 0.0
    wetness: float = 0.0
    road_friction: float = 1.0


@dataclass
class TelemetryTick:
    timestamp: float
    frame: int
    ego: dict[str, Any]
    adversary: dict[str, Any] | None
    sensors: dict[str, Any]
    safety_metrics: dict[str, Any]
    environment: dict[str, Any]


# ---------------------------------------------------------------------------
# Quản lý Sensor & Đồng bộ CARLA
# ---------------------------------------------------------------------------

class CarlaSensorManager:
    """Khởi tạo, thu thập callback và dọn dẹp các cảm biến gắn trên Ego Vehicle."""

    def __init__(self, world: Any, ego_actor: Any) -> None:
        self.world = world
        self.ego = ego_actor
        self.bp_lib = world.get_blueprint_library()
        self.actors: list[Any] = []

        # Latest sensor states
        self.radar_state = RadarReading()
        self.imu_state = ImuReading()
        self.collision_state = CollisionReading()

    def setup_sensors(self) -> None:
        import carla

        # 1. Gắn Radar ở cản trước xe Ego
        radar_bp = self.bp_lib.find("sensor.other.radar")
        radar_bp.set_attribute("horizontal_fov", "30")
        radar_bp.set_attribute("vertical_fov", "10")
        radar_bp.set_attribute("range", "100")
        radar_bp.set_attribute("points_per_second", "1500")

        # Cản trước xe: x ~ +2.2m, z ~ +0.8m
        radar_tf = carla.Transform(carla.Location(x=2.2, z=0.8), carla.Rotation(pitch=0, yaw=0, roll=0))
        radar_actor = self.world.spawn_actor(radar_bp, radar_tf, attach_to=self.ego)
        radar_actor.listen(self._on_radar_data)
        self.actors.append(radar_actor)
        logger.info("-> Đã gắn sensor.other.radar (range=100m, fov=30°)")

        # 2. Gắn Cảm biến Va chạm (Collision Sensor)
        col_bp = self.bp_lib.find("sensor.other.collision")
        col_tf = carla.Transform()
        col_actor = self.world.spawn_actor(col_bp, col_tf, attach_to=self.ego)
        col_actor.listen(self._on_collision_data)
        self.actors.append(col_actor)
        logger.info("-> Đã gắn sensor.other.collision")

        # 3. Gắn IMU Sensor
        imu_bp = self.bp_lib.find("sensor.other.imu")
        imu_tf = carla.Transform(carla.Location(x=0.0, z=1.2))
        imu_actor = self.world.spawn_actor(imu_bp, imu_tf, attach_to=self.ego)
        imu_actor.listen(self._on_imu_data)
        self.actors.append(imu_actor)
        logger.info("-> Đã gắn sensor.other.imu (3-axis Accel & Gyro)")

    def _on_radar_data(self, radar_data: Any) -> None:
        min_depth = float("inf")
        rel_vel = 0.0
        found = False

        # Quét các điểm phản xạ radar phía trước trong búp sóng (-15° đến +15°)
        for detect in radar_data:
            if abs(detect.azimuth) <= math.radians(15.0) and detect.depth > 0.3:
                if detect.depth < min_depth:
                    min_depth = detect.depth
                    rel_vel = detect.velocity
                    found = True

        self.radar_state = RadarReading(
            min_depth_m=round(min_depth, 2) if found else float("inf"),
            relative_velocity_ms=round(rel_vel, 2),
            detected=found,
        )

    def _on_collision_data(self, event: Any) -> None:
        impulse = event.normal_impulse
        intensity = math.sqrt(impulse.x**2 + impulse.y**2 + impulse.z**2)
        other_id = event.other_actor.id if event.other_actor else None
        self.collision_state = CollisionReading(
            detected=True,
            normal_impulse=round(intensity, 2),
            other_actor_id=other_id,
        )
        logger.warning("VA CHẠM XẢY RA! Xung lực: %.2f N*s", intensity)

    def _on_imu_data(self, imu_data: Any) -> None:
        acc = imu_data.accelerometer
        gyro = imu_data.gyroscope
        self.imu_state = ImuReading(
            accel_x=round(acc.x, 3),
            accel_y=round(acc.y, 3),
            accel_z=round(acc.z, 3),
            gyro_x=round(gyro.x, 3),
            gyro_y=round(gyro.y, 3),
            gyro_z=round(gyro.z, 3),
        )

    def destroy_all(self) -> None:
        """Hủy sạch sensors để ngăn chặn rò rỉ bộ nhớ CARLA."""
        for actor in self.actors:
            try:
                if actor is not None and actor.is_alive:
                    actor.stop()
                    actor.destroy()
            except Exception as e:
                logger.debug("Lỗi khi hủy actor sensor: %s", e)
        self.actors.clear()
        logger.info("Đã hủy toàn bộ sensors thành công.")


# ---------------------------------------------------------------------------
# Socket & HTTP Helpers
# ---------------------------------------------------------------------------

def check_carla_port(host: str, port: int, timeout: float = 3.0) -> bool:
    try:
        with socket.create_connection((host, port), timeout=timeout):
            return True
    except (OSError, TimeoutError):
        return False


def api_get(endpoint: str) -> dict[str, Any]:
    url = f"{BACKEND_URL}{endpoint}"
    req = urllib.request.Request(url, headers={"Accept": "application/json"})
    with urllib.request.urlopen(req, timeout=15) as resp:
        return json.loads(resp.read().decode("utf-8"))


def api_post(endpoint: str, payload: dict[str, Any]) -> dict[str, Any]:
    url = f"{BACKEND_URL}{endpoint}"
    data = json.dumps(payload, ensure_ascii=False).encode("utf-8")
    req = urllib.request.Request(
        url,
        data=data,
        headers={"Content-Type": "application/json", "Accept": "application/json"},
        method="POST",
    )
    with urllib.request.urlopen(req, timeout=30) as resp:
        return json.loads(resp.read().decode("utf-8"))


# ---------------------------------------------------------------------------
# Tiến trình Chạy Mô phỏng & Thu thập Dữ liệu AEB
# ---------------------------------------------------------------------------

def run_aeb_simulation(job: dict[str, Any]) -> dict[str, Any]:
    """Thực thi kịch bản OpenSCENARIO với cảm biến và chế độ đồng bộ 20Hz."""
    import carla

    scenario_id = job["scenario_id"]
    job_id = job["job_id"]
    xosc_content = job.get("xosc_content") or ""

    if not xosc_content.strip():
        raise ValueError(f"Job {job_id} không có dữ liệu .xosc")

    if not check_carla_port(CARLA_HOST, CARLA_PORT, timeout=CONNECT_TIMEOUT_S):
        raise ConnectionError(f"Không thể kết nối CARLA Server tại {CARLA_HOST}:{CARLA_PORT}")

    # Ghi file .xosc tạm cho ScenarioRunner
    with tempfile.NamedTemporaryFile("w", suffix=".xosc", delete=False, encoding="utf-8") as tmp_file:
        tmp_file.write(xosc_content)
        tmp_xosc_path = tmp_file.name

    client = carla.Client(CARLA_HOST, CARLA_PORT)
    client.set_timeout(CONNECT_TIMEOUT_S)
    world = client.get_world()

    # Lưu cài đặt thế giới ban đầu để phục hồi
    original_settings = world.get_settings()
    sensor_mgr: CarlaSensorManager | None = None
    telemetry_records: list[dict[str, Any]] = []

    # Summary metrics accumulators
    min_ttc = float("inf")
    min_gap = float("inf")
    max_brake = 0.0
    collision_flag = False
    max_impulse = 0.0

    sr_process: subprocess.Popen | None = None
    start_sim_time = time.time()
    error_message: str | None = None

    try:
        # 1. Thiết lập Synchronous Mode (20Hz, delta_time = 0.05s)
        settings = world.get_settings()
        settings.synchronous_mode = True
        settings.fixed_delta_seconds = 0.05
        world.apply_settings(settings)
        logger.info("CARLA chuyển sang Synchronous Mode: 20Hz (fixed_delta_seconds=0.05s)")

        # 2. Khởi chạy ScenarioRunner chạy nền
        sr_script = SR_ROOT / "scenario_runner.py"
        if sr_script.exists():
            cmd = [
                str(WORKER_PYTHON),
                str(sr_script),
                "--openscenario",
                tmp_xosc_path,
                "--host",
                CARLA_HOST,
                "--port",
                str(CARLA_PORT),
                "--trafficManagerPort",
                str(CARLA_TM_PORT),
                "--timeout",
                "60",
                "--sync",
            ]
            logger.info("Bật ScenarioRunner subprocess: %s", " ".join(cmd))
            sr_process = subprocess.Popen(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
        else:
            logger.info("ScenarioRunner không tìm thấy tại %s. Chạy chế độ CARLA direct tick.", SR_ROOT)

        # 3. Chờ xe Ego xuất hiện trong World (tối đa 15s)
        ego_actor: Any = None
        adv_actor: Any = None
        wait_start = time.time()

        while time.time() - wait_start < 15.0 and ego_actor is None:
            world.tick()
            actors = world.get_actors().filter("vehicle.*")
            for act in actors:
                role = act.attributes.get("role_name", "")
                if role in ("hero", "ego_vehicle", "ego"):
                    ego_actor = act
                elif not adv_actor:
                    adv_actor = act
            time.sleep(0.05)

        if not ego_actor:
            raise RuntimeError("Timeout: Không tìm thấy xe Ego ('hero') sau 15 giây spawn kịch bản.")

        logger.info("Đã gắn kết nối vào Ego Vehicle (ID: %d)", ego_actor.id)

        # 4. Gắn các cảm biến vào Ego
        sensor_mgr = CarlaSensorManager(world, ego_actor)
        sensor_mgr.setup_sensors()

        # Cho sensor ấm lên vài frame
        for _ in range(3):
            world.tick()

        # 5. Vòng lặp thu thập Telemetry đồng bộ (Synchronous Tick Loop)
        sim_step = 0
        max_steps = int(SIM_TIMEOUT_S / 0.05)  # Giới hạn an toàn

        while sim_step < max_steps:
            world.tick()
            sim_step += 1
            sim_time = round(sim_step * 0.05, 3)

            # Kiểm tra xem ScenarioRunner đã kết thúc chưa
            if sr_process and sr_process.poll() is not None:
                logger.info("ScenarioRunner đã kết thúc (Exit code: %d).", sr_process.returncode)
                break

            # Kiểm tra trạng thái xe
            if not ego_actor.is_alive:
                break

            # Ego state
            ego_tf = ego_actor.get_transform()
            ego_loc = ego_tf.location
            ego_rot = ego_tf.rotation
            ego_vel = ego_actor.get_velocity()
            ego_spd_kmh = 3.6 * math.sqrt(ego_vel.x**2 + ego_vel.y**2 + ego_vel.z**2)
            ego_spd_ms = ego_spd_kmh / 3.6
            ego_ctrl = ego_actor.get_control()

            if ego_ctrl.brake > max_brake:
                max_brake = ego_ctrl.brake

            # Tìm / cập nhật adversary
            if not adv_actor or not adv_actor.is_alive:
                for act in world.get_actors().filter("vehicle.*"):
                    if act.id != ego_actor.id:
                        adv_actor = act
                        break

            adv_data = None
            dist_centers = 0.0
            adv_spd_ms = 0.0

            if adv_actor and adv_actor.is_alive:
                adv_tf = adv_actor.get_transform()
                adv_loc = adv_tf.location
                adv_vel = adv_actor.get_velocity()
                adv_spd_kmh = 3.6 * math.sqrt(adv_vel.x**2 + adv_vel.y**2)
                adv_spd_ms = adv_spd_kmh / 3.6

                dx = ego_loc.x - adv_loc.x
                dy = ego_loc.y - adv_loc.y
                dist_centers = math.sqrt(dx**2 + dy**2)

                adv_data = {
                    "id": adv_actor.id,
                    "x": round(adv_loc.x, 2),
                    "y": round(adv_loc.y, 2),
                    "speed_kmh": round(adv_spd_kmh, 1),
                }

            # Khoảng cách hình học thực tế (Gap) giữa 2 thân xe
            gap_m = max(0.0, dist_centers - 4.5) if adv_actor else float("inf")
            if gap_m < min_gap:
                min_gap = gap_m

            # Tính Time-To-Collision (TTC)
            # Dùng radar nếu radar phát hiện vật cản trước, nếu không dùng khoảng cách hình học
            closing_speed = ego_spd_ms - adv_spd_ms
            instant_ttc: float | None = None

            if sensor_mgr.radar_state.detected and sensor_mgr.radar_state.relative_velocity_ms < -0.1:
                # Radar velocity âm = khoảng cách đang thu hẹp
                closing_v = abs(sensor_mgr.radar_state.relative_velocity_ms)
                instant_ttc = round(sensor_mgr.radar_state.min_depth_m / closing_v, 2)
            elif closing_speed > 0.2 and gap_m < 80.0:
                instant_ttc = round(gap_m / closing_speed, 2)

            if instant_ttc is not None and instant_ttc > 0 and instant_ttc < min_ttc:
                min_ttc = instant_ttc

            # Collision check
            if sensor_mgr.collision_state.detected:
                collision_flag = True
                if sensor_mgr.collision_state.normal_impulse > max_impulse:
                    max_impulse = sensor_mgr.collision_state.normal_impulse

            # Environment
            cur_weather = world.get_weather()
            env_state = EnvironmentState(
                precipitation=round(cur_weather.precipitation, 1),
                cloudiness=round(cur_weather.cloudiness, 1),
                sun_altitude_angle=round(cur_weather.sun_altitude_angle, 1),
                wetness=round(cur_weather.wetness, 1),
                road_friction=round(max(0.4, 1.0 - (cur_weather.wetness * 0.4 / 100.0)), 2),
            )

            # Ghi frame
            telemetry_records.append({
                "timestamp": sim_time,
                "frame": sim_step,
                "ego": {
                    "x": round(ego_loc.x, 2),
                    "y": round(ego_loc.y, 2),
                    "z": round(ego_loc.z, 2),
                    "yaw": round(ego_rot.yaw, 2),
                    "speed_kmh": round(ego_spd_kmh, 1),
                    "accel_x": sensor_mgr.imu_state.accel_x,
                    "accel_y": sensor_mgr.imu_state.accel_y,
                    "accel_z": sensor_mgr.imu_state.accel_z,
                    "control": {
                        "brake": round(ego_ctrl.brake, 2),
                        "throttle": round(ego_ctrl.throttle, 2),
                        "steer": round(ego_ctrl.steer, 2),
                    },
                },
                "adversary": adv_data,
                "sensors": {
                    "radar": asdict(sensor_mgr.radar_state),
                    "imu": asdict(sensor_mgr.imu_state),
                    "collision": asdict(sensor_mgr.collision_state),
                },
                "safety_metrics": {
                    "ttc_s": instant_ttc,
                    "gap_m": round(gap_m, 2) if gap_m != float("inf") else None,
                },
                "environment": asdict(env_state),
            })

            # Nếu đã xảy ra va chạm mạnh kéo dài hơn 1.5 giây thì dừng sớm
            if collision_flag and sim_step * 0.05 > 4.0:
                time.sleep(1.0)
                break

    except Exception as exc:
        logger.error("Lỗi trong quá trình mô phỏng AEB: %s", exc)
        error_message = str(exc)
    finally:
        # Dọn dẹp sạch sẽ sensors và khôi phục world settings
        if sensor_mgr:
            sensor_mgr.destroy_all()

        try:
            world.apply_settings(original_settings)
            logger.info("Đã phục hồi cài đặt gốc của CARLA World.")
        except Exception as e:
            logger.warning("Không thể khôi phục world settings: %s", e)

        if sr_process and sr_process.poll() is None:
            sr_process.terminate()

        if os.path.exists(tmp_xosc_path):
            try:
                os.remove(tmp_xosc_path)
            except OSError:
                pass

    # Downsample telemetry nếu quá lớn trước khi gửi về API
    max_out_frames = 150
    step = max(1, len(telemetry_records) // max_out_frames)
    downsampled_telemetry = telemetry_records[::step] if telemetry_records else []

    # Map sang trajectory 2D view đơn giản tương thích Frontend
    simple_trajectory = [
        {
            "t": r["timestamp"],
            "ego": [r["ego"]["x"], r["ego"]["y"], r["ego"]["yaw"]],
            "adv": [r["adversary"]["x"], r["adversary"]["y"], 0.0] if r["adversary"] else [0.0, 0.0, 0.0],
            "ego_speed": r["ego"]["speed_kmh"],
            "adv_speed": r["adversary"]["speed_kmh"] if r["adversary"] else 0.0,
            "distance": r["safety_metrics"]["gap_m"] or 0.0,
            "collision": r["sensors"]["collision"]["detected"],
        }
        for r in downsampled_telemetry
    ]

    summary_metrics = {
        "min_ttc_s": round(min_ttc, 2) if min_ttc != float("inf") else 99.9,
        "min_gap_m": round(min_gap, 2) if min_gap != float("inf") else 0.0,
        "max_braking_force": round(max_brake, 2),
        "collision_detected": 1.0 if collision_flag else 0.0,
        "max_collision_impulse_ns": round(max_impulse, 2),
        "total_frames_recorded": len(telemetry_records),
    }

    # Đóng gói Payload đầy đủ theo yêu cầu
    payload = {
        "job_id": job_id,
        "scenario_id": scenario_id,
        "success": error_message is None,
        "metrics": summary_metrics,
        "trajectory": simple_trajectory,
        "telemetry_full": downsampled_telemetry,
        "environment": telemetry_records[-1]["environment"] if telemetry_records else {},
        "error": error_message,
    }

    return payload


# ---------------------------------------------------------------------------
# Worker Polling Loop
# ---------------------------------------------------------------------------

def worker_loop(once: bool = False) -> None:
    logger.info("AEB CARLA Worker đã khởi động. Polling URL: %s", BACKEND_URL)
    logger.info("CARLA RPC Target: %s:%d", CARLA_HOST, CARLA_PORT)

    while True:
        try:
            resp = api_get("/api/v1/internal/jobs")
            jobs = resp.get("jobs", [])
            pending_jobs = [j for j in jobs if j.get("status") in ("pending", "simulation_queued")]

            if pending_jobs:
                job = pending_jobs[0]
                job_id = job["job_id"]
                scenario_id = job["scenario_id"]
                logger.info("Nhận job: %s (Kịch bản: %s)", job_id, scenario_id)

                # Claim job
                try:
                    api_post(f"/api/v1/internal/jobs/{job_id}/claim", {"worker_id": "aeb_carla_worker"})
                except Exception as exc:
                    logger.warning("Không thể claim job %s: %s", job_id, exc)
                    continue

                # Run simulation
                result_payload = run_aeb_simulation(job)

                # Callback về Backend API
                callback_sent = False
                try:
                    # Gửi về /api/v1/internal/sim-callback
                    cb_resp = api_post("/api/v1/internal/sim-callback", result_payload)
                    logger.info("Gửi callback thành công qua /sim-callback: %s", cb_resp)
                    callback_sent = True
                except Exception as exc:
                    logger.warning("Callback /sim-callback lỗi, thử fallback sang /result: %s", exc)

                if not callback_sent:
                    try:
                        # Fallback về endpoint chuẩn /api/v1/internal/jobs/{id}/result
                        api_post(f"/api/v1/internal/jobs/{job_id}/result", result_payload)
                        logger.info("Gửi callback thành công qua /result")
                    except Exception as exc:
                        logger.error("Không thể gửi callback kết quả về backend: %s", exc)

                if once:
                    break
            else:
                time.sleep(POLL_INTERVAL_S)

        except urllib.error.URLError:
            logger.debug("Backend chưa kết nối được, chờ %ds...", POLL_INTERVAL_S)
            time.sleep(POLL_INTERVAL_S)
        except KeyboardInterrupt:
            logger.info("Worker dừng theo lệnh người dùng.")
            break
        except Exception as exc:
            logger.error("Lỗi vòng lặp worker: %s", exc)
            time.sleep(POLL_INTERVAL_S)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="AEB CARLA Simulation Worker")
    parser.add_argument("--once", action="store_true", help="Chạy 1 job rồi thoát")
    parser.add_argument("--backend", type=str, default=BACKEND_URL, help="URL Backend")
    parser.add_argument("--carla-host", type=str, default=CARLA_HOST, help="CARLA Host")
    parser.add_argument("--carla-port", type=int, default=CARLA_PORT, help="CARLA Port")
    args = parser.parse_args()

    BACKEND_URL = args.backend.rstrip("/")
    CARLA_HOST = args.carla_host
    CARLA_PORT = args.carla_port

    worker_loop(once=args.once)

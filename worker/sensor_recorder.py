"""Gắn sensor CARLA lên xe ego và ghi dữ liệu cho AEB — chạy song song với ScenarioRunner.

``trajectory.TrajectoryRecorder`` đọc **ground truth** (``get_location``/``get_velocity``):
đúng tuyệt đối nhưng không phải thứ một AEB thật nhìn thấy. File này ghi thứ cảm biến
**đo được**, để so với ground truth. Theo ADR-040 lõi AEB có 4 tham số chỉnh được (TTC Threshold,
Brake Activation Delay, Max Deceleration, Brake Build-up Rate) và 6 hằng số trong lõi AEB Java
(``com.vsos.core``; ``docs/vehicsim/aeb-parameter-ranges.md``):

====================  ===================================  ======================  ==========================
Sensor CARLA          Ghi gì                               Tham số chỉnh được      Hằng số liên quan
====================  ===================================  ======================  ==========================
``other.radar``       khoảng cách, vận tốc tương đối,      TTC Threshold           Relative Velocity,
                      TTC của mục tiêu gần nhất phía trước                         Prediction Horizon
``other.obstacle``    khoảng cách tới actor động phía      —                       Safety Distance Margin
                      trước (tia dò dọc trục xe)
``other.imu``         gia tốc dọc, jerk                    Max Deceleration,       Jerk Limit
                                                           Brake Build-up Rate
``other.collision``   thời điểm, actor, xung lực va chạm   kết quả COLLISION       —
``camera.rgb``        ảnh PNG (tuỳ chọn ``--camera``)      —                       Detection Confidence
                                                                                   (cần detector chạy trên ảnh)
ground truth          tốc độ ego, throttle/brake           Brake Activation Delay  Actuator Response Time
====================  ===================================  ======================  ==========================

Ba mục tiêu MOBO tính từ ``frames.csv`` + ``collisions.json`` ở ``TelemetryMetricsService.java`` (backend).

Tất cả sensor là **built-in của CARLA**, tạo qua Python API — không gọi dịch vụ ngoài.

Chỉ **đọc**: dùng ``wait_for_tick()`` chứ không ``tick()``, nên không phá chế độ
synchronous của ScenarioRunner — cùng cơ chế với ``follow_hero.py``.

    python worker/sensor_recorder.py --out out/sensors            # chờ ego, ghi mọi lượt chạy
    python worker/sensor_recorder.py --out out/sensors --camera --once

Mỗi lượt chạy ra một thư mục ``<out>/<YYYYmmdd-HHMMSS>/`` gồm ``frames.csv`` (một dòng
mỗi tick), ``ground_truth.csv`` (một dòng mỗi tick × actor), ``collisions.json``, ``summary.json``
và ``camera/*.png`` nếu bật camera.

``ground_truth.csv`` là trạng thái thật **trong mô phỏng** của ego và mọi người đi bộ/xe khác (kế hoạch
20/10 §5.2): vector vị trí, vận tốc, gia tốc trong hệ tọa độ world của CARLA, kèm frame/timestamp.
File chỉ để chấm và đối chiếu; không đi vào lõi AEB, không đổi ``result.json`` nên không đổi identity run.
"""

from __future__ import annotations

import argparse
import csv
import json
import math
import threading
import time
from pathlib import Path

EGO_ROLE = "hero"

RADAR_FOV_DEG = 30.0
RADAR_RANGE_M = 100.0
RADAR_TARGET_HALF_ANGLE_DEG = 4.0
"""Chỉ điểm radar trong nón ±4° quanh trục xe mới coi là "phía trước"; ở 50 m nón
này rộng ~7 m — vừa đủ một làn kề, không vơ cả lề đường."""

RADAR_MIN_ALTITUDE_DEG = -1.0
"""Bỏ điểm dội từ mặt đường. Radar gắn ở 0,7 m, mặt đường dội về ở góc âm và trông
như một vật cản đứng yên đang lao tới với đúng tốc độ ego — TTC giả."""

MAX_PLAUSIBLE_REL_VELOCITY_MS = 70.0
MAX_PLAUSIBLE_ACCEL_MS2 = 50.0
"""Bỏ số phi vật lý. Lúc ScenarioRunner spawn rồi dịch ego về điểm xuất phát, và lúc
va chạm, IMU báo tới ~190.000 m/s² còn radar báo vận tốc tương đối ~-5.600 m/s
(đo 17/10/2026). Để lọt vào thì "giảm tốc tối đa" và "TTC nhỏ nhất" là số rác."""

SUMMARY_WARMUP_S = 0.5
"""``summary.json`` bỏ nửa giây đầu (CSV vẫn giữ). Lúc khởi tạo, ScenarioRunner đặt lại
tốc độ/vị trí ego: tốc độ thật tụt 8,6 → 6,6 m/s trong 0,03 s (≈ 47 m/s², đo 17/10/2026)
và có lệnh brake ngắn — đó là khởi tạo kịch bản, không phải xe phanh."""

JERK_WINDOW_S = 0.1
"""Jerk lấy đạo hàm gia tốc đã trung bình trên 0,1 s. Đạo hàm thô mỗi tick (~0,015 s)
khuếch đại nhiễu IMU ±0,16 m/s² lên hàng trăm m/s³ dù xe không phanh."""

CAMERA_EVERY_N_FRAMES = 5
CAMERA_REF_STEP_S = 0.05  # bước mô phỏng mà hằng số trên được hiệu chỉnh; bước nhỏ hơn thì lưu ảnh theo cùng khoảng thời gian

FRAME_COLUMNS = [
    "frame",
    "sim_time_s",
    "ego_speed_ms",
    "throttle",
    "brake",
    "steer",
    "imu_accel_x_ms2",
    "imu_jerk_ms3",
    "radar_points",
    "radar_depth_m",
    "radar_rel_velocity_ms",
    "radar_ttc_s",
    "obstacle_distance_m",
    "obstacle_actor",
]

GT_COLUMNS = [
    "frame",
    "sim_time_s",
    "actor_id",
    "role",
    "type_id",
    "x_m",
    "y_m",
    "z_m",
    "yaw_deg",
    "vx_ms",
    "vy_ms",
    "vz_ms",
    "ax_ms2",
    "ay_ms2",
    "az_ms2",
    "speed_ms",
    "a_along_v_ms2",
]

GT_COORDINATES = {
    "frame": "CARLA world",
    "handedness": "left-handed (x, y mặt đất; z hướng lên)",
    "yaw": "độ, quanh trục z",
    "units": {"position": "m", "velocity": "m/s", "acceleration": "m/s^2", "time": "s"},
    "source": "ActorSnapshot của world.wait_for_tick() — ground truth, không phải số đo cảm biến",
}

GT_TARGET_FILTERS = ("walker.pedestrian.*", "vehicle.*")
GT_REFRESH_TARGETS_S = 0.5
"""Danh sách mục tiêu lấy lại mỗi 0,5 s: ScenarioRunner có thể spawn người đi bộ/xe sau ego."""

MIN_SPEED_FOR_DIRECTION_MS = 0.1
"""Dưới tốc độ này hướng chuyển động không xác định: ``a_along_v_ms2`` để trống, không chia cho 0."""


def _vec(v) -> tuple[float, float, float]:  # noqa: ANN001 — carla.Vector3D hoặc giả lập
    return (v.x, v.y, v.z)


def _norm(v: tuple[float, float, float]) -> float:
    return math.sqrt(v[0] ** 2 + v[1] ** 2 + v[2] ** 2)


def accel_along_velocity(velocity: tuple[float, float, float], accel: tuple[float, float, float]) -> float | None:
    """``a_t = dot(a, v) / |v|``: dương là nhanh dần, âm là chậm dần (kế hoạch 20/10 §5.2). Gần đứng yên thì ``None``."""
    speed = _norm(velocity)
    if speed < MIN_SPEED_FOR_DIRECTION_MS:
        return None
    return sum(a * v for a, v in zip(accel, velocity)) / speed


def gt_row(frame: int, actor_id: int, role: str, type_id: str, actor) -> dict:  # noqa: ANN001 — carla.ActorSnapshot
    """Một dòng ``ground_truth.csv`` từ snapshot của một actor ở một frame."""
    tf = actor.get_transform()
    vel, acc = _vec(actor.get_velocity()), _vec(actor.get_acceleration())
    along = accel_along_velocity(vel, acc)
    return {
        "frame": frame,
        "actor_id": actor_id,
        "role": role,
        "type_id": type_id,
        "x_m": round(tf.location.x, 3),
        "y_m": round(tf.location.y, 3),
        "z_m": round(tf.location.z, 3),
        "yaw_deg": round(tf.rotation.yaw, 3),
        "vx_ms": round(vel[0], 3),
        "vy_ms": round(vel[1], 3),
        "vz_ms": round(vel[2], 3),
        "ax_ms2": round(acc[0], 3),
        "ay_ms2": round(acc[1], 3),
        "az_ms2": round(acc[2], 3),
        "speed_ms": round(_norm(vel), 3),
        "a_along_v_ms2": None if along is None else round(along, 3),
    }


def impact_from_ground_truth(collision: dict, gt_rows: list[dict]) -> dict:
    """Tốc độ ngay **trước** va chạm từ ground truth: frame cuối < frame va chạm có cả ego và actor bị đâm.

    Không dùng frame va chạm hay sau đó: lúc ấy vận tốc đã chịu xung lực (kế hoạch 20/10 §5.2). Vận tốc tương đối là
    độ lớn hiệu hai vector — đúng cho cả băng ngang, khác với hiệu hai tốc độ vô hướng. Thiếu dữ liệu thì trả ``{}``,
    không bịa số 0.
    """
    other_id, hit_frame = collision.get("other_actor_id"), collision.get("frame")
    if other_id is None or hit_frame is None:
        return {}
    by_frame: dict[int, dict[str, dict]] = {}
    for r in gt_rows:
        if r["frame"] < hit_frame:
            by_frame.setdefault(r["frame"], {})["ego" if r["role"] == "ego" else r["actor_id"]] = r
    for frame in sorted(by_frame, reverse=True):
        ego, other = by_frame[frame].get("ego"), by_frame[frame].get(other_id)
        if ego is None or other is None:
            continue
        rel = (ego["vx_ms"] - other["vx_ms"], ego["vy_ms"] - other["vy_ms"], ego["vz_ms"] - other["vz_ms"])
        return {
            "gt_frame_before": frame,
            "ego_speed_before_ms": ego["speed_ms"],
            "other_speed_before_ms": other["speed_ms"],
            "relative_speed_before_ms": round(_norm(rel), 3),
        }
    return {}


def summarise_ground_truth(gt_rows: list[dict]) -> dict:
    """Chất lượng ``ground_truth.csv``: số frame, bước thời gian thực, frame bị hụt, actor nào có mặt bao lâu."""
    times = sorted({(r["frame"], r["sim_time_s"]) for r in gt_rows})
    frames = [f for f, _ in times]
    steps = [round(b[1] - a[1], 4) for a, b in zip(times, times[1:])]
    actors: dict[int, dict] = {}
    for r in gt_rows:
        a = actors.setdefault(r["actor_id"], {"actor_id": r["actor_id"], "role": r["role"], "type_id": r["type_id"], "rows": 0})
        a["rows"] += 1
    # Gia tốc phi vật lý: ScenarioRunner dịch xe lúc khởi tạo (đo 13/11/2026: ego −1664 m/s² ở frame đầu) và xung lực va chạm.
    # CSV giữ số thô; ai dùng gia tốc ground truth phải bỏ các khung này, giống SUMMARY_WARMUP_S của frames.csv.
    implausible = [r for r in gt_rows if any(abs(r.get(k) or 0.0) > MAX_PLAUSIBLE_ACCEL_MS2 for k in ("ax_ms2", "ay_ms2", "az_ms2"))]
    return {
        "frames": len(frames),
        "missing_frames": (frames[-1] - frames[0] + 1 - len(frames)) if frames else 0,
        "implausible_accel_rows": len(implausible),
        "implausible_accel_last_t": max((r["sim_time_s"] for r in implausible), default=None),
        "step_s": {"min": min(steps), "max": max(steps), "mean": round(sum(steps) / len(steps), 4)} if steps else None,
        "actors": sorted(actors.values(), key=lambda a: (a["role"] != "ego", a["actor_id"])),
        "coordinates": GT_COORDINATES,
    }


def nearest_radar_target(detections) -> dict | None:  # noqa: ANN001 — carla.RadarMeasurement hoặc list giả lập
    """Điểm radar gần nhất trong nón phía trước, kèm TTC nếu đang tiến lại gần.

    ``velocity`` của CARLA là vận tốc **xuyên tâm tương đối**, âm khi hai vật lại gần.
    """
    best = None
    for det in detections:
        if abs(math.degrees(det.azimuth)) > RADAR_TARGET_HALF_ANGLE_DEG:
            continue
        if math.degrees(det.altitude) < RADAR_MIN_ALTITUDE_DEG:
            continue
        if abs(det.velocity) > MAX_PLAUSIBLE_REL_VELOCITY_MS:
            continue
        if best is None or det.depth < best.depth:
            best = det
    if best is None:
        return None
    closing = -best.velocity
    return {
        "radar_depth_m": round(best.depth, 3),
        "radar_rel_velocity_ms": round(best.velocity, 3),
        "radar_ttc_s": round(best.depth / closing, 3) if closing > 0.1 else None,
    }


def summarise(rows: list[dict], collisions: list[dict]) -> dict:
    """Số tóm tắt một lượt chạy — đọc nhanh mà không mở CSV.

    Chỉ số phanh (giảm tốc, jerk, TTC, lần phanh đầu) chỉ tính trong khoảng
    ``[SUMMARY_WARMUP_S, va chạm đầu tiên)``. Sau va chạm IMU đo xung lực đâm xe
    (~40 m/s² ở ``cut_in``), không phải phanh — số đó nằm riêng ở ``impact_peak_accel_ms2``.
    """
    duration = round(rows[-1]["sim_time_s"] - rows[0]["sim_time_s"], 3) if rows else 0.0
    t_hit = collisions[0]["sim_time_s"] if collisions else None
    before = [r for r in rows if r["sim_time_s"] >= SUMMARY_WARMUP_S and (t_hit is None or r["sim_time_s"] < t_hit)]
    after = [r for r in rows if t_hit is not None and r["sim_time_s"] >= t_hit]

    def values(subset: list[dict], key: str) -> list[float]:
        return [r[key] for r in subset if r.get(key) is not None]

    ttc, obstacle = values(before, "radar_ttc_s"), values(before, "obstacle_distance_m")
    accel, jerk = values(before, "imu_accel_x_ms2"), values(before, "imu_jerk_ms3")
    impact = values(after, "imu_accel_x_ms2")
    first_brake = next((r["sim_time_s"] for r in before if (r.get("brake") or 0) > 0.05), None)
    return {
        "frames": len(rows),
        "duration_s": duration,
        "radar_min_ttc_s": min(ttc) if ttc else None,
        "obstacle_min_distance_m": min(obstacle) if obstacle else None,
        "max_deceleration_ms2": round(-min(accel), 3) if accel and min(accel) < 0 else 0.0,
        "max_abs_jerk_ms3": round(max(abs(j) for j in jerk), 3) if jerk else None,
        "first_brake_time_s": first_brake,
        "collisions": len(collisions),
        "first_collision_time_s": t_hit,
        "impact_peak_accel_ms2": round(max(abs(a) for a in impact), 3) if impact else None,
    }


class SensorRecorder:
    """Gắn sensor lên ego trong một thread riêng; ``stop()`` gỡ sensor và ghi file."""

    def __init__(self, host: str, port: int, out_dir: Path, *, camera: bool = False, step_s: float = CAMERA_REF_STEP_S) -> None:
        self._host, self._port = host, int(port)
        self.out_dir = Path(out_dir)
        self._camera = camera
        self._camera_every = max(1, round(CAMERA_EVERY_N_FRAMES * CAMERA_REF_STEP_S / step_s))
        self._stop = threading.Event()
        self._thread: threading.Thread | None = None
        self._lock = threading.Lock()
        self._sensors: list = []
        self._gt: dict[int, dict] = {}
        self._gt_actors: list[dict] = []
        self._radar: dict[int, dict] = {}
        self._obstacle: dict[int, dict] = {}
        self._imu: dict[int, float] = {}
        self._collisions: list[dict] = []
        self._frame_time: dict[int, float] = {}
        self.error: str | None = None
        self.summary: dict | None = None

    def start(self) -> None:
        self._thread = threading.Thread(target=self._run, name="sensors", daemon=True)
        self._thread.start()

    def wait_finished(self, timeout_s: float | None = None) -> None:
        """Chờ tới khi ego biến mất (lượt chạy kết thúc) rồi mới ghi file."""
        if self._thread is not None:
            self._thread.join(timeout=timeout_s)

    def stop(self, join_timeout_s: float = 10.0) -> dict | None:
        self._stop.set()
        self.wait_finished(join_timeout_s)
        return self.summary

    # -- thread -------------------------------------------------------------

    def _run(self) -> None:
        try:
            import carla  # noqa: PLC0415 — chỉ worker mới có
        except ImportError as exc:
            self.error = f"không import được carla: {exc}"
            return
        try:
            client = carla.Client(self._host, self._port)
            client.set_timeout(20.0)
            ego = world = None
            while not self._stop.is_set() and ego is None:
                # Lấy lại world mỗi vòng: ScenarioRunner load_world() sau khi recorder bật.
                world = client.get_world()
                ego = self._find_ego(world)
                if ego is None:
                    time.sleep(0.2)
            if ego is None:
                return
            self._attach(carla, world, ego)
            self._record(world, ego)
        except Exception as exc:  # noqa: BLE001 — đo hỏng không được làm hỏng lượt chạy
            self.error = f"{type(exc).__name__}: {exc}"
        finally:
            self._detach()
            self._write()

    @staticmethod
    def _find_ego(world):  # noqa: ANN001, ANN205
        for actor in world.get_actors().filter("vehicle.*"):
            if actor.attributes.get("role_name") == EGO_ROLE:
                return actor
        return None

    def _attach(self, carla, world, ego) -> None:  # noqa: ANN001
        lib = world.get_blueprint_library()
        front = carla.Transform(carla.Location(x=2.3, z=0.7))

        radar_bp = lib.find("sensor.other.radar")
        radar_bp.set_attribute("horizontal_fov", str(RADAR_FOV_DEG))
        radar_bp.set_attribute("vertical_fov", "10")
        radar_bp.set_attribute("range", str(RADAR_RANGE_M))
        radar_bp.set_attribute("points_per_second", "3000")
        self._spawn(world, radar_bp, front, ego, self._on_radar)

        obstacle_bp = lib.find("sensor.other.obstacle")
        obstacle_bp.set_attribute("distance", "60")
        obstacle_bp.set_attribute("hit_radius", "0.8")
        obstacle_bp.set_attribute("only_dynamics", "true")
        self._spawn(world, obstacle_bp, front, ego, self._on_obstacle)

        self._spawn(world, lib.find("sensor.other.imu"), carla.Transform(), ego, self._on_imu)
        self._spawn(world, lib.find("sensor.other.collision"), carla.Transform(), ego, self._on_collision)

        if self._camera:
            cam_bp = lib.find("sensor.camera.rgb")
            cam_bp.set_attribute("image_size_x", "800")
            cam_bp.set_attribute("image_size_y", "450")
            cam_bp.set_attribute("fov", "90")
            cam_tf = carla.Transform(carla.Location(x=1.5, z=1.4))
            (self.out_dir / "camera").mkdir(parents=True, exist_ok=True)
            self._spawn(world, cam_bp, cam_tf, ego, self._on_camera)

    def _spawn(self, world, bp, transform, ego, callback) -> None:  # noqa: ANN001
        sensor = world.spawn_actor(bp, transform, attach_to=ego)
        sensor.listen(callback)
        self._sensors.append(sensor)

    @staticmethod
    def _find_targets(world, ego_id: int) -> dict[int, str]:  # noqa: ANN001
        actors = world.get_actors()
        found: dict[int, str] = {}
        for pattern in GT_TARGET_FILTERS:
            for actor in actors.filter(pattern):
                if actor.id != ego_id:
                    found[actor.id] = actor.type_id
        return found

    def _record(self, world, ego) -> None:  # noqa: ANN001
        targets: dict[int, str] = {}
        refreshed_at: float | None = None
        while not self._stop.is_set():
            try:
                snapshot = world.wait_for_tick(5.0)
            except RuntimeError:
                break  # world ngừng tick: ScenarioRunner đã dừng
            ego_snap = snapshot.find(ego.id)
            if ego_snap is None:
                break  # ego đã bị huỷ — lượt chạy kết thúc
            now = snapshot.timestamp.elapsed_seconds
            if refreshed_at is None or now - refreshed_at >= GT_REFRESH_TARGETS_S:
                try:
                    targets = self._find_targets(world, ego.id)
                except RuntimeError:
                    pass  # giữ danh sách cũ; ground truth không được làm hỏng lượt chạy
                refreshed_at = now
            v = ego.get_velocity()
            control = ego.get_control()
            gt = [gt_row(snapshot.frame, ego.id, "ego", ego.type_id, ego_snap)]
            for actor_id, type_id in targets.items():
                snap = snapshot.find(actor_id)
                if snap is not None:
                    gt.append(gt_row(snapshot.frame, actor_id, "target", type_id, snap))
            with self._lock:
                self._frame_time[snapshot.frame] = now
                self._gt_actors.extend(gt)
                self._gt[snapshot.frame] = {
                    "ego_speed_ms": round(math.sqrt(v.x**2 + v.y**2 + v.z**2), 3),
                    "throttle": round(control.throttle, 3),
                    "brake": round(control.brake, 3),
                    "steer": round(control.steer, 3),
                }

    def _detach(self) -> None:
        for sensor in self._sensors:
            try:
                sensor.stop()
                sensor.destroy()
            except RuntimeError:
                pass  # parent đã bị ScenarioRunner huỷ trước
        self._sensors.clear()

    # -- callback (chạy trên thread của CARLA client) ------------------------

    def _on_radar(self, data) -> None:  # noqa: ANN001
        target = nearest_radar_target(data) or {}
        target["radar_points"] = len(data)
        with self._lock:
            self._radar[data.frame] = target
            self._frame_time.setdefault(data.frame, data.timestamp)

    def _on_obstacle(self, event) -> None:  # noqa: ANN001
        with self._lock:
            self._obstacle[event.frame] = {
                "obstacle_distance_m": round(event.distance, 3),
                "obstacle_actor": event.other_actor.type_id if event.other_actor else None,
            }

    def _on_imu(self, data) -> None:  # noqa: ANN001
        with self._lock:
            self._imu[data.frame] = data.accelerometer.x
            self._frame_time.setdefault(data.frame, data.timestamp)

    def _on_collision(self, event) -> None:  # noqa: ANN001
        impulse = event.normal_impulse
        with self._lock:
            self._collisions.append(
                {
                    "frame": event.frame,
                    "sim_time_s": round(event.timestamp, 3),
                    "other_actor": event.other_actor.type_id if event.other_actor else None,
                    "other_actor_id": event.other_actor.id if event.other_actor else None,
                    "impulse_ns": round(math.sqrt(impulse.x**2 + impulse.y**2 + impulse.z**2), 1),
                }
            )

    def _on_camera(self, image) -> None:  # noqa: ANN001
        if image.frame % self._camera_every == 0:
            image.save_to_disk(str(self.out_dir / "camera" / f"{image.frame:08d}.png"))

    # -- ghi file -----------------------------------------------------------

    def rows(self) -> list[dict]:
        with self._lock:
            # Bắt đầu từ tick đầu tiên thấy ego: sensor có thể gửi frame trước đó.
            start = min(self._gt) if self._gt else 0
            frames = sorted(f for f in set(self._gt) | set(self._radar) | set(self._imu) if f >= start)
            t0 = self._frame_time.get(frames[0], 0.0) if frames else 0.0
            rows, prev, window = [], None, []
            for frame in frames:
                row = {"frame": frame, "sim_time_s": round(self._frame_time.get(frame, t0) - t0, 3)}
                row.update(self._gt.get(frame, {}))
                row.update(self._radar.get(frame, {}))
                row.update(self._obstacle.get(frame, {}))
                accel = self._imu.get(frame)
                if accel is not None and abs(accel) <= MAX_PLAUSIBLE_ACCEL_MS2:
                    row["imu_accel_x_ms2"] = round(accel, 3)
                    now = row["sim_time_s"]
                    window = [(t, a) for t, a in window if now - t < JERK_WINDOW_S] + [(now, accel)]
                    smooth = sum(a for _, a in window) / len(window)
                    if prev is not None and now - prev[0] >= JERK_WINDOW_S:
                        row["imu_jerk_ms3"] = round((smooth - prev[1]) / (now - prev[0]), 3)
                        prev = (now, smooth)
                    elif prev is None:
                        prev = (now, smooth)
                rows.append(row)
            return rows

    def ground_truth_rows(self, t0: float) -> list[dict]:
        """Dòng ``ground_truth.csv`` theo thứ tự frame, thời gian tính từ cùng mốc ``t0`` với ``frames.csv``."""
        with self._lock:
            out = []
            for r in self._gt_actors:
                row = dict(r)
                row["sim_time_s"] = round(self._frame_time.get(r["frame"], t0) - t0, 3)
                out.append(row)
            return out

    def _write(self) -> None:
        rows = self.rows()
        if not rows:
            return
        t0 = self._frame_time.get(rows[0]["frame"], 0.0)
        gt_rows = self.ground_truth_rows(t0)
        for c in self._collisions:
            c["sim_time_s"] = round(c["sim_time_s"] - t0, 3)
            c.update(impact_from_ground_truth(c, gt_rows))
        self.out_dir.mkdir(parents=True, exist_ok=True)
        with (self.out_dir / "frames.csv").open("w", newline="", encoding="utf-8") as fh:
            writer = csv.DictWriter(fh, fieldnames=FRAME_COLUMNS, extrasaction="ignore")
            writer.writeheader()
            writer.writerows(rows)
        with (self.out_dir / "ground_truth.csv").open("w", newline="", encoding="utf-8") as fh:
            writer = csv.DictWriter(fh, fieldnames=GT_COLUMNS, extrasaction="ignore")
            writer.writeheader()
            writer.writerows(gt_rows)
        (self.out_dir / "collisions.json").write_text(json.dumps(self._collisions, indent=1), encoding="utf-8")
        self.summary = summarise(rows, self._collisions)
        self.summary["ground_truth"] = summarise_ground_truth(gt_rows)
        if self.error:
            self.summary["error"] = self.error
        (self.out_dir / "summary.json").write_text(json.dumps(self.summary, indent=1), encoding="utf-8")


def main() -> None:
    parser = argparse.ArgumentParser(description="Ghi dữ liệu sensor CARLA của xe ego")
    parser.add_argument("--host", default="127.0.0.1")
    parser.add_argument("--port", type=int, default=2000)
    parser.add_argument("--out", type=Path, default=Path("out/sensors"))
    parser.add_argument("--camera", action="store_true", help=f"Lưu ảnh RGB mỗi {CAMERA_EVERY_N_FRAMES} frame")
    parser.add_argument("--once", action="store_true", help="Ghi đúng một lượt chạy rồi thoát")
    args = parser.parse_args()

    print(f"Chờ xe '{EGO_ROLE}' trên {args.host}:{args.port} … Ctrl-C để dừng.")
    try:
        while True:
            run_dir = args.out / time.strftime("%Y%m%d-%H%M%S")
            recorder = SensorRecorder(args.host, args.port, run_dir, camera=args.camera)
            recorder.start()
            recorder.wait_finished()
            if recorder.summary:
                print(f"Đã ghi {run_dir}: {json.dumps(recorder.summary, ensure_ascii=False)}")
            elif recorder.error:
                print(f"Lỗi: {recorder.error}")
                time.sleep(2)
            if args.once:
                return
    except KeyboardInterrupt:
        recorder.stop()
        print("\nĐã dừng.")


if __name__ == "__main__":
    main()

"""Gắn sensor CARLA lên xe ego và ghi dữ liệu cho AEB — chạy song song với ScenarioRunner.

``trajectory.TrajectoryRecorder`` đọc **ground truth** (``get_location``/``get_velocity``):
đúng tuyệt đối nhưng không phải thứ một AEB thật nhìn thấy. File này ghi thứ cảm biến
**đo được**, để so với ground truth và để ánh xạ vào 10 tham số AEB
(``docs/vehicsim/aeb-parameter-ranges.md``):

====================  ===================================  ===============================
Sensor CARLA          Ghi gì                               Tham số AEB liên quan
====================  ===================================  ===============================
``other.radar``       khoảng cách, vận tốc tương đối,      TTC Threshold, Relative Velocity
                      TTC của mục tiêu gần nhất phía trước Threshold, Prediction Horizon
``other.obstacle``    khoảng cách tới actor động phía      Safety Distance Margin
                      trước (tia dò dọc trục xe)
``other.imu``         gia tốc dọc, jerk                    Max Deceleration, Jerk Limit,
                                                           Brake Build-up Rate
``other.collision``   thời điểm, actor, xung lực va chạm   kết quả COLLISION
``camera.rgb``        ảnh PNG (tuỳ chọn ``--camera``)      Detection Confidence Threshold
                                                           (cần detector chạy trên ảnh)
ground truth          tốc độ ego, throttle/brake           Brake Activation Delay,
                                                           Actuator Response Time
====================  ===================================  ===============================

Tất cả sensor là **built-in của CARLA**, tạo qua Python API — không gọi dịch vụ ngoài.

Chỉ **đọc**: dùng ``wait_for_tick()`` chứ không ``tick()``, nên không phá chế độ
synchronous của ScenarioRunner — cùng cơ chế với ``follow_hero.py``.

    python worker/sensor_recorder.py --out out/sensors            # chờ ego, ghi mọi lượt chạy
    python worker/sensor_recorder.py --out out/sensors --camera --once

Mỗi lượt chạy ra một thư mục ``<out>/<YYYYmmdd-HHMMSS>/`` gồm ``frames.csv`` (một dòng
mỗi tick), ``collisions.json``, ``summary.json`` và ``camera/*.png`` nếu bật camera.
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

RADAR_MOUNT_Z_M = 0.7
RADAR_MIN_ALTITUDE_DEG = -1.0
RADAR_MIN_HIT_HEIGHT_M = 0.3
"""Bỏ điểm dội từ mặt đường. Radar gắn ở 0,7 m, mặt đường dội về ở góc âm và trông
như một vật cản đứng yên đang lao tới với đúng tốc độ ego — TTC giả. Lọc theo góc
thôi là không đủ: mặt đường cách 45 m chỉ ở -0,9° nên lọt qua, và TTC radar báo
~2,5 s suốt đoạn đường trống (vận tốc tương đối đúng bằng -tốc độ ego, đo
17/10/2026). Nên lọc thêm theo độ cao điểm dội: 0,7 m + depth·sin(altitude)."""

MAX_PLAUSIBLE_REL_VELOCITY_MS = 70.0
MAX_PLAUSIBLE_ACCEL_MS2 = 50.0
"""Bỏ số phi vật lý. Lúc ScenarioRunner spawn rồi dịch ego về điểm xuất phát, và lúc
va chạm, IMU báo tới ~190.000 m/s² còn radar báo vận tốc tương đối ~-5.600 m/s
(đo 17/10/2026). Để lọt vào thì "giảm tốc tối đa" và "TTC nhỏ nhất" là số rác."""

SUMMARY_WARMUP_S = 1.0
"""``summary.json`` bỏ giây đầu (CSV vẫn giữ). Lúc khởi tạo, ScenarioRunner đặt lại
tốc độ/vị trí ego: tốc độ thật tụt 8,6 → 6,6 m/s trong 0,03 s (≈ 47 m/s², đo 17/10/2026)
và có lệnh brake ngắn — đó là khởi tạo kịch bản, không phải xe phanh. Đỉnh giảm tốc
-6 … -7 m/s² còn rơi vào 0,58–0,68 s ở cả ba lượt cut_in, nên 0,5 s là chưa đủ."""

JERK_WINDOW_S = 0.1
"""Jerk lấy đạo hàm gia tốc đã trung bình trên 0,1 s. Đạo hàm thô mỗi tick (~0,015 s)
khuếch đại nhiễu IMU ±0,16 m/s² lên hàng trăm m/s³ dù xe không phanh."""

CAMERA_EVERY_N_FRAMES = 5

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
        if RADAR_MOUNT_Z_M + det.depth * math.sin(det.altitude) < RADAR_MIN_HIT_HEIGHT_M:
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


STATIC_TARGET_SPEED_MS = 1.0
"""Mục tiêu radar có vận tốc mặt đất (vận tốc tương đối + tốc độ ego) dưới ngưỡng này
là **vật tĩnh**. Trên Town04, radar thấy rào chắn/sườn đồi ở khúc cua phía trước suốt
đoạn đường trống: TTC ~3 s, vận tốc mặt đất ~0,03 m/s (đo 17/10/2026). Đó là đúng loại
mục tiêu gây phanh oan, nên tách riêng thay vì trộn vào TTC của xe đang tạt đầu."""


def radar_target_is_static(row: dict) -> bool | None:
    rel, ego = row.get("radar_rel_velocity_ms"), row.get("ego_speed_ms")
    if rel is None or ego is None:
        return None
    return abs(rel + ego) < STATIC_TARGET_SPEED_MS


def summarise(rows: list[dict], collisions: list[dict]) -> dict:
    """Số tóm tắt một lượt chạy — đọc nhanh mà không mở CSV.

    ``radar_min_ttc_s`` chỉ tính mục tiêu đang chuyển động; vật tĩnh ở
    ``radar_min_ttc_static_s`` (xem ``STATIC_TARGET_SPEED_MS``).

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

    moving = [r for r in before if radar_target_is_static(r) is False]
    static = [r for r in before if radar_target_is_static(r) is True]
    ttc, ttc_static = values(moving, "radar_ttc_s"), values(static, "radar_ttc_s")
    obstacle = values(before, "obstacle_distance_m")
    accel, jerk = values(before, "imu_accel_x_ms2"), values(before, "imu_jerk_ms3")
    impact = values(after, "imu_accel_x_ms2")
    first_brake = next((r["sim_time_s"] for r in before if (r.get("brake") or 0) > 0.05), None)
    return {
        "frames": len(rows),
        "duration_s": duration,
        "radar_min_ttc_s": min(ttc) if ttc else None,
        "radar_min_ttc_static_s": min(ttc_static) if ttc_static else None,
        "obstacle_min_distance_m": min(obstacle) if obstacle else None,
        "max_deceleration_ms2": round(-min(accel), 3) if accel and min(accel) < 0 else 0.0,
        "max_abs_jerk_ms3": round(max(abs(j) for j in jerk), 3) if jerk else None,
        "first_brake_time_s": first_brake,
        "collisions": len(collisions),
        "first_collision_time_s": t_hit,
        "impact_peak_accel_ms2": round(max(abs(a) for a in impact), 3) if impact else None,
    }


PAYLOAD_MAX_SAMPLES = 400
"""Trần số mẫu gửi về backend (~20 Hz cho lượt 20 s). CSV local vẫn giữ đủ mọi tick."""

SAMPLE_KEYS = (
    "ego_speed_ms",
    "brake",
    "radar_ttc_s",
    "radar_depth_m",
    "radar_rel_velocity_ms",
    "obstacle_distance_m",
    "imu_accel_x_ms2",
)


def to_payload(rows: list[dict], collisions: list[dict], summary: dict, max_samples: int = PAYLOAD_MAX_SAMPLES) -> dict:
    """``rows`` -> ``SensorData`` của backend (``src/models/schemas.py``), giảm mẫu đều.

    ``SensorData`` cấm trường lạ, nên chỉ chép đúng các khoá đã khai — gửi thừa là
    backend trả 422 và mất cả kết quả CARLA.
    """
    stride = max(1, math.ceil(len(rows) / max_samples))
    picked = rows[::stride]
    if rows and picked[-1] is not rows[-1]:
        picked.append(rows[-1])
    samples = [{"t": max(0.0, r["sim_time_s"]), **{k: r.get(k) for k in SAMPLE_KEYS}} for r in picked]
    return {
        "summary": {k: v for k, v in summary.items() if v is None or isinstance(v, (int, float))},
        "samples": samples,
        "collisions": [
            {
                "t": max(0.0, c["sim_time_s"]),
                "other_actor": c.get("other_actor"),
                "impulse_ns": c.get("impulse_ns", 0.0),
            }
            for c in collisions
        ],
    }


class SensorRecorder:
    """Gắn sensor lên ego trong một thread riêng; ``stop()`` gỡ sensor và ghi file."""

    def __init__(self, host: str, port: int, out_dir: Path, *, camera: bool = False) -> None:
        self._host, self._port = host, int(port)
        self.out_dir = Path(out_dir)
        self._camera = camera
        self._stop = threading.Event()
        self._thread: threading.Thread | None = None
        self._lock = threading.Lock()
        self._sensors: list = []
        self._gt: dict[int, dict] = {}
        self._radar: dict[int, dict] = {}
        self._obstacle: dict[int, dict] = {}
        self._imu: dict[int, float] = {}
        self._collisions: list[dict] = []
        self._frame_time: dict[int, float] = {}
        self.error: str | None = None
        self.summary: dict | None = None
        self._payload: dict | None = None
        self._t0: float | None = None

    def start(self) -> None:
        self._thread = threading.Thread(target=self._run, name="sensors", daemon=True)
        self._thread.start()

    def wait_finished(self, timeout_s: float | None = None) -> None:
        """Chờ tới khi ego biến mất (lượt chạy kết thúc) rồi mới ghi file."""
        if self._thread is not None:
            self._thread.join(timeout=timeout_s)

    def camera_frames(self) -> list[dict]:
        """Ảnh camera đã lưu kèm thời điểm (cùng gốc thời gian với ``frames.csv``)."""
        cam_dir = self.out_dir / "camera"
        if self._t0 is None or not cam_dir.is_dir():
            return []
        frames = []
        for png in sorted(cam_dir.glob("*.png")):
            t = self._frame_time.get(int(png.stem))
            if t is not None and t >= self._t0:
                frames.append({"t": round(t - self._t0, 3), "file": png.name})
        return frames

    def payload(self) -> dict | None:
        """``SensorData`` để gửi kèm ``ExecutionResult``; ``None`` nếu không ghi được gì."""
        return self._payload

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

    def _record(self, world, ego) -> None:  # noqa: ANN001
        while not self._stop.is_set():
            try:
                snapshot = world.wait_for_tick(5.0)
            except RuntimeError:
                break  # world ngừng tick: ScenarioRunner đã dừng
            if snapshot.find(ego.id) is None:
                break  # ego đã bị huỷ — lượt chạy kết thúc
            v = ego.get_velocity()
            control = ego.get_control()
            with self._lock:
                self._frame_time[snapshot.frame] = snapshot.timestamp.elapsed_seconds
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
                    "impulse_ns": round(math.sqrt(impulse.x**2 + impulse.y**2 + impulse.z**2), 1),
                }
            )

    def _on_camera(self, image) -> None:  # noqa: ANN001
        if image.frame % CAMERA_EVERY_N_FRAMES == 0:
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

    def _write(self) -> None:
        rows = self.rows()
        if not rows:
            return
        t0 = self._frame_time.get(rows[0]["frame"], 0.0)
        self._t0 = t0
        for c in self._collisions:
            c["sim_time_s"] = round(c["sim_time_s"] - t0, 3)
        self.out_dir.mkdir(parents=True, exist_ok=True)
        with (self.out_dir / "frames.csv").open("w", newline="", encoding="utf-8") as fh:
            writer = csv.DictWriter(fh, fieldnames=FRAME_COLUMNS, extrasaction="ignore")
            writer.writeheader()
            writer.writerows(rows)
        (self.out_dir / "collisions.json").write_text(json.dumps(self._collisions, indent=1), encoding="utf-8")
        self.summary = summarise(rows, self._collisions)
        self._payload = to_payload(rows, self._collisions, self.summary)
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
